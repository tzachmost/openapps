<script lang="ts">
	import { onDestroy } from 'svelte';
	import ToolHeader from '$lib/components/ToolHeader.svelte';
	import RelatedTools from '$lib/components/RelatedTools.svelte';
	import Button from '$lib/components/Button.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import Dropzone from '$lib/components/Dropzone.svelte';
	import { takePendingFile } from '$lib/fileHandoff';
	import { formatBytes } from '$lib/format';
	import {
		buildOutputBuffer,
		dbToGain,
		formatDuration,
		type SpliceOptions
	} from '$lib/splice/audio';
	import { encodeWav } from '$lib/splice/wav';
	import { computePeaks, drawWaveform, type WaveformColors } from '$lib/splice/waveform';

	const PEAK_BUCKETS = 640;
	const MIN_SELECTION = 0.02;
	const AUDIO_EXTENSIONS = /\.(mp3|wav|wave|ogg|oga|m4a|aac|flac|opus|webm)$/i;

	let originalBuffer = $state<AudioBuffer | null>(null);
	let sourceName = $state('audio');
	let sourceSize = $state(0);
	let errorMessage = $state<string | null>(null);
	let stageEl: HTMLDivElement | undefined = $state();
	let canvasEl: HTMLCanvasElement | undefined = $state();

	let selStart = $state(0);
	let selEnd = $state(0);
	let fadeInSec = $state(0);
	let fadeOutSec = $state(0);
	let gainDb = $state(0);

	let dragMode = $state<'create' | 'start' | 'end' | null>(null);
	let dragAnchor = 0;

	let playing = $state(false);
	let playheadFrac = $state<number | null>(null);
	let clipped = $state(false);
	let notice = $state<string | null>(null);
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;
	let colorTick = $state(0);

	let audioCtx: AudioContext | null = null;
	let currentSource: AudioBufferSourceNode | null = null;
	let rafId: number | null = null;

	const duration = $derived(originalBuffer?.duration ?? 0);
	const peaks = $derived(originalBuffer ? computePeaks(originalBuffer, PEAK_BUCKETS) : null);
	const selDuration = $derived(Math.max(0, selEnd - selStart));
	const maxFade = $derived(Math.max(0, selDuration / 2));
	const startPct = $derived(duration > 0 ? (selStart / duration) * 100 : 0);
	const endPct = $derived(duration > 0 ? (selEnd / duration) * 100 : 100);

	const opts = $derived<SpliceOptions>({
		start: selStart,
		end: selEnd,
		fadeIn: Math.min(fadeInSec, maxFade),
		fadeOut: Math.min(fadeOutSec, maxFade),
		gain: dbToGain(gainDb)
	});

	const channelLabel = $derived(
		!originalBuffer
			? ''
			: originalBuffer.numberOfChannels === 1
				? 'mono'
				: originalBuffer.numberOfChannels === 2
					? 'stereo'
					: `${originalBuffer.numberOfChannels}-channel`
	);

	// Fade sliders can't outlive the selection they sit inside — same clamp
	// `buildOutputBuffer` applies at render time, mirrored here so the slider
	// itself never shows a value it isn't honoring.
	$effect(() => {
		if (fadeInSec > maxFade) fadeInSec = maxFade;
		if (fadeOutSec > maxFade) fadeOutSec = maxFade;
	});

	$effect(() => {
		// Re-reading colorTick forces a redraw after an OS theme flip even if
		// no other state changed — otherwise the waveform would keep the old
		// theme's colors until the next drag or slider tick.
		void colorTick;
		if (!canvasEl || !peaks) return;
		drawWaveform(canvasEl, peaks, {
			selectionStart: duration > 0 ? selStart / duration : 0,
			selectionEnd: duration > 0 ? selEnd / duration : 1,
			playhead: playheadFrac,
			colors: resolveColors()
		});
	});

	$effect(() => {
		const query = window.matchMedia('(prefers-color-scheme: dark)');
		const onChange = () => (colorTick += 1);
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	});

	onDestroy(() => {
		stopPlayback();
		audioCtx?.close();
	});

	function hexToRgba(hex: string, alpha: number): string {
		const clean = hex.trim().replace('#', '');
		const r = parseInt(clean.slice(0, 2), 16);
		const g = parseInt(clean.slice(2, 4), 16);
		const b = parseInt(clean.slice(4, 6), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	function resolveColors(): WaveformColors {
		const styles = getComputedStyle(document.documentElement);
		const text = styles.getPropertyValue('--text').trim() || '#17150f';
		const textDim = styles.getPropertyValue('--text-dim').trim() || '#6b6659';
		const accent = styles.getPropertyValue('--accent').trim() || '#dd4b1f';
		return {
			bar: text,
			barDim: hexToRgba(textDim, 0.55),
			selectionFill: hexToRgba(accent, 0.1),
			playhead: accent
		};
	}

	function flash(message: string) {
		notice = message;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = null), 1600);
	}

	function ensureContext(): AudioContext {
		if (!audioCtx) audioCtx = new AudioContext();
		return audioCtx;
	}

	async function loadFile(file: File) {
		const looksLikeAudio = file.type.startsWith('audio/') || AUDIO_EXTENSIONS.test(file.name);
		if (!looksLikeAudio) {
			errorMessage = 'That file does not look like audio.';
			return;
		}
		try {
			const ctx = ensureContext();
			const bytes = await file.arrayBuffer();
			const decoded = await ctx.decodeAudioData(bytes);
			stopPlayback();
			originalBuffer = decoded;
			sourceName = file.name.replace(/\.[^.]+$/, '') || 'audio';
			sourceSize = file.size;
			selStart = 0;
			selEnd = decoded.duration;
			fadeInSec = 0;
			fadeOutSec = 0;
			gainDb = 0;
			clipped = false;
			errorMessage = null;
		} catch {
			errorMessage = 'Could not decode this audio file — try a different format.';
		}
	}

	function onDropFiles(files: FileList | File[]) {
		const file = files[0];
		if (file) loadFile(file);
	}

	function fracFromEvent(event: PointerEvent): number {
		if (!stageEl) return 0;
		const rect = stageEl.getBoundingClientRect();
		if (rect.width === 0) return 0;
		return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
	}

	function secondsFromEvent(event: PointerEvent): number {
		return fracFromEvent(event) * duration;
	}

	function onStagePointerDown(event: PointerEvent) {
		if (!originalBuffer) return;
		event.preventDefault();
		const t = secondsFromEvent(event);
		dragAnchor = t;
		selStart = t;
		selEnd = t;
		dragMode = 'create';
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function onHandlePointerDown(event: PointerEvent, which: 'start' | 'end') {
		event.preventDefault();
		event.stopPropagation();
		dragMode = which;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function onDragMove(event: PointerEvent) {
		if (!dragMode || !originalBuffer) return;
		const t = secondsFromEvent(event);
		if (dragMode === 'create') {
			selStart = Math.max(0, Math.min(dragAnchor, t));
			selEnd = Math.min(duration, Math.max(dragAnchor, t));
		} else if (dragMode === 'start') {
			selStart = Math.max(0, Math.min(t, selEnd - MIN_SELECTION));
		} else {
			selEnd = Math.min(duration, Math.max(t, selStart + MIN_SELECTION));
		}
	}

	function endDrag() {
		dragMode = null;
	}

	function onHandleKeydown(event: KeyboardEvent, which: 'start' | 'end') {
		if (!originalBuffer) return;
		let direction = 0;
		if (event.key === 'ArrowLeft') direction = -1;
		else if (event.key === 'ArrowRight') direction = 1;
		else return;
		event.preventDefault();
		const delta = direction * (event.shiftKey ? 1 : 0.05);
		if (which === 'start')
			selStart = Math.max(0, Math.min(selStart + delta, selEnd - MIN_SELECTION));
		else selEnd = Math.min(duration, Math.max(selEnd + delta, selStart + MIN_SELECTION));
	}

	function selectAll() {
		if (!originalBuffer) return;
		selStart = 0;
		selEnd = originalBuffer.duration;
	}

	function resetSettings() {
		if (!originalBuffer) return;
		selStart = 0;
		selEnd = originalBuffer.duration;
		fadeInSec = 0;
		fadeOutSec = 0;
		gainDb = 0;
		flash('Reset');
	}

	function stopPlayback() {
		if (currentSource) {
			currentSource.onended = null;
			try {
				currentSource.stop();
			} catch {
				// Already stopped — nothing to do.
			}
			currentSource = null;
		}
		playing = false;
		playheadFrac = null;
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
	}

	async function togglePlay() {
		if (playing) {
			stopPlayback();
			return;
		}
		if (!originalBuffer || selDuration <= 0) return;
		const ctx = ensureContext();
		if (ctx.state === 'suspended') await ctx.resume();

		const { buffer, clipped: didClip } = buildOutputBuffer(ctx, originalBuffer, opts);
		clipped = didClip;

		const source = ctx.createBufferSource();
		source.buffer = buffer;
		source.connect(ctx.destination);
		const startedAt = ctx.currentTime;
		const playLength = buffer.duration;
		source.onended = () => {
			if (currentSource !== source) return;
			currentSource = null;
			playing = false;
			playheadFrac = null;
			if (rafId !== null) {
				cancelAnimationFrame(rafId);
				rafId = null;
			}
		};
		source.start();
		currentSource = source;
		playing = true;

		const tick = () => {
			if (currentSource !== source) return;
			const elapsed = ctx.currentTime - startedAt;
			playheadFrac = duration > 0 ? Math.min(selEnd, selStart + elapsed) / duration : 0;
			if (elapsed < playLength) rafId = requestAnimationFrame(tick);
		};
		rafId = requestAnimationFrame(tick);
	}

	async function download() {
		if (!originalBuffer || selDuration <= 0) return;
		const ctx = ensureContext();
		const { buffer, clipped: didClip } = buildOutputBuffer(ctx, originalBuffer, opts);
		clipped = didClip;
		const bytes = encodeWav(buffer);
		const blob = new Blob([bytes], { type: 'audio/wav' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${sourceName}-splice.wav`;
		link.click();
		URL.revokeObjectURL(url);
		flash('Downloaded');
	}

	function clearAudio() {
		stopPlayback();
		originalBuffer = null;
		sourceSize = 0;
		clipped = false;
	}

	// Landing page's file-drop hub hands off a file here instead of asking for a second drop.
	const handoffFile = takePendingFile();
	if (handoffFile) loadFile(handoffFile);
</script>

<svelte:window onpointermove={onDragMove} onpointerup={endDrag} />

<svelte:head>
	<title>Splice — trim and fade audio</title>
	<meta
		name="description"
		content="Drop in an audio clip, drag across the waveform to pick a range, add a fade at either edge, nudge the level, and export a clean WAV — decoded and rendered entirely in your browser."
	/>
</svelte:head>

<div class="page">
	<ToolHeader title="Splice">
		Drop in a clip and drag across the waveform to pick the part worth keeping. Fade either edge,
		nudge the level, and export a clean WAV — no upload, no re-encoding you can't see.
	</ToolHeader>

	{#if !originalBuffer}
		<Dropzone accept="audio/*" onFiles={onDropFiles} class="splice-dropzone">
			<p><strong>Drop an audio file here</strong> or click to browse.</p>
			<p class="hint">MP3, WAV, OGG, M4A — anything your browser can decode.</p>
		</Dropzone>
		{#if errorMessage}
			<p class="error">{errorMessage}</p>
		{/if}
	{:else}
		<div class="workspace">
			<Panel class="stage">
				<div
					class="wave-wrap"
					bind:this={stageEl}
					onpointerdown={onStagePointerDown}
					role="presentation"
				>
					<canvas bind:this={canvasEl} width="1200" height="180" aria-label="Waveform"></canvas>
					<button
						class="handle start"
						style:left="{startPct}%"
						onpointerdown={(event) => onHandlePointerDown(event, 'start')}
						onkeydown={(event) => onHandleKeydown(event, 'start')}
						aria-label="Selection start"
					></button>
					<button
						class="handle end"
						style:left="{endPct}%"
						onpointerdown={(event) => onHandlePointerDown(event, 'end')}
						onkeydown={(event) => onHandleKeydown(event, 'end')}
						aria-label="Selection end"
					></button>
				</div>

				<div class="transport">
					<button
						class="play-btn"
						onclick={togglePlay}
						disabled={selDuration <= 0}
						aria-label={playing ? 'Stop preview' : 'Play selection'}
					>
						{#if playing}
							<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
								<rect x="4" y="4" width="12" height="12" rx="2" />
							</svg>
						{:else}
							<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
								<path d="M6 4.5v11l9-5.5-9-5.5Z" />
							</svg>
						{/if}
					</button>
					<div class="times">
						<span>{formatDuration(selStart)}</span>
						<span class="dim">selection {formatDuration(selDuration)}</span>
						<span>{formatDuration(selEnd)}</span>
					</div>
				</div>
				<p class="note">Drag across the waveform, or either handle, to change the range.</p>
			</Panel>

			<Panel class="settings-panel">
				<div class="panel-head">
					<p class="file">{sourceName}</p>
					<Button variant="ghost" size="small" onclick={resetSettings}>Reset</Button>
				</div>

				<fieldset>
					<legend>Trim</legend>
					<Button variant="ghost" size="small" onclick={selectAll}>Select all</Button>
				</fieldset>

				<fieldset class="sliders">
					<legend>Fade</legend>
					<label>
						<span>In <em>{fadeInSec.toFixed(2)}s</em></span>
						<input type="range" min="0" max={maxFade} step="0.01" bind:value={fadeInSec} />
					</label>
					<label>
						<span>Out <em>{fadeOutSec.toFixed(2)}s</em></span>
						<input type="range" min="0" max={maxFade} step="0.01" bind:value={fadeOutSec} />
					</label>
				</fieldset>

				<fieldset class="sliders">
					<legend>Gain</legend>
					<label>
						<span>Level <em>{gainDb > 0 ? '+' : ''}{gainDb.toFixed(1)} dB</em></span>
						<input type="range" min="-12" max="12" step="0.5" bind:value={gainDb} />
					</label>
					{#if clipped}
						<p class="warn">Clipping — the level is pushing samples past full scale.</p>
					{/if}
				</fieldset>
			</Panel>
		</div>

		<Panel class="export">
			<div class="export-meta">
				<p>
					{originalBuffer.sampleRate.toLocaleString()} Hz · {channelLabel} · {formatDuration(
						duration
					)}
					{#if sourceSize > 0}<span class="dim"> · {formatBytes(sourceSize)}</span>{/if}
				</p>
				<p class="dim">Exports {formatDuration(selDuration)} as WAV</p>
			</div>

			<div class="export-actions">
				<Button variant="ghost" onclick={clearAudio}>New file</Button>
				<Button variant="primary" onclick={download} disabled={selDuration <= 0}>
					Download WAV
				</Button>
			</div>
		</Panel>

		<p class="notice" aria-live="polite">{notice ?? ''}</p>

		{#if errorMessage}
			<p class="error">{errorMessage}</p>
		{/if}
	{/if}

	<RelatedTools slug="splice" />
</div>

<style>
	.page {
		max-width: 62rem;
		margin: 0 auto;
		padding: 0 clamp(1.25rem, 4vw, 3rem) 4rem;
	}

	:global(.splice-dropzone) {
		margin-top: 2rem;
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
		align-items: start;
	}

	@media (max-width: 56rem) {
		.workspace {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.wave-wrap {
		position: relative;
		touch-action: none;
		cursor: crosshair;
	}

	.wave-wrap canvas {
		display: block;
		width: 100%;
		height: 9rem;
		border-radius: 10px;
		background: var(--bg);
	}

	.handle {
		position: absolute;
		top: -4px;
		bottom: -4px;
		width: 12px;
		margin-left: -6px;
		padding: 0;
		border: none;
		background: transparent;
		cursor: ew-resize;
	}

	.handle::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 5px;
		width: 2px;
		background: var(--accent);
		border-radius: 2px;
	}

	.handle::after {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		width: 14px;
		height: 14px;
		border-radius: 999px;
		background: var(--accent);
		border: 2px solid var(--bg-elevated);
		transform: translate(-50%, -50%);
	}

	.handle:focus-visible::after {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.transport {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: 0.85rem;
	}

	.play-btn {
		display: grid;
		place-items: center;
		width: 2.1rem;
		height: 2.1rem;
		flex-shrink: 0;
		border-radius: 999px;
		border: 1px solid var(--border-strong);
		background: var(--bg);
		color: var(--text);
		cursor: pointer;
		transition: border-color 0.15s ease;
	}

	.play-btn:hover:not(:disabled) {
		border-color: var(--accent);
	}

	.play-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.times {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		flex-wrap: wrap;
	}

	.times .dim {
		color: var(--text-dim);
	}

	.note {
		margin-top: 0.6rem;
		font-size: 0.75rem;
		line-height: 1.4;
		color: var(--text-dim);
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

	.warn {
		margin-top: 0.5rem;
		font-size: 0.75rem;
		line-height: 1.4;
		color: var(--accent);
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
