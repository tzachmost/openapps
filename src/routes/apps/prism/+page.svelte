<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import ToolHeader from '$lib/components/ToolHeader.svelte';
	import Button from '$lib/components/Button.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
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

	type Mode = 'color' | 'gradient';

	const MODES: { value: Mode; label: string }[] = [
		{ value: 'color', label: 'Color' },
		{ value: 'gradient', label: 'Gradient' }
	];

	let mode = $state<Mode>('color');

	// Reading the URL's query string is only meaningful once hydrated on a real visit — during
	// prerendering there's no request to read one from, so this has to happen after mount, not
	// at component init (a static build has no "the" query string to bake in).
	onMount(() => {
		const requested = page.url.searchParams.get('mode');
		if (MODES.some((m) => m.value === requested)) mode = requested as Mode;
	});

	// ---------------------------------------------------------------------------
	// Color (from Hue) — pick a color, read every format, build a harmony, check
	// contrast and colorblind simulation against a foreground/background pair.
	// ---------------------------------------------------------------------------

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
	let colorDragTarget = $state<'sv' | 'hue' | null>(null);

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
		colorDragTarget = 'sv';
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		const p = svPointFromEvent(event);
		sat = p.s;
		val = p.v;
	}

	function startHueDrag(event: PointerEvent) {
		event.preventDefault();
		colorDragTarget = 'hue';
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		hue = huePointFromEvent(event);
	}

	function onColorDragMove(event: PointerEvent) {
		if (colorDragTarget === 'sv') {
			const p = svPointFromEvent(event);
			sat = p.s;
			val = p.v;
		} else if (colorDragTarget === 'hue') {
			hue = huePointFromEvent(event);
		}
	}

	function endColorDrag() {
		colorDragTarget = null;
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

	let copiedHarmonySwatch = $state<string | null>(null);
	async function copyHarmonySwatch(hex: string) {
		try {
			await navigator.clipboard.writeText(hex);
			copiedHarmonySwatch = hex;
			setTimeout(() => {
				if (copiedHarmonySwatch === hex) copiedHarmonySwatch = null;
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
	let colorSection = $state<'harmonies' | 'accessibility'>('harmonies');

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

	// ---------------------------------------------------------------------------
	// Gradient (from Bloom) — drag a few colored orbs into a soft mesh gradient.
	// ---------------------------------------------------------------------------

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

	function clampPercent(value: number): number {
		return Math.min(100, Math.max(0, value));
	}

	function positionFromEvent(event: PointerEvent): { x: number; y: number } | null {
		if (!stageEl) return null;
		const rect = stageEl.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return null;
		return {
			x: clampPercent(((event.clientX - rect.left) / rect.width) * 100),
			y: clampPercent(((event.clientY - rect.top) / rect.height) * 100)
		};
	}

	function startDrag(event: PointerEvent, id: string) {
		event.preventDefault();
		draggingId = id;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function onGradientDragMove(event: PointerEvent) {
		if (!draggingId) return;
		const pos = positionFromEvent(event);
		if (!pos) return;
		const id = draggingId;
		stops = stops.map((s) =>
			s.id === id ? { ...s, x: Math.round(pos.x), y: Math.round(pos.y) } : s
		);
	}

	function endGradientDrag() {
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
		link.download = `prism-${presetId}.png`;
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

	// --- one window listener drives whichever drag (color picker or gradient orb) is active ---
	function onWindowPointerMove(event: PointerEvent) {
		onColorDragMove(event);
		onGradientDragMove(event);
	}
	function onWindowPointerUp() {
		endColorDrag();
		endGradientDrag();
	}
</script>

<svelte:window onpointermove={onWindowPointerMove} onpointerup={onWindowPointerUp} />

<svelte:head>
	<title>Prism — color picker, harmonies, gradients, and contrast checks</title>
	<meta
		name="description"
		content="Pick a color to see it in every format, build a matching harmony, check WCAG contrast and colorblind simulation — or switch to Gradient and drag colored orbs into a soft, grainy mesh gradient. Everything renders on your device."
	/>
</svelte:head>

<div class="page" class:wide={mode === 'gradient'}>
	<ToolHeader title="Prism">
		{#if mode === 'color'}
			Pick a color to see it in every format at once, build a matching harmony, check its contrast,
			and preview how it looks under color vision deficiencies. Nothing here touches a server — the
			OKLab math and colorblindness simulation are hand-rolled, right down to the formulas.
		{:else}
			Pick a palette, drag its orbs into place, and blur them into a soft gradient with a little
			film grain over the top — export a PNG at wallpaper resolution, or copy CSS to use it on the
			web.
		{/if}
	</ToolHeader>

	<div class="mode-row">
		<Segmented label="Section" bind:value={mode} options={MODES} />
	</div>

	{#if mode === 'color'}
		<Panel class="picker">
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
		</Panel>

		<div class="section-toggle">
			<Segmented
				label="Section"
				bind:value={colorSection}
				options={[
					{ value: 'harmonies', label: 'Harmonies' },
					{ value: 'accessibility', label: 'Accessibility' }
				]}
			/>
		</div>

		{#if colorSection === 'harmonies'}
			<Panel class="harmonies-panel">
				<Segmented
					compact
					label="Harmony type"
					bind:value={harmonyType}
					options={HARMONY_TYPES.map((type) => ({ value: type, label: HARMONY_LABELS[type] }))}
				/>

				<div class="harmony-grid">
					{#each palette as swatch (swatch.label + swatch.hex)}
						<button
							class="harmony-swatch"
							style:background={swatch.hex}
							style:color={pickTextColor(swatch.hex) === 'dark' ? '#17150f' : '#f4f1ea'}
							onclick={() => copyHarmonySwatch(swatch.hex)}
						>
							<span class="harmony-swatch-label">{swatch.label}</span>
							<span class="harmony-swatch-hex"
								>{copiedHarmonySwatch === swatch.hex ? 'Copied!' : swatch.hex}</span
							>
						</button>
					{/each}
				</div>

				<Button variant="ghost" style="margin-top: 1rem;" onclick={copyPaletteCss}>
					{copiedPaletteCss ? 'Copied!' : 'Copy palette as CSS variables'}
				</Button>
			</Panel>
		{:else}
			<Panel class="harmonies-panel accessibility">
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
						<Button variant="ghost" size="small" onclick={() => (fg = baseHex)}
							>Use picker color</Button
						>
					</div>
					<div class="swap">
						<Button
							variant="ghost"
							size="small"
							onclick={swapFgBg}
							aria-label="Swap text and background">⇅</Button
						>
					</div>
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
						<Button variant="ghost" size="small" onclick={() => (bg = baseHex)}
							>Use picker color</Button
						>
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
					achromatopsia — real color vision varies far more than four fixed categories, and this
					isn't a diagnostic tool.
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
			</Panel>
		{/if}
	{:else}
		<div class="workspace">
			<Panel class="stage-wrap">
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
			</Panel>

			<Panel class="settings-panel">
				<div class="panel-head">
					<p class="label">Presets</p>
					<Button variant="ghost" size="small" onclick={reset}>Reset</Button>
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
									oninput={(e) =>
										setStopColor(stop.id, (e.currentTarget as HTMLInputElement).value)}
									aria-label="Orb color"
								/>
								<input
									type="range"
									min="30"
									max="90"
									value={stop.size}
									oninput={(e) =>
										setStopSize(stop.id, Number((e.currentTarget as HTMLInputElement).value))}
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
						<Button
							variant="ghost"
							size="small"
							disabled={stops.length >= MAX_STOPS}
							onclick={addStop}>+ Add orb</Button
						>
						<Button variant="ghost" size="small" onclick={shuffle}>Shuffle positions</Button>
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
					<Segmented
						label="Size"
						bind:value={sizeId}
						options={BLOOM_SIZES.map((option) => ({ value: option.id, label: option.label }))}
					/>
				</fieldset>
			</Panel>
		</div>

		<Panel class="export">
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
				<Button variant="ghost" onclick={copyCss}>Copy CSS</Button>
				<Button variant="ghost" onclick={copyImage}>Copy image</Button>
				<Button variant="primary" onclick={download}>Download PNG</Button>
			</div>
		</Panel>

		<p class="notice" aria-live="polite">{notice ?? ''}</p>

		<Panel class="css-preview">
			<details>
				<summary>Preview the CSS</summary>
				<pre>{css}</pre>
				<p class="note">
					An approximation, not a pixel match — flat color stops with no blur or grain, since CSS
					has no equivalent of blurring each shape before it composites. Use the PNG for the full
					effect.
				</p>
			</details>
		</Panel>
	{/if}
</div>

<style>
	.page {
		max-width: 48rem;
		margin: 0 auto;
		padding: 0 clamp(1.25rem, 4vw, 3rem) 4rem;
	}

	.page.wide {
		max-width: 62rem;
	}

	.mode-row {
		margin-top: 1.5rem;
	}

	:global(.picker),
	:global(.harmonies-panel) {
		margin-top: 1.5rem;
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

	/* --- section toggle (harmonies / accessibility) --- */

	.section-toggle {
		margin-top: 1.5rem;
	}

	/* --- harmonies --- */

	.harmony-grid {
		margin-top: 1rem;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
		gap: 0.6rem;
	}

	.harmony-swatch {
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

	.harmony-swatch-label {
		font-size: 0.72rem;
		opacity: 0.85;
	}

	.harmony-swatch-hex {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-weight: 600;
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

	/* --- gradient --- */

	.workspace {
		margin-top: 1.5rem;
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

	:global(.settings-panel) {
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
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

	:global(.export) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 1rem;
		margin-top: 1rem;
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

	.notice {
		min-height: 1.2rem;
		margin-top: 0.6rem;
		text-align: right;
		font-size: 0.78rem;
		color: var(--text-dim);
	}

	:global(.css-preview) {
		margin-top: 1rem;
	}

	:global(.css-preview) summary {
		cursor: pointer;
		font-size: 0.85rem;
		color: var(--text-dim);
	}

	:global(.css-preview) summary:hover {
		color: var(--text);
	}

	:global(.css-preview) pre {
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
