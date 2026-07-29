/**
 * Samples a trimmed range of a video element into scaled-down RGBA frames,
 * ready for `quantize.ts` and `gif.ts`. Seeking (not `requestVideoFrameCallback`,
 * which some browsers don't implement) is the sampling primitive — good enough
 * accuracy for a GIF's own frame rate, which is coarser than video frame rate
 * anyway.
 */

export type CaptureOptions = {
	start: number;
	end: number;
	fps: number;
	/** Output width; height is derived to preserve the source's aspect ratio. */
	targetWidth: number;
};

/** Frame sample timestamps, `start` inclusive, stepping by `1/fps` until `end`. */
export function computeFrameTimes(start: number, end: number, fps: number): number[] {
	const step = 1 / fps;
	const times: number[] = [];
	// Guard against float drift landing a hair past `end` on the last step.
	for (let t = start; t < end - step / 2; t += step) times.push(t);
	if (times.length === 0) times.push(Math.min(start, end));
	return times;
}

export function computeOutputSize(
	sourceWidth: number,
	sourceHeight: number,
	targetWidth: number
): { width: number; height: number } {
	const width = Math.max(1, Math.min(targetWidth, sourceWidth));
	const scale = width / sourceWidth;
	const height = Math.max(1, Math.round(sourceHeight * scale));
	return { width, height };
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
	return new Promise((resolve) => {
		let settled = false;
		const done = () => {
			if (settled) return;
			settled = true;
			video.removeEventListener('seeked', onSeeked);
			clearTimeout(timer);
			resolve();
		};
		const onSeeked = () => done();
		video.addEventListener('seeked', onSeeked);
		// Some containers stall on a seek to an exact keyframe-adjacent time — a
		// timeout means one bad seek costs a slightly-off frame, not a hung export.
		const timer = setTimeout(done, 2000);
		video.currentTime = time;
	});
}

export async function captureFrames(
	video: HTMLVideoElement,
	opts: CaptureOptions,
	onProgress?: (done: number, total: number) => void
): Promise<ImageData[]> {
	const times = computeFrameTimes(opts.start, opts.end, opts.fps);
	const { width, height } = computeOutputSize(
		video.videoWidth,
		video.videoHeight,
		opts.targetWidth
	);

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new Error('Canvas is not supported in this browser.');

	const frames: ImageData[] = [];
	for (let i = 0; i < times.length; i++) {
		await seekTo(video, times[i]);
		ctx.drawImage(video, 0, 0, width, height);
		frames.push(ctx.getImageData(0, 0, width, height));
		onProgress?.(i + 1, times.length);
	}
	return frames;
}
