/**
 * Decoding and rendering live entirely on `AudioBuffer` — the browser's own
 * `decodeAudioData` handles MP3/WAV/OGG/M4A, same "trust the platform's audited
 * codec" instinct as Crest trusting `canvas.toBlob` for PNG rather than
 * hand-rolling one. What this file hand-rolls is the trim/fade/gain math, since
 * there's no Web Audio API that does that offline in one call.
 */

export type SpliceOptions = {
	/** Selection start, in seconds, relative to the source buffer. */
	start: number;
	/** Selection end, in seconds. */
	end: number;
	/** Fade-in length, in seconds, clamped to the selection at render time. */
	fadeIn: number;
	/** Fade-out length, in seconds, clamped to the selection at render time. */
	fadeOut: number;
	/** Linear gain multiplier — 1 is unity, from a dB slider via `dbToGain`. */
	gain: number;
};

export type SpliceResult = {
	buffer: AudioBuffer;
	/** True if gain pushed any sample outside [-1, 1] before it was clamped. */
	clipped: boolean;
};

export function dbToGain(db: number): number {
	return Math.pow(10, db / 20);
}

/**
 * One function drives both the live preview and the exported file — same
 * pattern as Mat's `renderMat`/Crest's `renderIcon`, so what you hear when you
 * click Play is provably the same math as what ends up in the download.
 */
export function buildOutputBuffer(
	ctx: BaseAudioContext,
	source: AudioBuffer,
	opts: SpliceOptions
): SpliceResult {
	const sampleRate = source.sampleRate;
	const startFrame = Math.max(0, Math.round(opts.start * sampleRate));
	const endFrame = Math.min(source.length, Math.round(opts.end * sampleRate));
	const frameCount = Math.max(1, endFrame - startFrame);
	const selectionSeconds = frameCount / sampleRate;

	// Fades can't outlast the selection they're inside, and mustn't overlap —
	// a 2s fade-in on a 1.5s clip would otherwise ramp past the fade-out and
	// briefly ramp back up. Splitting the selection in half is an honest cap,
	// not a silent clamp the user can't see (fade sliders themselves are
	// bounded to the current selection length in the page).
	const maxFade = selectionSeconds / 2;
	const fadeInFrames = Math.round(Math.min(opts.fadeIn, maxFade) * sampleRate);
	const fadeOutFrames = Math.round(Math.min(opts.fadeOut, maxFade) * sampleRate);

	const buffer = ctx.createBuffer(source.numberOfChannels, frameCount, sampleRate);
	let clipped = false;

	for (let channel = 0; channel < source.numberOfChannels; channel++) {
		const input = source.getChannelData(channel);
		const output = buffer.getChannelData(channel);
		for (let i = 0; i < frameCount; i++) {
			let envelope = 1;
			if (fadeInFrames > 0 && i < fadeInFrames) envelope = i / fadeInFrames;
			if (fadeOutFrames > 0 && i >= frameCount - fadeOutFrames) {
				envelope = Math.min(envelope, (frameCount - 1 - i) / fadeOutFrames);
			}
			let sample = input[startFrame + i] * opts.gain * envelope;
			if (sample > 1 || sample < -1) {
				clipped = true;
				sample = Math.max(-1, Math.min(1, sample));
			}
			output[i] = sample;
		}
	}

	return { buffer, clipped };
}

export function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
	const minutes = Math.floor(seconds / 60);
	const rest = seconds - minutes * 60;
	return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}
