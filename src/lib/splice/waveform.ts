/**
 * A min/max-per-bucket waveform, the same technique every audio editor uses
 * for an overview view — not a full per-sample plot, which would be both
 * illegible at this width and needlessly slow to draw. Channels are mixed
 * down to mono by averaging for the *picture* only; the actual trim/fade/gain
 * math in `audio.ts` stays fully multi-channel.
 */
export type WaveformPeaks = {
	min: Float32Array;
	max: Float32Array;
};

export function computePeaks(buffer: AudioBuffer, buckets: number): WaveformPeaks {
	const channels = buffer.numberOfChannels;
	const length = buffer.length;
	const min = new Float32Array(buckets);
	const max = new Float32Array(buckets);
	const samplesPerBucket = length / buckets;
	const channelData: Float32Array[] = [];
	for (let c = 0; c < channels; c++) channelData.push(buffer.getChannelData(c));

	for (let b = 0; b < buckets; b++) {
		const start = Math.floor(b * samplesPerBucket);
		const end = Math.max(start + 1, Math.floor((b + 1) * samplesPerBucket));
		let bucketMin = 0;
		let bucketMax = 0;
		for (let i = start; i < end && i < length; i++) {
			let sample = 0;
			for (let c = 0; c < channels; c++) sample += channelData[c][i];
			sample /= channels;
			if (sample < bucketMin) bucketMin = sample;
			if (sample > bucketMax) bucketMax = sample;
		}
		min[b] = bucketMin;
		max[b] = bucketMax;
	}

	return { min, max };
}

export type WaveformColors = {
	bar: string;
	barDim: string;
	selectionFill: string;
	playhead: string;
};

export type WaveformView = {
	/** Selection bounds, each a 0–1 fraction of the total duration. */
	selectionStart: number;
	selectionEnd: number;
	/** 0–1 fraction of the total duration, or null while not playing. */
	playhead: number | null;
	colors: WaveformColors;
};

const AMPLITUDE_SCALE = 0.92;

export function drawWaveform(canvas: HTMLCanvasElement, peaks: WaveformPeaks, view: WaveformView) {
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	const width = canvas.width;
	const height = canvas.height;
	const mid = height / 2;
	ctx.clearRect(0, 0, width, height);

	const selStartX = view.selectionStart * width;
	const selEndX = view.selectionEnd * width;
	ctx.fillStyle = view.colors.selectionFill;
	ctx.fillRect(selStartX, 0, Math.max(0, selEndX - selStartX), height);

	const buckets = peaks.min.length;
	const barWidth = width / buckets;
	for (let i = 0; i < buckets; i++) {
		const frac = (i + 0.5) / buckets;
		const inSelection = frac >= view.selectionStart && frac <= view.selectionEnd;
		ctx.fillStyle = inSelection ? view.colors.bar : view.colors.barDim;
		const top = mid - peaks.max[i] * mid * AMPLITUDE_SCALE;
		const bottom = mid - peaks.min[i] * mid * AMPLITUDE_SCALE;
		ctx.fillRect(i * barWidth, top, Math.max(1, barWidth - 1), Math.max(1, bottom - top));
	}

	if (view.playhead !== null) {
		const x = view.playhead * width;
		ctx.fillStyle = view.colors.playhead;
		ctx.fillRect(x - 1, 0, 2, height);
	}
}
