<script lang="ts">
	import { resolve } from '$app/paths';
	import { samplePixels } from '$lib/swatch/palette';
	import { formatBytes } from '$lib/format';
	import {
		AUTO_PRESET_ID,
		BACKGROUND_PRESETS,
		DEFAULT_OPTIONS,
		NONE_PRESET_ID,
		RATIOS,
		TRANSPARENT_BACKGROUND,
		backgroundFromPixels,
		backgroundToCss,
		computeLayout,
		renderMat,
		type Background,
		type MatOptions
	} from '$lib/mat/render';

	const MAX_EXPORT_EDGE = 8192;
	const MAX_PREVIEW_EDGE = 1600;
	const DEFAULT_PRESET_ID = 'ember';

	let bitmap = $state<ImageBitmap | null>(null);
	let sourceName = $state('screenshot');
	let sourceSize = $state(0);
	let errorMessage = $state<string | null>(null);
	let dragActive = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();
	let canvasEl: HTMLCanvasElement | undefined = $state();

	let presetId = $state(DEFAULT_PRESET_ID);
	let autoBackground = $state<Background | null>(null);
	let opts = $state<MatOptions>({ ...DEFAULT_OPTIONS });
	let exportScale = $state(2);
	let notice = $state<string | null>(null);
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;

	const activeBackground = $derived.by((): Background => {
		if (presetId === NONE_PRESET_ID) return TRANSPARENT_BACKGROUND;
		if (presetId === AUTO_PRESET_ID) return autoBackground ?? TRANSPARENT_BACKGROUND;
		return (
			BACKGROUND_PRESETS.find((preset) => preset.id === presetId)?.background ??
			DEFAULT_OPTIONS.background
		);
	});

	// The background lives outside `opts` because it comes from the preset choice
	// (and, for "Image", from the image itself) rather than from a bound control —
	// folding it in here keeps rendering a pure function of state, with no effect
	// writing back into the options object.
	const settings = $derived<MatOptions>({ ...opts, background: activeBackground });

	const layout = $derived(bitmap ? computeLayout(bitmap.width, bitmap.height, settings) : null);

	const scaleOptions = $derived(
		[1, 2, 3].filter(
			(scale) =>
				!layout ||
				(layout.width * scale <= MAX_EXPORT_EDGE && layout.height * scale <= MAX_EXPORT_EDGE)
		)
	);

	const exportWidth = $derived(layout ? Math.round(layout.width * exportScale) : 0);
	const exportHeight = $derived(layout ? Math.round(layout.height * exportScale) : 0);

	$effect(() => {
		// Keep the export scale valid when a large image makes 3x (or 2x) exceed
		// what a canvas can hold, rather than silently failing at download time.
		if (!scaleOptions.includes(exportScale)) {
			exportScale = scaleOptions[scaleOptions.length - 1] ?? 1;
		}
	});

	$effect(() => {
		if (!canvasEl || !bitmap || !layout) return;
		// Cap the preview's intrinsic size: crisp on a retina display, but never a
		// 12-megapixel canvas re-rendered on every slider tick.
		const scale = Math.min(2, MAX_PREVIEW_EDGE / Math.max(layout.width, layout.height));
		try {
			renderMat(canvasEl, bitmap, settings, scale);
			errorMessage = null;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Could not draw this image.';
		}
	});

	function flash(message: string) {
		notice = message;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = null), 1600);
	}

	async function loadFile(file: File) {
		if (!file.type.startsWith('image/')) {
			errorMessage = 'That file is not an image.';
			return;
		}
		try {
			const next = await createImageBitmap(file);
			bitmap?.close();
			bitmap = next;
			sourceName = file.name.replace(/\.[^.]+$/, '') || 'screenshot';
			sourceSize = file.size;
			errorMessage = null;
			autoBackground = backgroundFromPixels(samplePixels(next));
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Could not read this image.';
		}
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragActive = false;
		const file = event.dataTransfer?.files?.[0];
		if (file) loadFile(file);
	}

	function onFilePick(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) loadFile(file);
		target.value = '';
	}

	function onPaste(event: ClipboardEvent) {
		const file = event.clipboardData?.files?.[0];
		if (file) loadFile(file);
	}

	function reset() {
		opts = { ...DEFAULT_OPTIONS };
		presetId = DEFAULT_PRESET_ID;
		flash('Settings reset');
	}

	function clearImage() {
		bitmap?.close();
		bitmap = null;
		autoBackground = null;
		sourceSize = 0;
	}

	async function toBlob(): Promise<Blob | null> {
		if (!bitmap) return null;
		const canvas = document.createElement('canvas');
		renderMat(canvas, bitmap, settings, exportScale);
		return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
	}

	async function download() {
		const blob = await toBlob();
		if (!blob) return;
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${sourceName}-mat.png`;
		link.click();
		URL.revokeObjectURL(url);
	}

	async function copyToClipboard() {
		const blob = await toBlob();
		if (!blob) return;
		try {
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
			flash('Copied to clipboard');
		} catch {
			// Image clipboard writes are blocked in some browsers and in non-secure
			// contexts. Say so plainly instead of pretending the copy worked.
			flash('Clipboard blocked — use Download');
		}
	}
</script>

<svelte:window onpaste={onPaste} />

<svelte:head>
	<title>Mat — give a screenshot room to breathe</title>
	<meta
		name="description"
		content="Drop in a screenshot and Mat mounts it on a background with padding, rounded corners, and a soft shadow. Renders entirely in your browser — nothing is uploaded."
	/>
</svelte:head>

<div class="page">
	<a class="back" href={resolve('/')}>← all tools</a>

	<header class="intro">
		<h1>Mat</h1>
		<p>
			Screenshots look better with a little room around them. Drop one in, pick a background, and
			Mat mounts it — padding, rounded corners, a soft shadow — and hands back a PNG. All of it
			drawn on your device.
		</p>
	</header>

	{#if !bitmap}
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
			<p><strong>Drop a screenshot here</strong> or click to browse.</p>
			<p class="hint">You can also paste one straight from the clipboard.</p>
			<input
				bind:this={fileInput}
				type="file"
				accept="image/*"
				class="visually-hidden"
				onchange={onFilePick}
			/>
		</div>
		{#if errorMessage}
			<p class="error">{errorMessage}</p>
		{/if}
	{:else}
		<div class="workspace">
			<div
				class="stage"
				class:active={dragActive}
				ondragover={(event) => {
					event.preventDefault();
					dragActive = true;
				}}
				ondragleave={() => (dragActive = false)}
				ondrop={onDrop}
				role="presentation"
			>
				<canvas bind:this={canvasEl} aria-label="Preview of the mounted screenshot"></canvas>
			</div>

			<div class="panel" aria-label="Settings">
				<div class="panel-head">
					<p class="file">{sourceName}</p>
					<button class="ghost small" onclick={reset}>Reset</button>
				</div>

				<fieldset>
					<legend>Background</legend>
					<div class="swatches">
						{#each BACKGROUND_PRESETS as preset (preset.id)}
							<label class="swatch" class:selected={presetId === preset.id} title={preset.label}>
								<input type="radio" bind:group={presetId} value={preset.id} />
								<span class="chip" style:background={backgroundToCss(preset.background)}></span>
								<span class="swatch-label">{preset.label}</span>
							</label>
						{/each}
						<label
							class="swatch"
							class:selected={presetId === AUTO_PRESET_ID}
							title="Derived from the image"
						>
							<input type="radio" bind:group={presetId} value={AUTO_PRESET_ID} />
							<span
								class="chip"
								style:background={autoBackground ? backgroundToCss(autoBackground) : 'transparent'}
							></span>
							<span class="swatch-label">Image</span>
						</label>
						<label class="swatch" class:selected={presetId === NONE_PRESET_ID} title="Transparent">
							<input type="radio" bind:group={presetId} value={NONE_PRESET_ID} />
							<span class="chip checker"></span>
							<span class="swatch-label">None</span>
						</label>
					</div>
					{#if presetId === AUTO_PRESET_ID}
						<p class="note">Built from the most saturated color Mat found in the image.</p>
					{/if}
				</fieldset>

				<fieldset class="sliders">
					<legend>Mount</legend>
					<label>
						<span>Padding <em>{opts.padding}%</em></span>
						<input type="range" min="0" max="26" step="1" bind:value={opts.padding} />
					</label>
					<label>
						<span>Corners <em>{opts.radius}</em></span>
						<input type="range" min="0" max="100" step="1" bind:value={opts.radius} />
					</label>
					<label>
						<span>Shadow <em>{opts.shadow}</em></span>
						<input type="range" min="0" max="100" step="1" bind:value={opts.shadow} />
					</label>
				</fieldset>

				<fieldset>
					<legend>Shape</legend>
					<div class="segmented">
						{#each RATIOS as ratio (ratio.id)}
							<label class:selected={opts.ratio === ratio.id}>
								<input type="radio" bind:group={opts.ratio} value={ratio.id} />
								{ratio.label}
							</label>
						{/each}
					</div>
					<p class="note">Mat only ever adds background to reach a shape — it never crops.</p>
				</fieldset>

				<fieldset>
					<legend>Extras</legend>
					<label class="toggle">
						<input type="checkbox" bind:checked={opts.frame} />
						<span>Window bar</span>
					</label>
					{#if opts.frame}
						<div class="nested">
							<input
								class="text-input"
								type="text"
								placeholder="Title (optional)"
								maxlength="80"
								bind:value={opts.title}
							/>
							<div class="segmented">
								<label class:selected={opts.frameTheme === 'light'}>
									<input type="radio" bind:group={opts.frameTheme} value="light" />
									Light
								</label>
								<label class:selected={opts.frameTheme === 'dark'}>
									<input type="radio" bind:group={opts.frameTheme} value="dark" />
									Dark
								</label>
							</div>
						</div>
					{/if}
					<label class="toggle" class:disabled={presetId === NONE_PRESET_ID}>
						<input
							type="checkbox"
							bind:checked={opts.grain}
							disabled={presetId === NONE_PRESET_ID}
						/>
						<span>Grain</span>
					</label>
				</fieldset>
			</div>
		</div>

		<div class="export">
			<div class="export-meta">
				<p>
					{bitmap.width} × {bitmap.height}
					{#if sourceSize > 0}<span class="dim"> · {formatBytes(sourceSize)}</span>{/if}
				</p>
				<p class="dim">Exports at {exportWidth} × {exportHeight}</p>
			</div>

			<div class="export-actions">
				<div class="segmented compact">
					{#each scaleOptions as scale (scale)}
						<label class:selected={exportScale === scale}>
							<input type="radio" bind:group={exportScale} value={scale} />
							{scale}×
						</label>
					{/each}
				</div>
				<button class="ghost" onclick={copyToClipboard}>Copy</button>
				<button class="primary" onclick={download}>Download PNG</button>
				<button class="ghost" onclick={clearImage}>New image</button>
			</div>
		</div>

		<p class="notice" aria-live="polite">{notice ?? ''}</p>

		{#if errorMessage}
			<p class="error">{errorMessage}</p>
		{/if}
	{/if}
</div>

<style>
	/* Wider than the 42rem tool default: the preview and its controls need to sit
	   side by side to be usable, the same reason Sift's page is widened. */
	.page {
		max-width: 62rem;
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

	.intro {
		max-width: 38rem;
	}

	.intro h1 {
		font-size: clamp(1.8rem, 4vw, 2.3rem);
		letter-spacing: -0.02em;
	}

	.intro p {
		margin-top: 0.5rem;
		color: var(--text-dim);
		line-height: 1.55;
	}

	.dropzone {
		margin-top: 2rem;
		border: 1.5px dashed var(--border-strong);
		border-radius: 16px;
		padding: clamp(2.5rem, 9vw, 5rem) 1.5rem;
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

	.hint {
		margin-top: 0.4rem;
		font-size: 0.85rem;
	}

	.workspace {
		margin-top: 2rem;
		display: grid;
		gap: 1rem;
		grid-template-columns: minmax(0, 1fr) 19rem;
		align-items: stretch;
	}

	@media (max-width: 56rem) {
		.workspace {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.stage {
		display: grid;
		place-items: center;
		min-height: 18rem;
		padding: clamp(1rem, 3vw, 2rem);
		border: 1px solid var(--border);
		border-radius: 16px;
		background: var(--bg-elevated);
		transition: border-color 0.15s ease;
	}

	.stage.active {
		border-color: var(--accent);
	}

	/* The checkerboard belongs to the canvas, not the stage around it — it should
	   only ever mean "this part of the export is transparent." */
	canvas {
		display: block;
		max-width: 100%;
		max-height: 62vh;
		width: auto;
		height: auto;
		background-color: var(--bg);
		background-image:
			linear-gradient(45deg, var(--border) 25%, transparent 25%),
			linear-gradient(-45deg, var(--border) 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, var(--border) 75%),
			linear-gradient(-45deg, transparent 75%, var(--border) 75%);
		background-size: 16px 16px;
		background-position:
			0 0,
			0 8px,
			8px -8px,
			-8px 0;
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
		padding: 1.1rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 16px;
	}

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.file {
		font-size: 0.85rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		padding: 0;
		margin-bottom: 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dim);
	}

	.note {
		margin-top: 0.55rem;
		font-size: 0.75rem;
		line-height: 1.4;
		color: var(--text-dim);
	}

	.swatches {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.45rem;
	}

	.swatch {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		cursor: pointer;
	}

	.swatch input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.chip {
		width: 100%;
		aspect-ratio: 1;
		border-radius: 8px;
		border: 1px solid var(--border-strong);
		box-shadow: 0 0 0 0 var(--accent);
		transition:
			box-shadow 0.15s ease,
			transform 0.15s ease;
	}

	.swatch:hover .chip {
		transform: translateY(-1px);
	}

	.swatch.selected .chip {
		box-shadow:
			0 0 0 2px var(--bg-elevated),
			0 0 0 4px var(--accent);
	}

	.swatch input:focus-visible + .chip {
		box-shadow:
			0 0 0 2px var(--bg-elevated),
			0 0 0 4px var(--accent);
	}

	.chip.checker {
		background-color: var(--bg);
		background-image:
			linear-gradient(45deg, var(--border-strong) 25%, transparent 25%),
			linear-gradient(-45deg, var(--border-strong) 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, var(--border-strong) 75%),
			linear-gradient(-45deg, transparent 75%, var(--border-strong) 75%);
		background-size: 10px 10px;
		background-position:
			0 0,
			0 5px,
			5px -5px,
			-5px 0;
	}

	.swatch-label {
		font-size: 0.62rem;
		color: var(--text-dim);
		letter-spacing: 0.01em;
	}

	.swatch.selected .swatch-label {
		color: var(--text);
	}

	.sliders {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	.sliders label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.78rem;
		color: var(--text-dim);
	}

	.sliders em {
		font-style: normal;
		font-family: var(--font-mono);
		color: var(--text);
	}

	.sliders label span {
		display: flex;
		justify-content: space-between;
	}

	input[type='range'] {
		width: 100%;
		accent-color: var(--accent);
	}

	.segmented {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.segmented label {
		font-size: 0.75rem;
		padding: 0.35rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		cursor: pointer;
		color: var(--text-dim);
		transition:
			border-color 0.15s ease,
			color 0.15s ease,
			background 0.15s ease;
	}

	.segmented label:hover {
		border-color: var(--border-strong);
		color: var(--text);
	}

	.segmented label.selected {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		color: var(--text);
	}

	.segmented input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.segmented label:focus-within {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.82rem;
		cursor: pointer;
	}

	.toggle + .toggle,
	.nested + .toggle {
		margin-top: 0.6rem;
	}

	.toggle.disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.toggle input {
		accent-color: var(--accent);
	}

	.nested {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.6rem;
		padding-left: 0.9rem;
		border-left: 2px solid var(--border);
	}

	.text-input {
		font: inherit;
		font-size: 0.8rem;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg);
		color: var(--text);
	}

	.text-input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.export {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 1rem;
		margin-top: 1rem;
		padding: 1rem 1.1rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 16px;
	}

	.export-meta p {
		font-size: 0.85rem;
		font-family: var(--font-mono);
	}

	.export-meta .dim {
		color: var(--text-dim);
		font-size: 0.75rem;
	}

	.export-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.segmented.compact label {
		font-family: var(--font-mono);
		padding: 0.3rem 0.55rem;
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
		padding: 0.3rem 0.65rem;
		font-size: 0.75rem;
		white-space: nowrap;
	}

	button.primary {
		font: inherit;
		font-size: 0.8rem;
		background: var(--accent);
		border: 1px solid var(--accent);
		color: var(--accent-text);
		border-radius: 999px;
		padding: 0.45rem 1rem;
		cursor: pointer;
		font-weight: 500;
	}

	button.primary:hover {
		filter: brightness(1.05);
	}

	.notice {
		min-height: 1.2rem;
		margin-top: 0.6rem;
		text-align: right;
		font-size: 0.78rem;
		color: var(--text-dim);
	}

	.error {
		margin-top: 1rem;
		font-size: 0.85rem;
		color: var(--accent);
	}
</style>
