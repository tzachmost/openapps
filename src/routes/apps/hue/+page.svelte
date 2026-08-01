<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		hexToRgb,
		rgbToHex,
		rgbToHsl,
		rgbToHsv,
		hsvToRgb,
		rgbToOklch,
		normalizeHex,
		formatRgb,
		formatHsl,
		formatHsv,
		formatOklch
	} from '$lib/hue/convert';
	import { contrastRatio, wcagChecks, pickTextColor } from '$lib/hue/contrast';
	import {
		harmonyPalette,
		HARMONY_TYPES,
		HARMONY_LABELS,
		type HarmonyType
	} from '$lib/hue/harmony';
	import { simulate, CVD_TYPES, CVD_INFO, type CvdType } from '$lib/hue/colorblind';

	const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

	const initialHsv = rgbToHsv(hexToRgb('#dd4b1f'));
	let hue = $state(initialHsv.h);
	let sat = $state(initialHsv.s / 100);
	let val = $state(initialHsv.v / 100);

	const baseRgb = $derived(hsvToRgb({ h: hue, s: sat * 100, v: val * 100 }));
	const baseHex = $derived(rgbToHex(baseRgb));
	const baseHsl = $derived(rgbToHsl(baseRgb));
	const baseHsv = $derived({ h: hue, s: sat * 100, v: val * 100 });
	const baseOklch = $derived(rgbToOklch(baseRgb));

	function applyHex(hex: string) {
		const hsv = rgbToHsv(hexToRgb(hex));
		hue = hsv.h;
		sat = hsv.s / 100;
		val = hsv.v / 100;
	}

	let hexDraft = $state('');
	$effect(() => {
		hexDraft = baseHex;
	});
	function commitHexDraft() {
		const norm = normalizeHex(hexDraft);
		if (norm) applyHex(norm);
		else hexDraft = baseHex;
	}

	// --- SV square + hue slider: pointerdown-anywhere-jumps, then tracks via window-level move ---
	let svEl: HTMLDivElement;
	let hueEl: HTMLDivElement;
	let dragTarget = $state<'sv' | 'hue' | null>(null);

	function svPointFromEvent(event: PointerEvent) {
		const rect = svEl.getBoundingClientRect();
		return {
			s: clamp01((event.clientX - rect.left) / rect.width),
			v: clamp01(1 - (event.clientY - rect.top) / rect.height)
		};
	}

	function huePointFromEvent(event: PointerEvent) {
		// The slider track is a tall, narrow vertical strip (see .hue-slider), gradient bottom
		// (0deg) to top (360deg) — position comes from clientY/height, not clientX/width.
		const rect = hueEl.getBoundingClientRect();
		return clamp01(1 - (event.clientY - rect.top) / rect.height) * 360;
	}

	function startSvDrag(event: PointerEvent) {
		event.preventDefault();
		dragTarget = 'sv';
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		const p = svPointFromEvent(event);
		sat = p.s;
		val = p.v;
	}

	function startHueDrag(event: PointerEvent) {
		event.preventDefault();
		dragTarget = 'hue';
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		hue = huePointFromEvent(event);
	}

	function onDragMove(event: PointerEvent) {
		if (dragTarget === 'sv') {
			const p = svPointFromEvent(event);
			sat = p.s;
			val = p.v;
		} else if (dragTarget === 'hue') {
			hue = huePointFromEvent(event);
		}
	}

	function endDrag() {
		dragTarget = null;
	}

	function onSvKeydown(event: KeyboardEvent) {
		const step = event.shiftKey ? 0.1 : 0.02;
		switch (event.key) {
			case 'ArrowLeft':
				sat = clamp01(sat - step);
				break;
			case 'ArrowRight':
				sat = clamp01(sat + step);
				break;
			case 'ArrowUp':
				val = clamp01(val + step);
				break;
			case 'ArrowDown':
				val = clamp01(val - step);
				break;
			default:
				return;
		}
		event.preventDefault();
	}

	function onHueKeydown(event: KeyboardEvent) {
		const step = event.shiftKey ? 10 : 1;
		if (event.key === 'ArrowDown' || event.key === 'ArrowLeft')
			hue = (((hue - step) % 360) + 360) % 360;
		else if (event.key === 'ArrowUp' || event.key === 'ArrowRight') hue = (hue + step) % 360;
		else return;
		event.preventDefault();
	}

	// --- format readouts ---
	const formats = $derived([
		{ id: 'hex', label: 'HEX', value: baseHex },
		{ id: 'rgb', label: 'RGB', value: formatRgb(baseRgb) },
		{ id: 'hsl', label: 'HSL', value: formatHsl(baseHsl) },
		{ id: 'hsv', label: 'HSV', value: formatHsv(baseHsv) },
		{ id: 'oklch', label: 'OKLCH', value: formatOklch(baseOklch) }
	]);

	let copiedFormat = $state<string | null>(null);
	async function copyFormat(id: string, value: string) {
		try {
			await navigator.clipboard.writeText(value);
			copiedFormat = id;
			setTimeout(() => {
				if (copiedFormat === id) copiedFormat = null;
			}, 1200);
		} catch {
			// Clipboard access can be denied by the browser; the value stays selectable either way.
		}
	}

	// --- harmonies ---
	let harmonyType = $state<HarmonyType>('complementary');
	const palette = $derived(harmonyPalette(baseHex, harmonyType));

	let copiedSwatch = $state<string | null>(null);
	async function copySwatch(hex: string) {
		try {
			await navigator.clipboard.writeText(hex);
			copiedSwatch = hex;
			setTimeout(() => {
				if (copiedSwatch === hex) copiedSwatch = null;
			}, 1200);
		} catch {
			// same as above
		}
	}

	let copiedPaletteCss = $state(false);
	async function copyPaletteCss() {
		const css = `:root {\n${palette.map((s, i) => `  --hue-${i + 1}: ${s.hex};`).join('\n')}\n}`;
		try {
			await navigator.clipboard.writeText(css);
			copiedPaletteCss = true;
			setTimeout(() => (copiedPaletteCss = false), 1200);
		} catch {
			// same as above
		}
	}

	// --- accessibility: contrast + colorblind, shared foreground/background pair ---
	let mode = $state<'harmonies' | 'accessibility'>('harmonies');

	let fg = $state('#dd4b1f');
	let bg = $state('#ffffff');
	let fgDraft = $state('');
	let bgDraft = $state('');
	$effect(() => {
		fgDraft = fg;
	});
	$effect(() => {
		bgDraft = bg;
	});
	function commitFg() {
		const n = normalizeHex(fgDraft);
		if (n) fg = n;
		else fgDraft = fg;
	}
	function commitBg() {
		const n = normalizeHex(bgDraft);
		if (n) bg = n;
		else bgDraft = bg;
	}
	function swapFgBg() {
		[fg, bg] = [bg, fg];
	}

	const ratio = $derived(contrastRatio(fg, bg));
	const checks = $derived(wcagChecks(ratio));
</script>

<svelte:window onpointermove={onDragMove} onpointerup={endDrag} />

<svelte:head>
	<title>Hue — color converter, harmonies, contrast, and colorblind check</title>
	<meta
		name="description"
		content="Pick a color and see it in hex, RGB, HSL, HSV, and OKLCH, generate matching harmonies, check WCAG contrast, and preview it under color vision deficiencies. Computed entirely on your device."
	/>
</svelte:head>

<div class="page">
	<a class="back" href={resolve('/')}>← all tools</a>

	<header class="intro">
		<h1>Hue</h1>
		<p>
			Pick a color to see it in every format at once, build a matching harmony, check its contrast,
			and preview how it looks under color vision deficiencies. Nothing here touches a server — the
			OKLab math and colorblindness simulation are hand-rolled, right down to the formulas.
		</p>
	</header>

	<div class="picker panel">
		<div class="picker-controls">
			<div
				class="sv-square"
				bind:this={svEl}
				style:background-color={`hsl(${hue} 100% 50%)`}
				tabindex="0"
				role="slider"
				aria-label="Saturation and brightness"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(sat * 100)}
				aria-valuetext={`saturation ${Math.round(sat * 100)}%, brightness ${Math.round(val * 100)}%`}
				onpointerdown={startSvDrag}
				onkeydown={onSvKeydown}
			>
				<div
					class="sv-handle"
					style:left={`${sat * 100}%`}
					style:top={`${(1 - val) * 100}%`}
					style:background={baseHex}
				></div>
			</div>

			<div
				class="hue-slider"
				bind:this={hueEl}
				tabindex="0"
				role="slider"
				aria-label="Hue"
				aria-orientation="vertical"
				aria-valuemin={0}
				aria-valuemax={360}
				aria-valuenow={Math.round(hue)}
				onpointerdown={startHueDrag}
				onkeydown={onHueKeydown}
			>
				<div class="hue-handle" style:top={`${100 - (hue / 360) * 100}%`}></div>
			</div>
		</div>

		<div class="picker-value">
			<label class="swatch-picker" style:background={baseHex}>
				<input type="color" value={baseHex} oninput={(e) => applyHex(e.currentTarget.value)} />
				<span class="visually-hidden">Open system color picker</span>
			</label>
			<input
				class="hex-input"
				type="text"
				spellcheck="false"
				autocomplete="off"
				bind:value={hexDraft}
				onchange={commitHexDraft}
				onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
				aria-label="Hex value"
			/>
		</div>

		<div class="formats">
			{#each formats as f (f.id)}
				<button class="format-row" onclick={() => copyFormat(f.id, f.value)}>
					<span class="format-label">{f.label}</span>
					<span class="format-value">{f.value}</span>
					<span class="format-copy">{copiedFormat === f.id ? 'Copied!' : 'Copy'}</span>
				</button>
			{/each}
		</div>
	</div>

	<div class="mode-toggle" role="group" aria-label="Section">
		<button class:active={mode === 'harmonies'} onclick={() => (mode = 'harmonies')}
			>Harmonies</button
		>
		<button class:active={mode === 'accessibility'} onclick={() => (mode = 'accessibility')}
			>Accessibility</button
		>
	</div>

	{#if mode === 'harmonies'}
		<section class="panel">
			<div class="segmented">
				{#each HARMONY_TYPES as type (type)}
					<label class:selected={harmonyType === type}>
						<input type="radio" bind:group={harmonyType} value={type} />
						{HARMONY_LABELS[type]}
					</label>
				{/each}
			</div>

			<div class="swatch-grid">
				{#each palette as swatch (swatch.label + swatch.hex)}
					<button
						class="swatch"
						style:background={swatch.hex}
						style:color={pickTextColor(swatch.hex) === 'dark' ? '#17150f' : '#f4f1ea'}
						onclick={() => copySwatch(swatch.hex)}
					>
						<span class="swatch-label">{swatch.label}</span>
						<span class="swatch-hex">{copiedSwatch === swatch.hex ? 'Copied!' : swatch.hex}</span>
					</button>
				{/each}
			</div>

			<button class="ghost" onclick={copyPaletteCss}>
				{copiedPaletteCss ? 'Copied!' : 'Copy palette as CSS variables'}
			</button>
		</section>
	{:else}
		<section class="panel accessibility">
			<div class="pair-fields">
				<div class="field">
					<span class="field-label">Text</span>
					<label class="swatch-picker small" style:background={fg}>
						<input type="color" value={fg} oninput={(e) => (fg = e.currentTarget.value)} />
						<span class="visually-hidden">Pick text color</span>
					</label>
					<input
						class="hex-input small"
						type="text"
						spellcheck="false"
						autocomplete="off"
						bind:value={fgDraft}
						onchange={commitFg}
						aria-label="Text hex value"
					/>
					<button class="ghost tiny" onclick={() => (fg = baseHex)}>Use picker color</button>
				</div>
				<button class="ghost swap" onclick={swapFgBg} aria-label="Swap text and background"
					>⇅</button
				>
				<div class="field">
					<span class="field-label">Background</span>
					<label class="swatch-picker small" style:background={bg}>
						<input type="color" value={bg} oninput={(e) => (bg = e.currentTarget.value)} />
						<span class="visually-hidden">Pick background color</span>
					</label>
					<input
						class="hex-input small"
						type="text"
						spellcheck="false"
						autocomplete="off"
						bind:value={bgDraft}
						onchange={commitBg}
						aria-label="Background hex value"
					/>
					<button class="ghost tiny" onclick={() => (bg = baseHex)}>Use picker color</button>
				</div>
			</div>

			<div class="preview" style:background={bg} style:color={fg}>
				<p class="preview-large">Aa Bb Cc</p>
				<p class="preview-normal">The quick brown fox jumps over the lazy dog.</p>
			</div>

			<div class="ratio-row">
				<span class="ratio-value">{ratio.toFixed(2)}<span class="ratio-suffix">:1</span></span>
				<div class="checks">
					{#each checks as check (check.label)}
						<span class="check" class:pass={check.passes}>
							{check.passes ? '✓' : '✗'}
							{check.label}
						</span>
					{/each}
				</div>
			</div>

			<h2 class="sub-heading">Colorblind check</h2>
			<p class="caveat">
				Approximations of dichromacy (Machado, Oliveira &amp; Fernandes, 2009) and full
				achromatopsia — real color vision varies far more than four fixed categories, and this isn't
				a diagnostic tool.
			</p>
			<div class="cvd-grid">
				{#each CVD_TYPES as type (type)}
					{@const info = CVD_INFO[type]}
					<div class="cvd-card">
						<div
							class="cvd-preview"
							style:background={simulate(bg, type)}
							style:color={simulate(fg, type)}
						>
							Aa
						</div>
						<span class="cvd-label">{info.label}</span>
						<span class="cvd-prevalence">{info.prevalence}</span>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</div>

<style>
	.page {
		max-width: 48rem;
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
		max-width: 40rem;
	}

	.panel {
		margin-top: 1.5rem;
		padding: 1.1rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 14px;
	}

	/* --- picker --- */

	.picker-controls {
		display: grid;
		grid-template-columns: 1fr 1.4rem;
		grid-template-rows: 12rem 1.4rem;
		gap: 0.75rem;
	}

	.sv-square {
		grid-column: 1;
		grid-row: 1 / span 2;
		position: relative;
		border-radius: 10px;
		background-image:
			linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent);
		cursor: crosshair;
		touch-action: none;
		outline: none;
	}

	.sv-square:focus-visible {
		box-shadow: 0 0 0 2px var(--accent);
	}

	.sv-handle {
		position: absolute;
		width: 1.1rem;
		height: 1.1rem;
		border-radius: 50%;
		border: 2px solid #fff;
		box-shadow:
			0 0 0 1px rgba(0, 0, 0, 0.35),
			0 1px 3px rgba(0, 0, 0, 0.4);
		transform: translate(-50%, -50%);
		pointer-events: none;
	}

	.hue-slider {
		grid-column: 2;
		grid-row: 1 / span 2;
		position: relative;
		border-radius: 999px;
		background: linear-gradient(
			to top,
			hsl(0 100% 50%),
			hsl(60 100% 50%),
			hsl(120 100% 50%),
			hsl(180 100% 50%),
			hsl(240 100% 50%),
			hsl(300 100% 50%),
			hsl(360 100% 50%)
		);
		cursor: pointer;
		touch-action: none;
		outline: none;
	}

	.hue-slider:focus-visible {
		box-shadow: 0 0 0 2px var(--accent);
	}

	.hue-handle {
		position: absolute;
		left: 50%;
		width: 1.7rem;
		height: 0.6rem;
		border-radius: 4px;
		border: 2px solid #fff;
		box-shadow:
			0 0 0 1px rgba(0, 0, 0, 0.35),
			0 1px 3px rgba(0, 0, 0, 0.4);
		background: transparent;
		transform: translate(-50%, -50%);
		pointer-events: none;
	}

	.picker-value {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-top: 0.9rem;
	}

	.swatch-picker {
		position: relative;
		display: block;
		width: 2.4rem;
		height: 2.4rem;
		border-radius: 10px;
		border: 1px solid var(--border-strong);
		flex-shrink: 0;
		cursor: pointer;
		overflow: hidden;
	}

	.swatch-picker.small {
		width: 2rem;
		height: 2rem;
	}

	.swatch-picker input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
		border: none;
		padding: 0;
	}

	.hex-input {
		flex: 1;
		font: inherit;
		font-family: var(--font-mono);
		font-size: 1rem;
		padding: 0.55rem 0.75rem;
		border-radius: 10px;
		border: 1px solid var(--border);
		background: var(--bg);
		color: var(--text);
	}

	.hex-input.small {
		font-size: 0.85rem;
		padding: 0.4rem 0.6rem;
		flex: 1;
		min-width: 0;
	}

	.hex-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.formats {
		margin-top: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.format-row {
		display: grid;
		grid-template-columns: 4rem 1fr auto;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		font: inherit;
		text-align: left;
		padding: 0.5rem 0.6rem;
		border-radius: 8px;
		border: 1px solid transparent;
		background: transparent;
		cursor: pointer;
		color: var(--text);
	}

	.format-row:hover {
		border-color: var(--border);
		background: var(--bg);
	}

	.format-label {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dim);
	}

	.format-value {
		font-family: var(--font-mono);
		font-size: 0.88rem;
		overflow-x: auto;
		white-space: nowrap;
	}

	.format-copy {
		font-size: 0.75rem;
		color: var(--text-dim);
		white-space: nowrap;
	}

	/* --- mode toggle (shared visual language with Sift/Seal/Ward) --- */

	.mode-toggle {
		display: inline-flex;
		gap: 0.25rem;
		margin-top: 1.5rem;
		padding: 0.25rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 999px;
	}

	.mode-toggle button {
		font: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		padding: 0.4rem 1.1rem;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--text-dim);
		cursor: pointer;
	}

	.mode-toggle button.active {
		background: var(--accent);
		color: var(--accent-text);
	}

	/* --- harmonies --- */

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
		color: var(--text);
		background: var(--bg);
	}

	.segmented input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.swatch-grid {
		margin-top: 1rem;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
		gap: 0.6rem;
	}

	.swatch {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 0.15rem;
		height: 5.5rem;
		padding: 0.6rem;
		border: none;
		border-radius: 10px;
		cursor: pointer;
		text-align: left;
		font: inherit;
	}

	.swatch-label {
		font-size: 0.72rem;
		opacity: 0.85;
	}

	.swatch-hex {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-weight: 600;
	}

	button.ghost {
		font: inherit;
		font-size: 0.82rem;
		font-weight: 600;
		padding: 0.5rem 1rem;
		border-radius: 10px;
		cursor: pointer;
		background: transparent;
		border: 1px solid var(--border);
		color: var(--text);
	}

	button.ghost:hover {
		border-color: var(--border-strong);
	}

	button.ghost.tiny {
		padding: 0.3rem 0.6rem;
		font-size: 0.72rem;
		white-space: nowrap;
	}

	.swatch-grid + button.ghost {
		margin-top: 1rem;
	}

	/* --- accessibility --- */

	.pair-fields {
		display: flex;
		align-items: flex-end;
		gap: 0.6rem;
		flex-wrap: wrap;
	}

	.field {
		flex: 1;
		min-width: 12rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.field-label {
		width: 100%;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dim);
	}

	.swap {
		flex-shrink: 0;
		padding: 0.5rem 0.7rem;
		align-self: center;
	}

	.preview {
		margin-top: 1.1rem;
		padding: 1.5rem;
		border-radius: 10px;
		border: 1px solid var(--border);
	}

	.preview-large {
		font-size: 1.8rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.preview-normal {
		margin-top: 0.5rem;
		font-size: 0.95rem;
	}

	.ratio-row {
		margin-top: 1rem;
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.ratio-value {
		font-family: var(--font-mono);
		font-size: 1.6rem;
		font-weight: 700;
	}

	.ratio-suffix {
		font-size: 1rem;
		color: var(--text-dim);
		font-weight: 400;
	}

	.checks {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.9rem;
	}

	.check {
		font-size: 0.78rem;
		color: var(--text-dim);
	}

	.check.pass {
		color: var(--text);
	}

	.sub-heading {
		margin-top: 1.75rem;
		font-size: 0.95rem;
		font-weight: 600;
	}

	.caveat {
		margin-top: 0.35rem;
		font-size: 0.78rem;
		color: var(--text-dim);
		line-height: 1.45;
		max-width: 34rem;
	}

	.cvd-grid {
		margin-top: 0.9rem;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
		gap: 0.6rem;
	}

	.cvd-card {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.cvd-preview {
		height: 3rem;
		border-radius: 8px;
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 1.1rem;
	}

	.cvd-label {
		font-size: 0.78rem;
		font-weight: 600;
	}

	.cvd-prevalence {
		font-size: 0.7rem;
		color: var(--text-dim);
	}

	@media (max-width: 30rem) {
		.picker-controls {
			grid-template-rows: 10rem 1.4rem;
		}

		.format-row {
			grid-template-columns: 3.2rem 1fr auto;
		}
	}
</style>
