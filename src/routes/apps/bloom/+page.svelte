<script lang="ts">
	import { resolve } from '$app/paths';
	import { bloomToCss } from '$lib/bloom/css';
	import {
		BLOOM_PRESETS,
		BLOOM_SIZES,
		DEFAULT_OPTIONS,
		DEFAULT_PRESET_ID,
		MAX_STOPS,
		MIN_STOPS,
		jitterPositions,
		makeStopId,
		renderBloom,
		stopsFromPreset,
		type BloomOptions,
		type Stop
	} from '$lib/bloom/render';

	const MAX_EXPORT_EDGE = 8192;
	const PREVIEW_CAP = 1200;

	const defaultPreset = BLOOM_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID) ?? BLOOM_PRESETS[0];

	let presetId = $state(DEFAULT_PRESET_ID);
	let stops = $state<Stop[]>(stopsFromPreset(defaultPreset));
	let opts = $state<BloomOptions>({ ...DEFAULT_OPTIONS });
	let sizeId = $state(BLOOM_SIZES[0].id);
	let exportScale = $state(1);
	let canvasEl: HTMLCanvasElement | undefined = $state();
	let stageEl: HTMLDivElement | undefined = $state();
	let draggingId: string | null = $state(null);
	let notice = $state<string | null>(null);
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;

	const size = $derived(BLOOM_SIZES.find((s) => s.id === sizeId) ?? BLOOM_SIZES[0]);

	const scaleOptions = $derived(
		[1, 2].filter(
			(scale) => size.width * scale <= MAX_EXPORT_EDGE && size.height * scale <= MAX_EXPORT_EDGE
		)
	);

	$effect(() => {
		if (!scaleOptions.includes(exportScale)) exportScale = scaleOptions[0] ?? 1;
	});

	const previewScale = $derived(Math.min(1, PREVIEW_CAP / Math.max(size.width, size.height)));

	$effect(() => {
		if (!canvasEl) return;
		renderBloom(canvasEl, size.width, size.height, stops, opts, previewScale);
	});

	const css = $derived(bloomToCss(stops, opts));

	function flash(message: string) {
		notice = message;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = null), 1600);
	}

	function applyPreset(id: string) {
		const preset = BLOOM_PRESETS.find((p) => p.id === id);
		if (!preset) return;
		presetId = id;
		stops = stopsFromPreset(preset);
		opts = { ...opts, background: preset.background };
	}

	function addStop() {
		if (stops.length >= MAX_STOPS) return;
		const source = stops[Math.floor(Math.random() * stops.length)];
		stops = [
			...stops,
			{
				id: makeStopId(),
				x: Math.round(20 + Math.random() * 60),
				y: Math.round(20 + Math.random() * 60),
				size: 55,
				color: source.color
			}
		];
	}

	function removeStop(id: string) {
		if (stops.length <= MIN_STOPS) return;
		stops = stops.filter((s) => s.id !== id);
	}

	function setStopColor(id: string, color: string) {
		stops = stops.map((s) => (s.id === id ? { ...s, color } : s));
	}

	function setStopSize(id: string, value: number) {
		stops = stops.map((s) => (s.id === id ? { ...s, size: value } : s));
	}

	function shuffle() {
		stops = jitterPositions(stops);
	}

	function reset() {
		applyPreset(DEFAULT_PRESET_ID);
		opts = { ...DEFAULT_OPTIONS };
		flash('Reset');
	}

	function clamp01(value: number): number {
		return Math.min(100, Math.max(0, value));
	}

	function positionFromEvent(event: PointerEvent): { x: number; y: number } | null {
		if (!stageEl) return null;
		const rect = stageEl.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return null;
		return {
			x: clamp01(((event.clientX - rect.left) / rect.width) * 100),
			y: clamp01(((event.clientY - rect.top) / rect.height) * 100)
		};
	}

	function startDrag(event: PointerEvent, id: string) {
		event.preventDefault();
		draggingId = id;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function onDragMove(event: PointerEvent) {
		if (!draggingId) return;
		const pos = positionFromEvent(event);
		if (!pos) return;
		const id = draggingId;
		stops = stops.map((s) => (s.id === id ? { ...s, x: Math.round(pos.x), y: Math.round(pos.y) } : s));
	}

	function endDrag() {
		draggingId = null;
	}

	async function toBlob(scale: number): Promise<Blob | null> {
		const canvas = document.createElement('canvas');
		renderBloom(canvas, size.width, size.height, stops, opts, scale);
		return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
	}

	async function download() {
		const blob = await toBlob(exportScale);
		if (!blob) return;
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `bloom-${presetId}.png`;
		link.click();
		URL.revokeObjectURL(url);
	}

	async function copyImage() {
		const blob = await toBlob(exportScale);
		if (!blob) return;
		try {
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
			flash('Copied image to clipboard');
		} catch {
			flash('Clipboard blocked — use Download');
		}
	}

	async function copyCss() {
		try {
			await navigator.clipboard.writeText(css);
			flash('Copied CSS');
		} catch {
			flash('Clipboard blocked');
		}
	}
</script>

<svelte:window onpointermove={onDragMove} onpointerup={endDrag} />

<svelte:head>
	<title>Bloom — a soft, grainy gradient generator</title>
	<meta
		name="description"
		content="Drag a few colored orbs into place and Bloom blurs them into a soft mesh gradient — export a grainy wallpaper-ready PNG or copy an approximate CSS background. Rendered entirely in your browser."
	/>
</svelte:head>

<div class="page">
	<a class="back" href={resolve('/')}>← all tools</a>

	<header class="intro">
		<h1>Bloom</h1>
		<p>
			Pick a palette, drag its orbs into place, and Bloom blurs them into a soft gradient with a
			little film grain over the top — export a PNG at wallpaper resolution, or copy CSS to use it
			on the web.
		</p>
	</header>

	<div class="workspace">
		<div class="stage-wrap">
			<div
				class="stage"
				bind:this={stageEl}
				style:aspect-ratio={`${size.width} / ${size.height}`}
			>
				<canvas bind:this={canvasEl} aria-label="Gradient preview"></canvas>
				<div class="handles">
					{#each stops as stop (stop.id)}
						<button
							class="handle"
							class:dragging={draggingId === stop.id}
							style:left={`${stop.x}%`}
							style:top={`${stop.y}%`}
							style:background={stop.color}
							aria-label={`Drag to reposition this orb (${stop.color})`}
							onpointerdown={(event) => startDrag(event, stop.id)}
						></button>
					{/each}
				</div>
			</div>
		</div>

		<div class="panel" aria-label="Settings">
			<div class="panel-head">
				<p class="label">Presets</p>
				<button class="ghost small" onclick={reset}>Reset</button>
			</div>
			<div class="swatches">
				{#each BLOOM_PRESETS as preset (preset.id)}
					<label class="swatch" class:selected={presetId === preset.id} title={preset.label}>
						<input
							type="radio"
							name="preset"
							checked={presetId === preset.id}
							onchange={() => applyPreset(preset.id)}
						/>
						<span
							class="chip"
							style:background={`radial-gradient(circle at 25% 30%, ${preset.stops[0].color}, transparent 60%),
								radial-gradient(circle at 75% 35%, ${preset.stops[1].color}, transparent 60%),
								radial-gradient(circle at 50% 85%, ${preset.stops[2].color}, transparent 65%),
								${preset.background}`}
						></span>
						<span class="swatch-label">{preset.label}</span>
					</label>
				{/each}
			</div>

			<fieldset>
				<legend>Orbs</legend>
				<div class="stops">
					{#each stops as stop (stop.id)}
						<div class="stop-row">
							<input
								type="color"
								class="color-input"
								value={stop.color}
								oninput={(e) => setStopColor(stop.id, (e.currentTarget as HTMLInputElement).value)}
								aria-label="Orb color"
							/>
							<input
								type="range"
								min="30"
								max="90"
								value={stop.size}
								oninput={(e) => setStopSize(stop.id, Number((e.currentTarget as HTMLInputElement).value))}
								aria-label="Orb size"
							/>
							<button
								class="icon-button"
								disabled={stops.length <= MIN_STOPS}
								onclick={() => removeStop(stop.id)}
								aria-label="Remove this orb"
							>
								×
							</button>
						</div>
					{/each}
				</div>
				<div class="stop-actions">
					<button class="ghost small" disabled={stops.length >= MAX_STOPS} onclick={addStop}
						>+ Add orb</button
					>
					<button class="ghost small" onclick={shuffle}>Shuffle positions</button>
				</div>
			</fieldset>

			<fieldset>
				<legend>Background</legend>
				<input type="color" class="color-input wide" bind:value={opts.background} />
			</fieldset>

			<fieldset class="sliders">
				<legend>Look</legend>
				<label>
					<span>Blur <em>{opts.blur}</em></span>
					<input type="range" min="0" max="100" step="1" bind:value={opts.blur} />
				</label>
				<label>
					<span>Grain <em>{opts.grain}</em></span>
					<input type="range" min="0" max="100" step="1" bind:value={opts.grain} />
				</label>
			</fieldset>

			<fieldset>
				<legend>Size</legend>
				<div class="segmented">
					{#each BLOOM_SIZES as option (option.id)}
						<label class:selected={sizeId === option.id}>
							<input type="radio" bind:group={sizeId} value={option.id} />
							{option.label}
						</label>
					{/each}
				</div>
			</fieldset>
		</div>
	</div>

	<div class="export">
		<div class="export-meta">
			<p>{size.width} × {size.height}</p>
			<p class="dim">Exports at {size.width * exportScale} × {size.height * exportScale}</p>
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
			<button class="ghost" onclick={copyCss}>Copy CSS</button>
			<button class="ghost" onclick={copyImage}>Copy image</button>
			<button class="primary" onclick={download}>Download PNG</button>
		</div>
	</div>

	<p class="notice" aria-live="polite">{notice ?? ''}</p>

	<details class="css-preview">
		<summary>Preview the CSS</summary>
		<pre>{css}</pre>
		<p class="note">
			An approximation, not a pixel match — flat color stops with no blur or grain, since CSS has
			no equivalent of blurring each shape before it composites. Use the PNG for the full effect.
		</p>
	</details>
</div>

<style>
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

	.workspace {
		margin-top: 2rem;
		display: grid;
		gap: 1rem;
		grid-template-columns: minmax(0, 1fr) 19rem;
		align-items: start;
	}

	@media (max-width: 56rem) {
		.workspace {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.stage-wrap {
		border: 1px solid var(--border);
		border-radius: 16px;
		padding: clamp(0.75rem, 2vw, 1.25rem);
		background: var(--bg-elevated);
	}

	.stage {
		position: relative;
		width: 100%;
		border-radius: 10px;
		overflow: hidden;
		touch-action: none;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}

	.handles {
		position: absolute;
		inset: 0;
	}

	.handle {
		position: absolute;
		width: 22px;
		height: 22px;
		margin: -11px 0 0 -11px;
		border-radius: 999px;
		border: 2px solid rgba(255, 255, 255, 0.85);
		box-shadow:
			0 0 0 1px rgba(0, 0, 0, 0.3),
			0 2px 6px rgba(0, 0, 0, 0.35);
		cursor: grab;
		padding: 0;
		touch-action: none;
	}

	.handle.dragging {
		cursor: grabbing;
		transform: scale(1.15);
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

	.label {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dim);
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

	.swatches {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
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

	.swatch-label {
		font-size: 0.62rem;
		color: var(--text-dim);
	}

	.swatch.selected .swatch-label {
		color: var(--text);
	}

	.stops {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.stop-row {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 0.5rem;
	}

	.color-input {
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: 1px solid var(--border-strong);
		border-radius: 6px;
		background: none;
		cursor: pointer;
	}

	.color-input.wide {
		width: 100%;
	}

	.icon-button {
		width: 1.6rem;
		height: 1.6rem;
		display: grid;
		place-items: center;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: transparent;
		color: var(--text-dim);
		cursor: pointer;
		font-size: 1rem;
		line-height: 1;
	}

	.icon-button:hover:not(:disabled) {
		border-color: var(--border-strong);
		color: var(--text);
	}

	.icon-button:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.stop-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.7rem;
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

	button.ghost:hover:not(:disabled) {
		border-color: var(--border-strong);
	}

	button.ghost:disabled {
		opacity: 0.4;
		cursor: not-allowed;
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

	.css-preview {
		margin-top: 1rem;
		border: 1px solid var(--border);
		border-radius: 16px;
		padding: 1rem 1.1rem;
		background: var(--bg-elevated);
	}

	.css-preview summary {
		cursor: pointer;
		font-size: 0.85rem;
		color: var(--text-dim);
	}

	.css-preview summary:hover {
		color: var(--text);
	}

	.css-preview pre {
		margin: 0.9rem 0 0;
		padding: 0.9rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 10px;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.5;
		overflow-x: auto;
		white-space: pre;
	}

	.note {
		margin-top: 0.6rem;
		font-size: 0.75rem;
		line-height: 1.4;
		color: var(--text-dim);
	}
</style>
