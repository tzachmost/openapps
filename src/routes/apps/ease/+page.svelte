<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		X_MAX,
		X_MIN,
		Y_MAX,
		Y_MIN,
		clampPoints,
		toArray,
		toCssValue,
		toJsFunction,
		type BezierPoints
	} from '$lib/ease/bezier';
	import { DEFAULT_PRESET, PRESET_GROUPS, type Preset } from '$lib/ease/presets';

	// The viewBox always shows the full X_MIN..Y_MAX clamp range (needed to cover the
	// Back presets' 1.6/-0.6 overshoot) so a handle is never drawn outside its own
	// box — with y spanning more than twice x's range, that makes this inherently a
	// tall shape; the .graph max-width in the stylesheet below keeps the final pixel size sane
	// rather than distorting the unit scale to force a squarer box.
	const PAD_X = 0.06;
	const PAD_Y = 0.08;
	const VIEW_X_MIN = X_MIN - PAD_X;
	const VIEW_X_MAX = X_MAX + PAD_X;
	const VIEW_WIDTH = VIEW_X_MAX - VIEW_X_MIN;
	const VIEW_Y_DATA_MIN = Y_MIN - PAD_Y;
	const VIEW_Y_DATA_MAX = Y_MAX + PAD_Y;
	const VIEW_HEIGHT = VIEW_Y_DATA_MAX - VIEW_Y_DATA_MIN;
	const viewBox = `${VIEW_X_MIN} ${-VIEW_Y_DATA_MAX} ${VIEW_WIDTH} ${VIEW_HEIGHT}`;

	const HANDLE_R = 0.036;
	const NUDGE = 0.01;
	const NUDGE_BIG = 0.05;
	const DOT_SIZE = 22;
	const EPS = 0.0005;

	let points = $state<BezierPoints>({ ...DEFAULT_PRESET.points });
	let svgEl: SVGSVGElement | undefined = $state();
	let draggingHandle: 'p1' | 'p2' | null = $state(null);
	let duration = $state(0.6);
	let loop = $state(false);
	let runId = $state(0);
	let trackWidth = $state(0);
	let notice = $state<string | null>(null);
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;

	const cssValue = $derived(toCssValue(points));
	const arrayValue = $derived(toArray(points));
	const jsFunctionSource = $derived(toJsFunction(points));
	const distance = $derived(Math.max(0, trackWidth - DOT_SIZE));
	const animationStyle = $derived(
		`--distance: ${distance}px; animation-name: ease-slide; animation-duration: ${duration}s; ` +
			`animation-timing-function: ${cssValue}; animation-iteration-count: ${loop ? 'infinite' : '1'}; ` +
			`animation-direction: ${loop ? 'alternate' : 'normal'}; animation-fill-mode: ${loop ? 'none' : 'forwards'};`
	);

	function pointsEqual(a: BezierPoints, b: BezierPoints): boolean {
		return (
			Math.abs(a.x1 - b.x1) < EPS &&
			Math.abs(a.y1 - b.y1) < EPS &&
			Math.abs(a.x2 - b.x2) < EPS &&
			Math.abs(a.y2 - b.y2) < EPS
		);
	}

	const activePreset = $derived(
		PRESET_GROUPS.flatMap((g) => g.presets).find((p) => pointsEqual(p.points, points)) ?? null
	);

	function flash(message: string) {
		notice = message;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = null), 1600);
	}

	function play() {
		runId += 1;
	}

	function applyPreset(preset: Preset) {
		points = clampPoints(preset.points);
		play();
	}

	function setPoint(key: keyof BezierPoints, raw: string) {
		const value = Number(raw);
		if (Number.isNaN(value)) return;
		points = clampPoints({ ...points, [key]: value });
	}

	function graphCoords(event: PointerEvent): { x: number; y: number } | null {
		if (!svgEl) return null;
		const rect = svgEl.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return null;
		const fracX = (event.clientX - rect.left) / rect.width;
		const fracY = (event.clientY - rect.top) / rect.height;
		return {
			x: VIEW_X_MIN + fracX * VIEW_WIDTH,
			y: VIEW_Y_DATA_MAX - fracY * VIEW_HEIGHT
		};
	}

	function startDrag(event: PointerEvent, handle: 'p1' | 'p2') {
		event.preventDefault();
		draggingHandle = handle;
		(event.currentTarget as SVGElement).setPointerCapture(event.pointerId);
	}

	function onDragMove(event: PointerEvent) {
		if (!draggingHandle) return;
		const coords = graphCoords(event);
		if (!coords) return;
		if (draggingHandle === 'p1') points = clampPoints({ ...points, x1: coords.x, y1: coords.y });
		else points = clampPoints({ ...points, x2: coords.x, y2: coords.y });
	}

	function endDrag() {
		if (!draggingHandle) return;
		draggingHandle = null;
		play();
	}

	function nudge(handle: 'p1' | 'p2', dx: number, dy: number) {
		if (handle === 'p1')
			points = clampPoints({ ...points, x1: points.x1 + dx, y1: points.y1 + dy });
		else points = clampPoints({ ...points, x2: points.x2 + dx, y2: points.y2 + dy });
	}

	function onHandleKeydown(event: KeyboardEvent, handle: 'p1' | 'p2') {
		const step = event.shiftKey ? NUDGE_BIG : NUDGE;
		switch (event.key) {
			case 'ArrowLeft':
				nudge(handle, -step, 0);
				break;
			case 'ArrowRight':
				nudge(handle, step, 0);
				break;
			case 'ArrowUp':
				nudge(handle, 0, step);
				break;
			case 'ArrowDown':
				nudge(handle, 0, -step);
				break;
			default:
				return;
		}
		event.preventDefault();
		play();
	}

	async function copy(text: string, label: string) {
		try {
			await navigator.clipboard.writeText(text);
			flash(label);
		} catch {
			flash('Clipboard blocked');
		}
	}

	function svgY(dataY: number): number {
		return -dataY;
	}

	function selectOnFocus(event: FocusEvent) {
		(event.currentTarget as HTMLInputElement).select();
	}
</script>

<svelte:window onpointermove={onDragMove} onpointerup={endDrag} />

<svelte:head>
	<title>Ease — a cubic-bezier easing curve editor</title>
	<meta
		name="description"
		content="Drag a bezier curve into shape, feel it on a live preview track, and copy it as CSS, a JS array, or a standalone easing function. Rendered entirely in your browser."
	/>
</svelte:head>

<div class="page">
	<a class="back" href={resolve('/')}>← all tools</a>

	<header class="intro">
		<h1>Ease</h1>
		<p>
			Drag the two handles to shape a cubic-bezier curve, watch how it feels on the track below,
			then copy it as CSS, a JS array, or a standalone easing function.
		</p>
	</header>

	<div class="workspace">
		<div class="stage-wrap">
			<svg bind:this={svgEl} {viewBox} class="graph" role="img" aria-label="Bezier curve editor">
				<line class="grid-line" x1={VIEW_X_MIN} y1="0" x2={VIEW_X_MAX} y2="0" />
				<line class="grid-line" x1={VIEW_X_MIN} y1={svgY(1)} x2={VIEW_X_MAX} y2={svgY(1)} />
				<line class="diagonal" x1="0" y1="0" x2="1" y2={svgY(1)} />

				<line class="handle-line" x1="0" y1="0" x2={points.x1} y2={svgY(points.y1)} />
				<line class="handle-line" x1="1" y1={svgY(1)} x2={points.x2} y2={svgY(points.y2)} />

				<path
					class="curve"
					d={`M 0 0 C ${points.x1} ${svgY(points.y1)} ${points.x2} ${svgY(points.y2)} 1 ${svgY(1)}`}
				/>

				<circle class="anchor" cx="0" cy="0" r={HANDLE_R * 0.55} />
				<circle class="anchor" cx="1" cy={svgY(1)} r={HANDLE_R * 0.55} />

				<circle
					class="handle"
					class:dragging={draggingHandle === 'p1'}
					cx={points.x1}
					cy={svgY(points.y1)}
					r={HANDLE_R}
					tabindex="0"
					role="slider"
					aria-label="First control point"
					aria-valuenow={points.x1}
					aria-valuemin={X_MIN}
					aria-valuemax={X_MAX}
					aria-valuetext={`x ${points.x1.toFixed(2)}, y ${points.y1.toFixed(2)}`}
					onpointerdown={(e) => startDrag(e, 'p1')}
					onkeydown={(e) => onHandleKeydown(e, 'p1')}
				/>
				<circle
					class="handle"
					class:dragging={draggingHandle === 'p2'}
					cx={points.x2}
					cy={svgY(points.y2)}
					r={HANDLE_R}
					tabindex="0"
					role="slider"
					aria-label="Second control point"
					aria-valuenow={points.x2}
					aria-valuemin={X_MIN}
					aria-valuemax={X_MAX}
					aria-valuetext={`x ${points.x2.toFixed(2)}, y ${points.y2.toFixed(2)}`}
					onpointerdown={(e) => startDrag(e, 'p2')}
					onkeydown={(e) => onHandleKeydown(e, 'p2')}
				/>
			</svg>

			<div class="points">
				<label>
					<span>x1</span>
					<input
						type="number"
						step="0.01"
						min={X_MIN}
						max={X_MAX}
						value={points.x1.toFixed(2)}
						onfocus={selectOnFocus}
						onchange={(e) => setPoint('x1', (e.currentTarget as HTMLInputElement).value)}
					/>
				</label>
				<label>
					<span>y1</span>
					<input
						type="number"
						step="0.01"
						min={Y_MIN}
						max={Y_MAX}
						value={points.y1.toFixed(2)}
						onfocus={selectOnFocus}
						onchange={(e) => setPoint('y1', (e.currentTarget as HTMLInputElement).value)}
					/>
				</label>
				<label>
					<span>x2</span>
					<input
						type="number"
						step="0.01"
						min={X_MIN}
						max={X_MAX}
						value={points.x2.toFixed(2)}
						onfocus={selectOnFocus}
						onchange={(e) => setPoint('x2', (e.currentTarget as HTMLInputElement).value)}
					/>
				</label>
				<label>
					<span>y2</span>
					<input
						type="number"
						step="0.01"
						min={Y_MIN}
						max={Y_MAX}
						value={points.y2.toFixed(2)}
						onfocus={selectOnFocus}
						onchange={(e) => setPoint('y2', (e.currentTarget as HTMLInputElement).value)}
					/>
				</label>
			</div>
			<p class="hint">
				x stays within 0–1 — CSS requires that so the curve is a well-defined function of time. y
				can go past 0–1 for overshoot, like the Back presets below.
			</p>
		</div>

		<div class="panel" aria-label="Presets">
			<p class="label">Presets</p>
			{#each PRESET_GROUPS as group (group.label)}
				<fieldset>
					<legend>{group.label}</legend>
					<div class="segmented">
						{#each group.presets as preset (preset.label)}
							<label class:selected={activePreset === preset}>
								<input
									type="radio"
									name="preset"
									checked={activePreset === preset}
									onchange={() => applyPreset(preset)}
								/>
								{preset.label}
							</label>
						{/each}
					</div>
				</fieldset>
			{/each}
		</div>
	</div>

	<div class="preview-card">
		<div class="track" bind:clientWidth={trackWidth}>
			{#key runId}
				<div class="dot" style={animationStyle}></div>
			{/key}
		</div>
		<div class="preview-controls">
			<label class="duration">
				<span>Duration <em>{duration.toFixed(1)}s</em></span>
				<input type="range" min="0.2" max="2" step="0.1" bind:value={duration} />
			</label>
			<label class="loop-toggle">
				<input type="checkbox" bind:checked={loop} />
				Loop
			</label>
			<button class="primary" onclick={play}>{loop ? 'Restart' : 'Play'}</button>
		</div>
	</div>

	<div class="export">
		<code class="css-value">{cssValue}</code>
		<div class="export-actions">
			<button class="ghost" onclick={() => copy(`[${arrayValue.join(', ')}]`, 'Copied JS array')}>
				Copy array
			</button>
			<button class="ghost" onclick={() => copy(jsFunctionSource, 'Copied JS function')}>
				Copy JS function
			</button>
			<button class="primary" onclick={() => copy(cssValue, 'Copied CSS value')}>Copy CSS</button>
		</div>
	</div>

	<p class="notice" aria-live="polite">{notice ?? ''}</p>

	<details class="css-preview">
		<summary>Standalone JS function</summary>
		<pre>{jsFunctionSource}</pre>
		<p class="note">
			A plain port of the same Newton-Raphson solve used to draw the curve above — for animation
			libraries or canvas code that take a JS easing function instead of a CSS value.
		</p>
	</details>
</div>

<style>
	@keyframes -global-ease-slide {
		from {
			transform: translateX(0);
		}
		to {
			transform: translateX(var(--distance));
		}
	}

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
		grid-template-columns: minmax(0, 17rem) 1fr;
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
		padding: clamp(1rem, 2vw, 1.5rem);
		background: var(--bg-elevated);
	}

	.graph {
		display: block;
		width: 100%;
		max-width: 13rem;
		height: auto;
		margin: 0 auto;
		touch-action: none;
		overflow: visible;
	}

	.grid-line {
		stroke: var(--border-strong);
		stroke-width: 0.008;
	}

	.diagonal {
		stroke: var(--border);
		stroke-width: 0.006;
		stroke-dasharray: 0.02 0.018;
	}

	.handle-line {
		stroke: var(--text-dim);
		stroke-width: 0.01;
	}

	.curve {
		fill: none;
		stroke: var(--accent);
		stroke-width: 0.022;
		stroke-linecap: round;
	}

	.anchor {
		fill: var(--text);
	}

	.handle {
		fill: var(--bg-elevated);
		stroke: var(--accent);
		stroke-width: 0.02;
		cursor: grab;
		touch-action: none;
	}

	.handle:focus-visible {
		outline: none;
		stroke-width: 0.026;
	}

	.handle.dragging {
		cursor: grabbing;
		fill: var(--accent);
	}

	.points {
		margin-top: 1.25rem;
		max-width: 13rem;
		margin-inline: auto;
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
	}

	.points label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dim);
	}

	.points input {
		font: inherit;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.4rem 0.5rem;
		width: 100%;
	}

	.points input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.hint {
		margin-top: 0.9rem;
		font-size: 0.75rem;
		line-height: 1.45;
		color: var(--text-dim);
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		padding: 1.1rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 16px;
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
		margin-bottom: 0.4rem;
		font-size: 0.78rem;
		color: var(--text);
	}

	.segmented {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.segmented label {
		font-size: 0.75rem;
		padding: 0.3rem 0.55rem;
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

	.preview-card {
		margin-top: 1rem;
		padding: 1.1rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 16px;
	}

	.track {
		position: relative;
		height: 2.5rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 999px;
	}

	.dot {
		position: absolute;
		top: 50%;
		left: 0.25rem;
		width: 22px;
		height: 22px;
		margin-top: -11px;
		border-radius: 999px;
		background: var(--accent);
	}

	.preview-controls {
		margin-top: 1rem;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 1.25rem;
	}

	.duration {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.78rem;
		color: var(--text-dim);
		flex: 1 1 12rem;
	}

	.duration span {
		display: flex;
		justify-content: space-between;
	}

	.duration em {
		font-style: normal;
		font-family: var(--font-mono);
		color: var(--text);
	}

	input[type='range'] {
		width: 100%;
		accent-color: var(--accent);
	}

	.loop-toggle {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.85rem;
		color: var(--text-dim);
		cursor: pointer;
	}

	.loop-toggle input {
		accent-color: var(--accent);
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

	.css-value {
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}

	.export-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
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
