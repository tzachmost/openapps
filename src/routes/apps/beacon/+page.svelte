<script lang="ts">
	import ToolHeader from '$lib/components/ToolHeader.svelte';
	import RelatedTools from '$lib/components/RelatedTools.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import Button from '$lib/components/Button.svelte';
	import { generateQr, type EcLevel } from '$lib/beacon/qr';
	import {
		renderToCanvas,
		toSvgString,
		contrastRatio,
		DEFAULT_QUIET_ZONE
	} from '$lib/beacon/render';

	const EC_LEVELS: { id: EcLevel; label: string; note: string }[] = [
		{ id: 'L', label: 'L', note: '~7% recovery — fits the most text' },
		{ id: 'M', label: 'M', note: '~15% recovery — good default' },
		{ id: 'Q', label: 'Q', note: '~25% recovery' },
		{ id: 'H', label: 'H', note: '~30% recovery — best if the print might get scuffed' }
	];

	const SCALES = [6, 10, 16];

	let text = $state('');
	let ecLevel = $state<EcLevel>('M');
	let foreground = $state('#000000');
	let background = $state('#ffffff');
	let scale = $state(10);
	let canvasEl: HTMLCanvasElement | undefined = $state();
	let notice = $state<string | null>(null);
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;

	const trimmed = $derived(text.trim());
	const result = $derived(trimmed === '' ? null : generateQr(trimmed, ecLevel));
	const contrast = $derived(contrastRatio(foreground, background));
	const lowContrast = $derived(contrast < 4.5);

	const renderOpts = $derived({ quietZone: DEFAULT_QUIET_ZONE, foreground, background });

	$effect(() => {
		if (!canvasEl || !result || result.ok === false) return;
		renderToCanvas(canvasEl, result, renderOpts, scale);
	});

	function flash(message: string) {
		notice = message;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = null), 1600);
	}

	function downloadPng() {
		if (!canvasEl || !result || result.ok === false) return;
		canvasEl.toBlob((blob) => {
			if (!blob) return;
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'beacon-qr.png';
			a.click();
			URL.revokeObjectURL(url);
		}, 'image/png');
	}

	function downloadSvg() {
		if (!result || result.ok === false) return;
		const svg = toSvgString(result, renderOpts);
		const blob = new Blob([svg], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'beacon-qr.svg';
		a.click();
		URL.revokeObjectURL(url);
	}

	async function copyPng() {
		if (!canvasEl || !result || result.ok === false) return;
		try {
			canvasEl.toBlob(async (blob) => {
				if (!blob) return;
				await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
				flash('Copied!');
			}, 'image/png');
		} catch {
			// Clipboard image writes can be denied by the browser — download still works.
		}
	}
</script>

<svelte:head>
	<title>Beacon — generate a QR code</title>
	<meta
		name="description"
		content="Turn a URL or any text into a QR code — pick an error-correction level and colors, then export PNG or SVG. Encoded entirely on your device, nothing is sent anywhere."
	/>
</svelte:head>

<div class="page">
	<ToolHeader title="Beacon">
		Type a URL or any text and Beacon builds a QR code for it — Reed–Solomon error correction and
		all, hand-rolled, no dependency. Export a crisp PNG or a scale-free SVG.
	</ToolHeader>

	<div class="workspace">
		<div class="stage">
			{#if !result}
				<p class="placeholder">Type something to see the code.</p>
			{:else if result.ok === false}
				<p class="placeholder error">
					That's too much text for level {ecLevel} — this level tops out around {result.maxBytes}
					characters. Try a shorter input or a lower error-correction level.
				</p>
			{:else}
				<canvas bind:this={canvasEl} aria-label="Generated QR code"></canvas>
			{/if}
		</div>

		<div class="panel" aria-label="Settings">
			<label class="field">
				<span>Content</span>
				<textarea bind:value={text} rows="4" placeholder="https://example.com" maxlength="2953"
				></textarea>
			</label>

			<fieldset>
				<legend>Error correction</legend>
				<Segmented
					compact
					label="Error correction"
					bind:value={ecLevel}
					options={EC_LEVELS.map((level) => ({ value: level.id, label: level.label }))}
				/>
				<p class="note">{EC_LEVELS.find((l) => l.id === ecLevel)?.note}</p>
			</fieldset>

			<fieldset class="colors">
				<legend>Colors</legend>
				<div class="color-row">
					<label class="color-field">
						<input type="color" bind:value={foreground} />
						<span>Foreground</span>
					</label>
					<label class="color-field">
						<input type="color" bind:value={background} />
						<span>Background</span>
					</label>
				</div>
				{#if lowContrast}
					<p class="note warn">
						Contrast is only {contrast.toFixed(1)}:1 — codes below about 4.5:1 can be unreliable to
						scan.
					</p>
				{/if}
			</fieldset>

			<fieldset>
				<legend>PNG size</legend>
				<div class="segmented">
					{#each SCALES as s (s)}
						<label class:selected={scale === s}>
							<input type="radio" bind:group={scale} value={s} />
							{s}px/module
						</label>
					{/each}
				</div>
			</fieldset>
		</div>
	</div>

	{#if result && result.ok !== false}
		<div class="export">
			<p class="meta">
				Version {result.version} · {result.size}×{result.size} modules · exports at {(result.size +
					DEFAULT_QUIET_ZONE * 2) *
					scale}×{(result.size + DEFAULT_QUIET_ZONE * 2) * scale}px
			</p>
			<div class="export-actions">
				<Button variant="ghost" onclick={copyPng}>{notice ?? 'Copy PNG'}</Button>
				<Button variant="ghost" onclick={downloadSvg}>Download SVG</Button>
				<Button variant="primary" onclick={downloadPng}>Download PNG</Button>
			</div>
		</div>
	{/if}

	<RelatedTools slug="beacon" />
</div>

<style>
	.page {
		max-width: 62rem;
		margin: 0 auto;
		padding: 0 clamp(1.25rem, 4vw, 3rem) 4rem;
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
	}

	.placeholder {
		max-width: 20rem;
		text-align: center;
		font-size: 0.9rem;
		color: var(--text-dim);
	}

	.placeholder.error {
		color: var(--accent);
	}

	canvas {
		display: block;
		max-width: 100%;
		max-height: 56vh;
		width: auto;
		height: auto;
		border-radius: 4px;
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

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: var(--text-dim);
	}

	textarea {
		font: inherit;
		font-size: 0.85rem;
		padding: 0.6rem 0.7rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
		color: var(--text);
		resize: vertical;
	}

	textarea:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
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

	.note.warn {
		color: var(--accent);
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

	.color-row {
		display: flex;
		gap: 1rem;
	}

	.color-field {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.7rem;
		color: var(--text-dim);
		cursor: pointer;
	}

	.color-field input[type='color'] {
		width: 2.6rem;
		height: 2.6rem;
		padding: 0;
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		background: none;
		cursor: pointer;
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

	.meta {
		font-size: 0.8rem;
		font-family: var(--font-mono);
		color: var(--text-dim);
	}

	.export-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
