<script lang="ts">
	import { resolve } from '$app/paths';
	import { takePendingFile } from '$lib/fileHandoff';
	import { parseJpegMetadata, stripJpegMetadata, type MetadataField } from '$lib/bare/exif';
	import { formatBytes } from '$lib/format';

	type PhotoItem = {
		id: string;
		file: File;
		previewUrl: string;
		status: 'reading' | 'ready' | 'unsupported' | 'error';
		fields: MetadataField[];
		gps?: { lat: number; lon: number };
		metadataBytes: number;
		showFields: boolean;
		stripStatus: 'idle' | 'working' | 'done' | 'error';
		strippedUrl?: string;
		strippedSize?: number;
		errorMessage?: string;
	};

	let items = $state<PhotoItem[]>([]);
	let dragActive = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

	const readyItems = $derived(items.filter((item) => item.status === 'ready'));
	const dirtyItems = $derived(readyItems.filter((item) => item.metadataBytes > 0));
	const strippedCount = $derived(items.filter((item) => item.stripStatus === 'done').length);
	const totalMetadataBytes = $derived(
		readyItems.reduce((sum, item) => sum + item.metadataBytes, 0)
	);

	function mapUrl(gps: { lat: number; lon: number }): string {
		const zoomed = `16/${gps.lat}/${gps.lon}`;
		return `https://www.openstreetmap.org/?mlat=${gps.lat}&mlon=${gps.lon}#map=${zoomed}`;
	}

	// Always look the item back up by id rather than closing over an object reference:
	// the objects handed out by `items.map`/`.find` are Svelte's reactive proxies, but a
	// reference captured before the array was assigned to `items` is the plain pre-proxy
	// object — mutating that silently does nothing to the UI.
	function findItem(id: string): PhotoItem | undefined {
		return items.find((entry) => entry.id === id);
	}

	async function readItem(id: string) {
		const item = findItem(id);
		if (!item) return;
		const isJpeg = item.file.type === 'image/jpeg' || /\.jpe?g$/i.test(item.file.name);
		if (!isJpeg) {
			item.status = 'unsupported';
			return;
		}
		try {
			const buffer = await item.file.arrayBuffer();
			const parsed = parseJpegMetadata(buffer);
			const current = findItem(id);
			if (!current) return;
			current.fields = parsed.fields;
			current.gps = parsed.gps;
			current.metadataBytes = parsed.metadataBytes;
			current.status = 'ready';
		} catch (error) {
			const current = findItem(id);
			if (!current) return;
			current.status = 'error';
			current.errorMessage = error instanceof Error ? error.message : 'Could not read this file.';
		}
	}

	function addFiles(fileList: FileList | File[]) {
		const files = Array.from(fileList);
		const newItems: PhotoItem[] = files.map((file) => ({
			id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
			file,
			previewUrl: URL.createObjectURL(file),
			status: 'reading',
			fields: [],
			metadataBytes: 0,
			showFields: false,
			stripStatus: 'idle'
		}));
		items = [...items, ...newItems];
		for (const item of newItems) readItem(item.id);
	}

	async function stripItem(id: string) {
		const item = findItem(id);
		if (!item) return;
		item.stripStatus = 'working';
		try {
			const result = await stripJpegMetadata(item.file);
			const current = findItem(id);
			if (!current) return;
			if (current.strippedUrl) URL.revokeObjectURL(current.strippedUrl);
			current.strippedUrl = URL.createObjectURL(result.blob);
			current.strippedSize = result.blob.size;
			current.stripStatus = 'done';
		} catch (error) {
			const current = findItem(id);
			if (!current) return;
			current.stripStatus = 'error';
			current.errorMessage = error instanceof Error ? error.message : 'Could not strip this file.';
		}
	}

	async function stripAll() {
		for (const item of dirtyItems) {
			if (item.stripStatus === 'idle') await stripItem(item.id);
		}
	}

	function downloadStripped(item: PhotoItem) {
		if (!item.strippedUrl) return;
		const baseName = item.file.name.replace(/\.[^.]+$/, '');
		const anchor = document.createElement('a');
		anchor.href = item.strippedUrl;
		anchor.download = `${baseName}-bare.jpg`;
		anchor.click();
	}

	async function downloadAllStripped() {
		for (const item of items) {
			if (item.stripStatus === 'done') {
				downloadStripped(item);
				await new Promise((r) => setTimeout(r, 200));
			}
		}
	}

	function removeItem(id: string) {
		const item = items.find((entry) => entry.id === id);
		if (item) {
			URL.revokeObjectURL(item.previewUrl);
			if (item.strippedUrl) URL.revokeObjectURL(item.strippedUrl);
		}
		items = items.filter((entry) => entry.id !== id);
	}

	function clearAll() {
		for (const item of items) {
			URL.revokeObjectURL(item.previewUrl);
			if (item.strippedUrl) URL.revokeObjectURL(item.strippedUrl);
		}
		items = [];
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragActive = false;
		if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
	}

	function onFilePick(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files?.length) addFiles(target.files);
		target.value = '';
	}

	function onPaste(event: ClipboardEvent) {
		const files = Array.from(event.clipboardData?.files ?? []);
		if (files.length) addFiles(files);
	}

	// Landing page's file-drop hub hands off a file here instead of asking for a second drop.
	const handoffFile = takePendingFile();
	if (handoffFile) addFiles([handoffFile]);
</script>

<svelte:window onpaste={onPaste} />

<svelte:head>
	<title>Bare — see and strip hidden photo metadata</title>
	<meta
		name="description"
		content="See exactly what metadata a JPEG carries — camera, timestamp, GPS location — then remove all of it without recompressing a single pixel. Nothing is uploaded."
	/>
</svelte:head>

<div class="page">
	<a class="back" href={resolve('/')}>← all tools</a>

	<header class="intro">
		<h1>Bare</h1>
		<p>
			Every JPEG straight off a phone or camera carries hidden metadata — sometimes an exact GPS
			location. Bare shows you what's there, then strips it byte-for-byte, with no re-encoding and
			no quality loss.
		</p>
	</header>

	<div
		class="dropzone"
		class:active={dragActive}
		ondragover={(event) => {
			event.preventDefault();
			dragActive = true;
		}}
		ondragleave={() => (dragActive = false)}
		ondrop={onDrop}
		onclick={() => fileInput?.click()}
		onkeydown={(event) => {
			if (event.key === 'Enter' || event.key === ' ') fileInput?.click();
		}}
		role="button"
		tabindex="0"
	>
		<p>
			<strong>Drop JPEGs here</strong> or click to browse — you can also paste from the clipboard.
		</p>
		<input
			bind:this={fileInput}
			type="file"
			accept="image/jpeg"
			multiple
			class="visually-hidden"
			onchange={onFilePick}
		/>
	</div>

	{#if items.length > 0}
		<section class="results">
			<div class="results-header">
				<p>
					{items.length} photo{items.length === 1 ? '' : 's'}
					{#if totalMetadataBytes > 0}
						· <span class="saved">{formatBytes(totalMetadataBytes)} of metadata found</span>
					{/if}
				</p>
				<div class="actions">
					{#if dirtyItems.length > 1 && strippedCount < dirtyItems.length}
						<button class="ghost" onclick={stripAll}>Strip all</button>
					{/if}
					{#if strippedCount > 1}
						<button class="ghost" onclick={downloadAllStripped}>Download all</button>
					{/if}
					<button class="ghost" onclick={clearAll}>Clear</button>
				</div>
			</div>

			<ul>
				{#each items as item (item.id)}
					<li>
						<div class="row">
							<img src={item.previewUrl} alt="" />
							<div class="meta">
								<p class="name">{item.file.name}</p>
								{#if item.status === 'reading'}
									<p class="status">Reading…</p>
								{:else if item.status === 'unsupported'}
									<p class="status">Bare only reads JPEG metadata right now.</p>
								{:else if item.status === 'error'}
									<p class="status error">{item.errorMessage}</p>
								{:else if item.status === 'ready'}
									<p class="status">
										{#if item.fields.length > 0}
											<button class="link" onclick={() => (item.showFields = !item.showFields)}>
												{item.showFields ? 'Hide' : 'Show'}
												{item.fields.length} field{item.fields.length === 1 ? '' : 's'}
											</button>
										{:else if item.metadataBytes > 0}
											No camera or location data — just {formatBytes(item.metadataBytes)} of container
											housekeeping (e.g. a JFIF marker).
										{:else}
											No metadata found — already clean.
										{/if}
									</p>
								{/if}
							</div>
							<div class="row-actions">
								{#if item.status === 'ready' && item.metadataBytes > 0}
									{#if item.stripStatus === 'done' && item.strippedUrl}
										<button class="ghost small" onclick={() => downloadStripped(item)}>
											Download clean
										</button>
									{:else}
										<button
											class="ghost small"
											disabled={item.stripStatus === 'working'}
											onclick={() => stripItem(item.id)}
										>
											{item.stripStatus === 'working' ? 'Stripping…' : 'Remove metadata'}
										</button>
									{/if}
								{/if}
								<button class="icon-button" aria-label="Remove" onclick={() => removeItem(item.id)}
									>×</button
								>
							</div>
						</div>

						{#if item.gps}
							<div class="gps-banner">
								<span>
									GPS location embedded: <strong
										>{item.gps.lat.toFixed(5)}, {item.gps.lon.toFixed(5)}</strong
									>
								</span>
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL, not an app route -->
								<a href={mapUrl(item.gps)} target="_blank" rel="noreferrer">View on map ↗</a>
							</div>
						{/if}

						{#if item.showFields && item.fields.length > 0}
							<table class="fields">
								<tbody>
									{#each item.fields as field (field.label)}
										<tr>
											<th>{field.label}</th>
											<td>{field.value}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}

						{#if item.stripStatus === 'done' && item.strippedSize !== undefined}
							<p class="strip-result">
								Clean copy ready — {formatBytes(item.strippedSize)}, {formatBytes(
									item.metadataBytes
								)} of metadata removed, pixels untouched.
							</p>
						{/if}
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

	.back {
		display: inline-block;
		margin-bottom: 1.5rem;
		font-size: 0.85rem;
		color: var(--text-dim);
		text-decoration: none;
	}

	.back:hover {
		color: var(--text);
	}

	.intro h1 {
		font-size: clamp(1.8rem, 4vw, 2.3rem);
		letter-spacing: -0.02em;
	}

	.intro p {
		margin-top: 0.5rem;
		color: var(--text-dim);
		line-height: 1.5;
	}

	.dropzone {
		margin-top: 2rem;
		border: 1.5px dashed var(--border-strong);
		border-radius: 16px;
		padding: clamp(2rem, 6vw, 3rem) 1.5rem;
		text-align: center;
		cursor: pointer;
		color: var(--text-dim);
		transition:
			border-color 0.15s ease,
			background 0.15s ease;
	}

	.dropzone:hover,
	.dropzone.active {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 6%, transparent);
	}

	.dropzone strong {
		color: var(--text);
	}

	.results {
		margin-top: 2rem;
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

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	button.ghost {
		font: inherit;
		font-size: 0.8rem;
		background: transparent;
		border: 1px solid var(--border);
		color: var(--text);
		border-radius: 999px;
		padding: 0.45rem 0.9rem;
		cursor: pointer;
		transition: border-color 0.15s ease;
	}

	button.ghost:hover {
		border-color: var(--border-strong);
	}

	button.ghost:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	button.ghost.small {
		padding: 0.35rem 0.7rem;
		white-space: nowrap;
	}

	button.link {
		font: inherit;
		font-size: 0.8rem;
		background: none;
		border: none;
		padding: 0;
		color: var(--text-dim);
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}

	button.link:hover {
		color: var(--text);
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
		padding: 0.75rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 12px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.9rem;
	}

	.row img {
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

	.gps-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.7rem;
		padding: 0.55rem 0.8rem;
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
		border-radius: 10px;
		font-size: 0.8rem;
	}

	.gps-banner strong {
		font-family: var(--font-mono);
		font-weight: 600;
	}

	.gps-banner a {
		color: var(--accent);
		font-weight: 600;
		text-decoration: none;
		white-space: nowrap;
	}

	.gps-banner a:hover {
		text-decoration: underline;
	}

	.fields {
		width: 100%;
		margin-top: 0.7rem;
		border-collapse: collapse;
		font-size: 0.8rem;
	}

	.fields th,
	.fields td {
		text-align: left;
		padding: 0.35rem 0.6rem 0.35rem 0;
		border-top: 1px solid var(--border);
		font-weight: 400;
	}

	.fields th {
		color: var(--text-dim);
		white-space: nowrap;
		width: 1%;
	}

	.strip-result {
		margin-top: 0.6rem;
		font-size: 0.8rem;
		color: var(--text-dim);
	}
</style>
