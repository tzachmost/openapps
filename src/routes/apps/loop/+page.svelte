<script lang="ts">
	import ToolHeader from '$lib/components/ToolHeader.svelte';
	import RelatedTools from '$lib/components/RelatedTools.svelte';
	import Button from '$lib/components/Button.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import Dropzone from '$lib/components/Dropzone.svelte';
	import { takePendingFile } from '$lib/fileHandoff';
	import { formatBytes } from '$lib/format';
	import { captureFrames, computeFrameTimes, computeOutputSize } from '$lib/loop/capture';
	import { buildGlobalPalette, mapToIndices } from '$lib/loop/quantize';
	import { encodeGif, type IndexedFrame } from '$lib/loop/gif';

	const FPS_OPTIONS = [5, 10, 15, 20];
	const WIDTH_OPTIONS = [240, 320, 480, 640];
	const COLOR_OPTIONS = [32, 64, 128, 256];
	const MAX_FRAMES = 360;
	const DEFAULT_CLIP_SECONDS = 4;

	let videoEl: HTMLVideoElement | undefined = $state();

	let videoUrl = $state<string | null>(null);
	let sourceName = $state('clip');
	let duration = $state(0);
	let sourceWidth = $state(0);
	let sourceHeight = $state(0);

	let trimStart = $state(0);
	let trimEnd = $state(0);
	let fps = $state(10);
	let targetWidth = $state(320);
	let colorCount = $state(128);

	let errorMessage = $state<string | null>(null);
	let phase = $state<'idle' | 'sampling' | 'encoding' | 'done'>('idle');
	let progressDone = $state(0);
	let progressTotal = $state(0);

	let resultUrl = $state<string | null>(null);
	let resultBytes = $state(0);
	let resultFrames = $state(0);

	const frameCount = $derived(duration > 0 ? computeFrameTimes(trimStart, trimEnd, fps).length : 0);
	const outputSize = $derived(
		sourceWidth > 0
			? computeOutputSize(sourceWidth, sourceHeight, targetWidth)
			: { width: 0, height: 0 }
	);
	const overBudget = $derived(frameCount > MAX_FRAMES);
	const canGenerate = $derived(
		duration > 0 &&
			trimEnd > trimStart &&
			!overBudget &&
			phase !== 'sampling' &&
			phase !== 'encoding'
	);

	function formatTime(seconds: number): string {
		const s = Math.max(0, seconds);
		const m = Math.floor(s / 60);
		const rem = (s % 60).toFixed(1).padStart(4, '0');
		return `${m}:${rem}`;
	}

	function revokeVideo() {
		if (videoUrl) URL.revokeObjectURL(videoUrl);
		videoUrl = null;
	}

	function revokeResult() {
		if (resultUrl) URL.revokeObjectURL(resultUrl);
		resultUrl = null;
	}

	function loadFile(file: File) {
		if (!file.type.startsWith('video/')) {
			errorMessage = 'That file is not a video.';
			return;
		}
		revokeVideo();
		revokeResult();
		phase = 'idle';
		errorMessage = null;
		sourceName = file.name.replace(/\.[^.]+$/, '') || 'clip';
		videoUrl = URL.createObjectURL(file);
	}

	async function onLoadedMetadata() {
		if (!videoEl) return;
		// Some MediaRecorder-produced files (webm/mkv, common from phones and
		// screen recorders) report duration as Infinity until you seek past the
		// end once — a known browser quirk, not specific to this tool.
		if (!isFinite(videoEl.duration)) {
			videoEl.currentTime = 1e101;
			await new Promise<void>((resolve) => {
				const onUpdate = () => {
					videoEl?.removeEventListener('timeupdate', onUpdate);
					resolve();
				};
				videoEl!.addEventListener('timeupdate', onUpdate);
			});
			videoEl.currentTime = 0;
		}
		duration = videoEl.duration;
		sourceWidth = videoEl.videoWidth;
		sourceHeight = videoEl.videoHeight;
		trimStart = 0;
		trimEnd = Math.min(duration, DEFAULT_CLIP_SECONDS);
	}

	function onDropFiles(files: FileList | File[]) {
		const file = files[0];
		if (file) loadFile(file);
	}

	function markStart() {
		if (!videoEl) return;
		trimStart = Math.min(videoEl.currentTime, trimEnd - 0.1);
	}

	function markEnd() {
		if (!videoEl) return;
		trimEnd = Math.max(videoEl.currentTime, trimStart + 0.1);
	}

	async function previewTrim() {
		if (!videoEl) return;
		videoEl.currentTime = trimStart;
		try {
			await videoEl.play();
		} catch {
			// Autoplay can be blocked; scrubbing to the start point still helps.
		}
		const onTime = () => {
			if (!videoEl) return;
			if (videoEl.currentTime >= trimEnd) {
				videoEl.pause();
				videoEl.removeEventListener('timeupdate', onTime);
			}
		};
		videoEl.addEventListener('timeupdate', onTime);
	}

	async function generate() {
		if (!videoEl || !canGenerate) return;
		revokeResult();
		errorMessage = null;
		phase = 'sampling';
		progressDone = 0;
		progressTotal = frameCount;

		try {
			const wasPaused = videoEl.paused;
			videoEl.pause();
			const frames = await captureFrames(
				videoEl,
				{ start: trimStart, end: trimEnd, fps, targetWidth },
				(done, total) => {
					progressDone = done;
					progressTotal = total;
				}
			);
			if (wasPaused) videoEl.currentTime = trimStart;

			phase = 'encoding';
			// Yield once so "Encoding…" actually paints before the synchronous
			// palette + LZW work blocks the main thread.
			await new Promise((r) => setTimeout(r, 0));

			const palette = buildGlobalPalette(frames, colorCount);
			const delayCs = Math.max(2, Math.round(100 / fps));
			const indexed: IndexedFrame[] = frames.map((frame) => ({
				indices: mapToIndices(frame, palette),
				delayCs
			}));

			const bytes = encodeGif({
				width: outputSize.width,
				height: outputSize.height,
				palette,
				frames: indexed,
				loopCount: 0
			});

			const blob = new Blob([bytes], { type: 'image/gif' });
			resultUrl = URL.createObjectURL(blob);
			resultBytes = blob.size;
			resultFrames = indexed.length;
			phase = 'done';
		} catch (error) {
			errorMessage =
				error instanceof Error ? error.message : 'Could not build a GIF from this clip.';
			phase = 'idle';
		}
	}

	function download() {
		if (!resultUrl) return;
		const link = document.createElement('a');
		link.href = resultUrl;
		link.download = `${sourceName}-loop.gif`;
		link.click();
	}

	function reset() {
		revokeVideo();
		revokeResult();
		phase = 'idle';
		duration = 0;
		errorMessage = null;
	}

	// Landing page's file-drop hub hands off a file here instead of asking for a second drop.
	const handoffFile = takePendingFile();
	if (handoffFile) loadFile(handoffFile);
</script>

<svelte:head>
	<title>Loop — trim a video into a GIF</title>
	<meta
		name="description"
		content="Trim a clip and Loop turns it into an animated GIF right in your browser — a hand-rolled encoder with real LZW compression and a shared color palette across every frame. Nothing is uploaded."
	/>
</svelte:head>

<div class="page">
	<ToolHeader title="Loop">
		Trim a video clip to the part worth keeping, and Loop renders it to an animated GIF — frame
		sampling, color quantization, and LZW compression all written from scratch and run on your
		device. Nothing leaves the browser.
	</ToolHeader>

	{#if !videoUrl}
		<Dropzone accept="video/*" onFiles={onDropFiles} class="loop-dropzone">
			<p><strong>Drop a video here</strong> or click to browse.</p>
			<p class="hint">Any format your browser can play — MP4, WebM, MOV.</p>
		</Dropzone>
		{#if errorMessage}
			<p class="error">{errorMessage}</p>
		{/if}
	{:else}
		<div class="workspace">
			<Panel class="stage">
				<video
					bind:this={videoEl}
					src={videoUrl}
					controls
					playsinline
					muted
					onloadedmetadata={onLoadedMetadata}
				></video>

				<div class="trim-controls">
					<Button variant="ghost" size="small" onclick={markStart}>Mark start</Button>
					<span class="trim-readout">{formatTime(trimStart)} – {formatTime(trimEnd)}</span>
					<Button variant="ghost" size="small" onclick={markEnd}>Mark end</Button>
					<Button variant="ghost" size="small" onclick={previewTrim}>▶ Preview trim</Button>
				</div>

				<div class="fine">
					<label>
						<span>Start</span>
						<input
							type="range"
							min="0"
							max={duration}
							step="0.1"
							bind:value={trimStart}
							oninput={() => {
								if (trimStart > trimEnd - 0.1) trimStart = Math.max(0, trimEnd - 0.1);
							}}
						/>
					</label>
					<label>
						<span>End</span>
						<input
							type="range"
							min="0"
							max={duration}
							step="0.1"
							bind:value={trimEnd}
							oninput={() => {
								if (trimEnd < trimStart + 0.1) trimEnd = Math.min(duration, trimStart + 0.1);
							}}
						/>
					</label>
				</div>
			</Panel>

			<Panel class="settings-panel">
				<div class="panel-head">
					<p class="file">{sourceName}</p>
					<Button variant="ghost" size="small" onclick={reset}>New clip</Button>
				</div>

				<fieldset>
					<legend>Frame rate</legend>
					<div class="segmented">
						{#each FPS_OPTIONS as option (option)}
							<label class:selected={fps === option}>
								<input type="radio" bind:group={fps} value={option} />
								{option} fps
							</label>
						{/each}
					</div>
				</fieldset>

				<fieldset>
					<legend>Width</legend>
					<div class="segmented">
						{#each WIDTH_OPTIONS as option (option)}
							<label class:selected={targetWidth === option}>
								<input type="radio" bind:group={targetWidth} value={option} />
								{option}px
							</label>
						{/each}
					</div>
				</fieldset>

				<fieldset>
					<legend>Colors</legend>
					<div class="segmented">
						{#each COLOR_OPTIONS as option (option)}
							<label class:selected={colorCount === option}>
								<input type="radio" bind:group={colorCount} value={option} />
								{option}
							</label>
						{/each}
					</div>
				</fieldset>

				<div class="estimate">
					<p>
						{frameCount} frames · {outputSize.width} × {outputSize.height}
					</p>
					{#if overBudget}
						<p class="warn">
							That's too many frames for one export (max {MAX_FRAMES}) — trim a shorter clip or
							lower the frame rate.
						</p>
					{/if}
				</div>

				<Button variant="primary" style="width: 100%;" disabled={!canGenerate} onclick={generate}>
					{phase === 'sampling'
						? `Sampling ${progressDone}/${progressTotal}…`
						: phase === 'encoding'
							? 'Encoding…'
							: 'Generate GIF'}
				</Button>
			</Panel>
		</div>

		{#if resultUrl}
			<Panel class="result">
				<img src={resultUrl} alt="Generated GIF preview" />
				<div class="result-meta">
					<p>
						{resultFrames} frames · {formatBytes(resultBytes)}
					</p>
					<Button variant="primary" style="width: 100%;" onclick={download}>Download GIF</Button>
				</div>
			</Panel>
		{/if}

		{#if errorMessage}
			<p class="error">{errorMessage}</p>
		{/if}
	{/if}

	<RelatedTools slug="loop" />
</div>

<style>
	.page {
		max-width: 62rem;
		margin: 0 auto;
		padding: 0 clamp(1.25rem, 4vw, 3rem) 4rem;
	}

	:global(.loop-dropzone) {
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

	:global(.stage) {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	video {
		display: block;
		width: 100%;
		max-height: 26rem;
		border-radius: 10px;
		background: #000;
	}

	.trim-controls {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.trim-readout {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-dim);
		margin-right: auto;
	}

	.fine {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.fine label {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.75rem;
		color: var(--text-dim);
	}

	.fine span {
		width: 2.6rem;
		flex-shrink: 0;
	}

	input[type='range'] {
		width: 100%;
		accent-color: var(--accent);
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

	.estimate p {
		font-size: 0.78rem;
		font-family: var(--font-mono);
		color: var(--text-dim);
	}

	.warn {
		margin-top: 0.4rem;
		font-family: var(--font-sans);
		color: var(--accent);
	}

	:global(.result) {
		margin-top: 1.5rem;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 1.25rem;
	}

	:global(.result) img {
		max-width: 20rem;
		max-height: 16rem;
		width: auto;
		height: auto;
		border-radius: 10px;
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

	.result-meta {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.result-meta p {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--text-dim);
	}

	.error {
		margin-top: 1rem;
		font-size: 0.85rem;
		color: var(--accent);
	}
</style>
