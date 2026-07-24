<script lang="ts">
	import { resolve } from '$app/paths';
	import { samplePixels, buildPalette, type RGB, type PaletteColor } from '$lib/swatch/palette';

	type ImageItem = {
		id: string;
		file: File;
		previewUrl: string;
		status: 'reading' | 'ready' | 'error';
		errorMessage?: string;
		pixels?: RGB[];
	};

	type DisplayItem = ImageItem & { colors: PaletteColor[] };

	let items = $state<ImageItem[]>([]);
	let colorCount = $state(6);
	let dragActive = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();
	let copiedKey = $state<string | null>(null);

	// Recomputed straight from `items` + `colorCount` rather than cached on each item —
	// keeps this a pure derived value instead of an effect that writes state back into
	// `items`, so there's no risk of the stale-reference gotcha documented in MEMORY.md.
	const displayItems = $derived<DisplayItem[]>(
		items.map((item) => ({
			...item,
			colors: item.status === 'ready' && item.pixels ? buildPalette(item.pixels, colorCount) : []
		}))
	);

	function findItem(id: string): ImageItem | undefined {
		return items.find((entry) => entry.id === id);
	}

	async function readItem(id: string) {
		const item = findItem(id);
		if (!item) return;
		try {
			const bitmap = await createImageBitmap(item.file);
			const pixels = samplePixels(bitmap);
			bitmap.close();
			const current = findItem(id);
			if (!current) return;
			if (pixels.length === 0) {
				current.status = 'error';
				current.errorMessage = 'This image has no visible pixels to sample.';
				return;
			}
			current.pixels = pixels;
			current.status = 'ready';
		} catch (error) {
			const current = findItem(id);
			if (!current) return;
			current.status = 'error';
			current.errorMessage = error instanceof Error ? error.message : 'Could not read this image.';
		}
	}

	function addFiles(fileList: FileList | File[]) {
		const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
		const newItems: ImageItem[] = files.map((file) => ({
			id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
			file,
			previewUrl: URL.createObjectURL(file),
			status: 'reading'
		}));
		items = [...items, ...newItems];
		for (const item of newItems) readItem(item.id);
	}

	function removeItem(id: string) {
		const item = items.find((entry) => entry.id === id);
		if (item) URL.revokeObjectURL(item.previewUrl);
		items = items.filter((entry) => entry.id !== id);
	}

	function clearAll() {
		for (const item of items) URL.revokeObjectURL(item.previewUrl);
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

	async function copy(text: string, key: string) {
		try {
			await navigator.clipboard.writeText(text);
			copiedKey = key;
			setTimeout(() => {
				if (copiedKey === key) copiedKey = null;
			}, 1200);
		} catch {
			// Clipboard access can be denied by the browser; the swatch text stays
			// selectable either way, so there's nothing more useful to do here.
		}
	}

	function cssVariables(colors: PaletteColor[]): string {
		const lines = colors.map((color, i) => `\t--swatch-${i + 1}: ${color.hex};`);
		return `:root {\n${lines.join('\n')}\n}`;
	}
</script>

<svelte:window onpaste={onPaste} />

<svelte:head>
	<title>Swatch — pull a color palette out of any image</title>
	<meta
		name="description"
		content="Drop in a photo and Swatch extracts its dominant colors as hex, RGB, and HSL — click any swatch to copy. Nothing is uploaded."
	/>
</svelte:head>

<div class="page">
	<a class="back" href={resolve('/')}>← all tools</a>

	<header class="intro">
		<h1>Swatch</h1>
		<p>
			Drop in a photo and Swatch reads its dominant colors straight off the pixels — no AI, no
			guessing, just median-cut quantization running on your device.
		</p>
	</header>

	<section class="controls" aria-label="Palette settings">
		<label>
			<span>Colors — {colorCount}</span>
			<input type="range" min="3" max="10" step="1" bind:value={colorCount} />
		</label>
	</section>

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
			<strong>Drop images here</strong> or click to browse — you can also paste from the clipboard.
		</p>
		<input
			bind:this={fileInput}
			type="file"
			accept="image/*"
			multiple
			class="visually-hidden"
			onchange={onFilePick}
		/>
	</div>

	{#if displayItems.length > 0}
		<section class="results">
			<div class="results-header">
				<p>{displayItems.length} image{displayItems.length === 1 ? '' : 's'}</p>
				<button class="ghost" onclick={clearAll}>Clear</button>
			</div>

			<ul>
				{#each displayItems as item (item.id)}
					<li>
						<div class="row">
							<img src={item.previewUrl} alt="" />
							<div class="meta">
								<p class="name">{item.file.name}</p>
								{#if item.status === 'reading'}
									<p class="status">Reading…</p>
								{:else if item.status === 'error'}
									<p class="status error">{item.errorMessage}</p>
								{:else}
									<p class="status">{item.colors.length} colors</p>
								{/if}
							</div>
							<div class="row-actions">
								{#if item.status === 'ready'}
									<button
										class="ghost small"
										onclick={() => copy(cssVariables(item.colors), `css:${item.id}`)}
									>
										{copiedKey === `css:${item.id}` ? 'Copied!' : 'Copy as CSS'}
									</button>
								{/if}
								<button class="icon-button" aria-label="Remove" onclick={() => removeItem(item.id)}
									>×</button
								>
							</div>
						</div>

						{#if item.status === 'ready'}
							<div class="palette">
								{#each item.colors as color (color.hex)}
									{@const key = `hex:${item.id}:${color.hex}`}
									<button
										class="swatch"
										style:background={color.hex}
										style:color={color.textColor === 'light' ? '#fff' : '#000'}
										onclick={() => copy(color.hex, key)}
									>
										<span class="pct">{Math.round(color.population * 100)}%</span>
										<span class="hex">{copiedKey === key ? 'Copied!' : color.hex}</span>
										<span class="rgb">rgb({color.rgb.r}, {color.rgb.g}, {color.rgb.b})</span>
									</button>
								{/each}
							</div>
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

	input[type='range'] {
		accent-color: var(--accent);
	}

	.dropzone {
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

	button.ghost.small {
		padding: 0.35rem 0.7rem;
		white-space: nowrap;
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

	.palette {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.swatch {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.15rem;
		padding: 0.6rem 0.65rem;
		border: none;
		border-radius: 10px;
		cursor: pointer;
		text-align: left;
		font: inherit;
	}

	.pct {
		font-size: 0.7rem;
		opacity: 0.75;
	}

	.hex {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.rgb {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		opacity: 0.75;
	}
</style>
