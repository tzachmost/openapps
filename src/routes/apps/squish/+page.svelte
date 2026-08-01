<script lang="ts">
	import ToolHeader from '$lib/components/ToolHeader.svelte';
	import Button from '$lib/components/Button.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import Dropzone from '$lib/components/Dropzone.svelte';
	import { takePendingFile } from '$lib/fileHandoff';
	import {
		compressImage,
		extensionFor,
		formatBytes,
		resolveFormat,
		type OutputFormat
	} from '$lib/squish/compress';

	type ImageItem = {
		id: string;
		file: File;
		previewUrl: string;
		originalSize: number;
		status: 'pending' | 'processing' | 'done' | 'error';
		outputUrl?: string;
		outputSize?: number;
		outputName?: string;
		width?: number;
		height?: number;
		errorMessage?: string;
	};

	const MAX_DIMENSION_OPTIONS = [
		{ label: 'Original size', value: 0 },
		{ label: 'Fit within 2560px', value: 2560 },
		{ label: 'Fit within 1920px', value: 1920 },
		{ label: 'Fit within 1280px', value: 1280 },
		{ label: 'Fit within 800px', value: 800 }
	];

	const FORMAT_CHOICES: { value: OutputFormat; label: string }[] = [
		{ value: 'auto', label: 'Auto' },
		{ value: 'image/jpeg', label: 'JPEG' },
		{ value: 'image/webp', label: 'WebP' },
		{ value: 'image/png', label: 'PNG' }
	];

	let items = $state<ImageItem[]>([]);
	let format = $state<OutputFormat>('auto');
	let quality = $state(0.8);
	let maxDimension = $state(0);

	const qualityMatters = $derived(format !== 'image/png');
	const doneItems = $derived(items.filter((item) => item.status === 'done'));
	const totalOriginal = $derived(items.reduce((sum, item) => sum + item.originalSize, 0));
	const totalOutput = $derived(doneItems.reduce((sum, item) => sum + (item.outputSize ?? 0), 0));
	const totalSavedPct = $derived(
		totalOriginal > 0 && doneItems.length > 0
			? Math.round((1 - totalOutput / totalOriginal) * 100)
			: null
	);
	// The biggest file is the most representative one to estimate against — it's the one
	// most likely to actually matter for the format/quality decision.
	const representativeItem = $derived<ImageItem | null>(
		items.length === 0 ? null : items.reduce((a, b) => (b.originalSize > a.originalSize ? b : a))
	);
	const autoResolvedLabel = $derived(
		representativeItem
			? `Auto (stays ${extensionFor(resolveFormat(representativeItem.file.type, 'auto')).toUpperCase()})`
			: 'Auto'
	);

	async function runWithLimit<T>(list: T[], limit: number, task: (item: T) => Promise<void>) {
		let cursor = 0;
		async function worker() {
			while (cursor < list.length) {
				const item = list[cursor++];
				await task(item);
			}
		}
		await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
	}

	// Look the item back up by id rather than mutating the reference passed in: objects
	// read from `items` are Svelte's reactive proxies, but a reference captured before the
	// array was assigned to `items` (as `newItems` is, on first add) is the plain pre-proxy
	// object — mutating that silently does nothing to the UI.
	function findItem(id: string): ImageItem | undefined {
		return items.find((entry) => entry.id === id);
	}

	async function processItem(id: string) {
		const item = findItem(id);
		if (!item) return;
		item.status = 'processing';
		try {
			const result = await compressImage(item.file, {
				format,
				quality,
				maxDimension: maxDimension || null
			});
			const current = findItem(id);
			if (!current) return;
			if (current.outputUrl) URL.revokeObjectURL(current.outputUrl);
			const mimeType = resolveFormat(current.file.type, format);
			const baseName = current.file.name.replace(/\.[^.]+$/, '');
			current.outputUrl = result.url;
			current.outputSize = result.blob.size;
			current.outputName = `${baseName}-squished.${extensionFor(mimeType)}`;
			current.width = result.width;
			current.height = result.height;
			current.status = 'done';
		} catch (error) {
			const current = findItem(id);
			if (!current) return;
			current.status = 'error';
			current.errorMessage =
				error instanceof Error ? error.message : 'Could not process this image.';
		}
	}

	// Deliberately not automatic: dropping a file only adds it to the list. Compressing —
	// the step that actually produces a converted/resized artifact — needs an explicit click,
	// so settings can be reviewed (or more files added) first rather than being decided the
	// instant a file lands.
	function addFiles(fileList: FileList | File[]) {
		const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
		const newItems: ImageItem[] = files.map((file) => ({
			id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
			file,
			previewUrl: URL.createObjectURL(file),
			originalSize: file.size,
			status: 'pending'
		}));
		items = [...items, ...newItems];
	}

	// Re-processes every item currently in the list with the current settings — including
	// ones already marked "done", if the user changed format/quality/size after an earlier
	// compress and wants to redo it. Nothing reprocesses on its own.
	function compressAll() {
		if (items.length === 0) return;
		runWithLimit(
			items.map((item) => item.id),
			3,
			processItem
		);
	}

	// --- Per-format size estimate: read-only preview info, not a produced artifact, so this
	// one *does* update live as settings change — same "instant preview" the rest of the site
	// uses everywhere except the actual compress step above.
	let estimates = $state<Partial<Record<OutputFormat, number | null>>>({});
	let estimating = $state(false);
	let estimateTimer: ReturnType<typeof setTimeout> | undefined;
	let estimateRunId = 0;

	async function runEstimate() {
		const item = representativeItem;
		if (!item) {
			estimates = {};
			return;
		}
		const runId = ++estimateRunId;
		estimating = true;
		const results = await Promise.all(
			FORMAT_CHOICES.map(async ({ value }) => {
				try {
					const result = await compressImage(item.file, {
						format: value,
						quality,
						maxDimension: maxDimension || null
					});
					URL.revokeObjectURL(result.url);
					return [value, result.blob.size] as const;
				} catch {
					return [value, null] as const;
				}
			})
		);
		if (runId !== estimateRunId) return; // a newer estimate superseded this one
		estimates = Object.fromEntries(results);
		estimating = false;
	}

	function scheduleEstimate() {
		if (estimateTimer) clearTimeout(estimateTimer);
		estimateTimer = setTimeout(runEstimate, 200);
	}

	$effect(() => {
		void representativeItem;
		void quality;
		void maxDimension;
		scheduleEstimate();
	});

	function onPaste(event: ClipboardEvent) {
		const files = Array.from(event.clipboardData?.files ?? []);
		if (files.length) addFiles(files);
	}

	function removeItem(id: string) {
		const item = items.find((entry) => entry.id === id);
		if (item) {
			URL.revokeObjectURL(item.previewUrl);
			if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
		}
		items = items.filter((entry) => entry.id !== id);
	}

	function clearAll() {
		for (const item of items) {
			URL.revokeObjectURL(item.previewUrl);
			if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
		}
		items = [];
	}

	function downloadItem(item: ImageItem) {
		if (!item.outputUrl || !item.outputName) return;
		const anchor = document.createElement('a');
		anchor.href = item.outputUrl;
		anchor.download = item.outputName;
		anchor.click();
	}

	async function downloadAll() {
		for (const item of doneItems) {
			downloadItem(item);
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
	}

	// Landing page's file-drop hub hands off a file here instead of asking for a second drop.
	const handoffFile = takePendingFile();
	if (handoffFile) addFiles([handoffFile]);
</script>

<svelte:window onpaste={onPaste} />

<svelte:head>
	<title>Squish — compress images in your browser</title>
	<meta
		name="description"
		content="Resize and compress photos entirely on your device. Drag in images, tune quality, download — nothing is uploaded."
	/>
</svelte:head>

<div class="page">
	<ToolHeader title="Squish">
		Drop in photos, tune the quality, and decide when you're ready — nothing compresses until you
		say so. Everything stays on this device.
	</ToolHeader>

	<section class="controls" aria-label="Compression settings">
		<label>
			<span>Format</span>
			<select bind:value={format}>
				<option value="auto">Keep original</option>
				<option value="image/jpeg">JPEG</option>
				<option value="image/webp">WebP</option>
				<option value="image/png">PNG</option>
			</select>
		</label>

		<label class:disabled={!qualityMatters}>
			<span>Quality — {Math.round(quality * 100)}%</span>
			<input
				type="range"
				min="0.4"
				max="1"
				step="0.05"
				bind:value={quality}
				disabled={!qualityMatters}
			/>
		</label>

		<label>
			<span>Max dimension</span>
			<select bind:value={maxDimension}>
				{#each MAX_DIMENSION_OPTIONS as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</label>
	</section>

	<Dropzone accept="image/*" multiple onFiles={addFiles}>
		<p>
			<strong>Drop images here</strong> or click to browse — you can also paste from the clipboard.
		</p>
	</Dropzone>

	{#if items.length > 0}
		<Panel class="estimate-panel">
			<p class="estimate-label">
				Estimated at this quality{#if items.length > 1}, for the largest file ({representativeItem
						?.file.name}){/if} — a suggestion, pick whichever fits:
			</p>
			<div class="estimate-rows">
				{#each FORMAT_CHOICES as choice (choice.value)}
					{@const size = estimates[choice.value]}
					{@const pct =
						size != null && representativeItem
							? Math.round((1 - size / representativeItem.originalSize) * 100)
							: null}
					<button
						type="button"
						class="estimate-row"
						class:active={format === choice.value}
						onclick={() => (format = choice.value)}
					>
						<span class="estimate-name"
							>{choice.value === 'auto' ? autoResolvedLabel : choice.label}</span
						>
						<span class="estimate-size">
							{#if estimating && size == null}
								…
							{:else if size != null}
								{formatBytes(size)}
								{#if pct !== null && pct > 0}
									<span class="saved">−{pct}%</span>
								{:else if pct !== null && pct < 0}
									<span class="grown">+{-pct}% larger</span>
								{/if}
							{:else}
								—
							{/if}
						</span>
					</button>
				{/each}
			</div>
		</Panel>

		<section class="results">
			<div class="results-header">
				<p>
					{items.length} image{items.length === 1 ? '' : 's'}
					{#if totalSavedPct !== null}
						· {formatBytes(totalOriginal)} → {formatBytes(totalOutput)}
						{#if totalSavedPct > 0}
							<span class="saved">−{totalSavedPct}%</span>
						{:else if totalSavedPct < 0}
							<span class="grown">+{-totalSavedPct}% larger</span>
						{/if}
					{/if}
				</p>
				<div class="actions">
					<Button variant="primary" size="small" onclick={compressAll}>
						Compress {items.length} image{items.length === 1 ? '' : 's'}
					</Button>
					{#if doneItems.length > 1}
						<Button variant="ghost" size="small" onclick={downloadAll}>Download all</Button>
					{/if}
					<Button variant="ghost" size="small" onclick={clearAll}>Clear</Button>
				</div>
			</div>

			<ul>
				{#each items as item (item.id)}
					<li>
						<img src={item.previewUrl} alt="" />
						<div class="meta">
							<p class="name">{item.file.name}</p>
							{#if item.status === 'pending'}
								<p class="status">Ready — {formatBytes(item.originalSize)}</p>
							{:else if item.status === 'processing'}
								<p class="status">Compressing…</p>
							{:else if item.status === 'error'}
								<p class="status error">{item.errorMessage}</p>
							{:else if item.status === 'done' && item.outputSize !== undefined}
								<p class="status">
									{formatBytes(item.originalSize)} → {formatBytes(item.outputSize)}
									{#if item.outputSize < item.originalSize}
										<span class="saved"
											>−{Math.round((1 - item.outputSize / item.originalSize) * 100)}%</span
										>
									{:else if item.outputSize > item.originalSize}
										<span class="grown"
											>+{Math.round((item.outputSize / item.originalSize - 1) * 100)}% larger</span
										>
									{/if}
									· {item.width}×{item.height}
								</p>
							{/if}
						</div>
						<div class="row-actions">
							<Button
								variant="ghost"
								size="small"
								disabled={item.status !== 'done'}
								onclick={() => downloadItem(item)}
							>
								Download
							</Button>
							<button class="icon-button" aria-label="Remove" onclick={() => removeItem(item.id)}
								>×</button
							>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.page {
		max-width: 42rem;
		margin: 0 auto;
		padding: 0 clamp(1.25rem, 4vw, 3rem) 4rem;
	}

	.controls {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 1rem;
		margin: 2rem 0 1.25rem;
		padding: 1.25rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 14px;
	}

	.controls label {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: var(--text-dim);
	}

	.controls label.disabled {
		opacity: 0.45;
	}

	select,
	input[type='range'] {
		accent-color: var(--accent);
	}

	select {
		font: inherit;
		font-size: 0.9rem;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.45rem 0.6rem;
	}

	:global(.estimate-panel) {
		margin-top: 2rem;
	}

	.estimate-label {
		font-size: 0.82rem;
		color: var(--text-dim);
	}

	.estimate-rows {
		margin-top: 0.75rem;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 0.5rem;
	}

	.estimate-row {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		align-items: flex-start;
		font: inherit;
		text-align: left;
		padding: 0.6rem 0.75rem;
		border: 2px solid var(--border);
		border-radius: 4px;
		background: var(--bg);
		color: var(--text);
		cursor: pointer;
		transition: border-color 0.12s ease;
	}

	.estimate-row:hover {
		border-color: var(--border-strong);
	}

	.estimate-row.active {
		border-color: var(--accent);
	}

	.estimate-name {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-dim);
	}

	.estimate-row.active .estimate-name {
		color: var(--accent);
	}

	.estimate-size {
		font-size: 0.88rem;
	}

	.results {
		margin-top: 1.25rem;
	}

	.results-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.results-header p {
		font-size: 0.9rem;
		color: var(--text-dim);
	}

	.saved {
		color: var(--accent);
		font-weight: 600;
	}

	.grown {
		color: var(--text-dim);
		font-weight: 600;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	li {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		padding: 0.75rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 12px;
	}

	li img {
		width: 3rem;
		height: 3rem;
		object-fit: cover;
		border-radius: 8px;
		flex-shrink: 0;
		background: var(--bg);
	}

	.meta {
		flex: 1;
		min-width: 0;
	}

	.name {
		font-size: 0.9rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.status {
		margin-top: 0.15rem;
		font-size: 0.8rem;
		color: var(--text-dim);
	}

	.status.error {
		color: var(--accent);
	}

	.row-actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.icon-button {
		width: 1.8rem;
		height: 1.8rem;
		display: grid;
		place-items: center;
		border-radius: 50%;
		border: 1px solid transparent;
		background: transparent;
		color: var(--text-dim);
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
	}

	.icon-button:hover {
		color: var(--text);
		border-color: var(--border);
	}
</style>
