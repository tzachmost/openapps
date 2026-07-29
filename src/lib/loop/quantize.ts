/**
 * Builds one shared palette across every sampled frame (median-cut, same
 * family of algorithm as Swatch's `palette.ts`, but self-contained here since
 * this version samples across time as well as space and needs an index-map
 * step Swatch never does) and maps each frame's pixels to indices into it —
 * what a GIF's single global color table requires.
 */

export type RGB = { r: number; g: number; b: number };

const GLOBAL_SAMPLE_TARGET = 20_000;

/** Evenly-strided sample of a frame's opaque pixels, so a handful of frames costs about the same as one. */
export function sampleFramePixels(imageData: ImageData, maxSamples: number): RGB[] {
	const { data, width, height } = imageData;
	const total = width * height;
	if (total === 0) return [];
	const stride = Math.max(1, Math.floor(total / maxSamples));
	const pixels: RGB[] = [];
	for (let i = 0; i < total; i += stride) {
		const idx = i * 4;
		pixels.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
	}
	return pixels;
}

function channelRange(bucket: RGB[], channel: keyof RGB): number {
	let min = 255;
	let max = 0;
	for (const p of bucket) {
		if (p[channel] < min) min = p[channel];
		if (p[channel] > max) max = p[channel];
	}
	return max - min;
}

function widestChannel(bucket: RGB[]): keyof RGB {
	const ranges: [keyof RGB, number][] = [
		['r', channelRange(bucket, 'r')],
		['g', channelRange(bucket, 'g')],
		['b', channelRange(bucket, 'b')]
	];
	ranges.sort((a, b) => b[1] - a[1]);
	return ranges[0][0];
}

function medianCut(pixels: RGB[], colorCount: number): RGB[][] {
	const buckets: RGB[][] = [pixels];
	while (buckets.length < colorCount) {
		let splitIndex = -1;
		let splitRange = 0;
		buckets.forEach((bucket, i) => {
			if (bucket.length < 2) return;
			const channel = widestChannel(bucket);
			const range = channelRange(bucket, channel);
			if (range > splitRange) {
				splitRange = range;
				splitIndex = i;
			}
		});
		if (splitIndex === -1) break;

		const bucket = buckets[splitIndex];
		const channel = widestChannel(bucket);
		const sorted = [...bucket].sort((a, b) => a[channel] - b[channel]);
		const mid = Math.floor(sorted.length / 2);
		buckets.splice(splitIndex, 1, sorted.slice(0, mid), sorted.slice(mid));
	}
	return buckets;
}

function averageColor(bucket: RGB[]): RGB {
	const total = bucket.reduce((sum, p) => ({ r: sum.r + p.r, g: sum.g + p.g, b: sum.b + p.b }), {
		r: 0,
		g: 0,
		b: 0
	});
	return {
		r: Math.round(total.r / bucket.length),
		g: Math.round(total.g / bucket.length),
		b: Math.round(total.b / bucket.length)
	};
}

/** Samples every frame, pools the samples, and runs median-cut once over the pool. */
export function buildGlobalPalette(frames: ImageData[], colorCount: number): RGB[] {
	const perFrame = Math.max(1, Math.floor(GLOBAL_SAMPLE_TARGET / Math.max(frames.length, 1)));
	const pooled = frames.flatMap((frame) => sampleFramePixels(frame, perFrame));
	if (pooled.length === 0) return [{ r: 0, g: 0, b: 0 }];

	const buckets = medianCut(pooled, colorCount);
	const seen = new Set<string>();
	const palette: RGB[] = [];
	for (const bucket of buckets) {
		if (bucket.length === 0) continue;
		const color = averageColor(bucket);
		const key = `${color.r},${color.g},${color.b}`;
		// Two buckets can average to the same rounded color (e.g. either side of a
		// soft edge) — a GIF palette can't have a duplicate entry serve any
		// purpose, so collapse those rather than wasting a table slot.
		if (seen.has(key)) continue;
		seen.add(key);
		palette.push(color);
	}
	return palette;
}

/**
 * Maps a frame's raw pixels to indices into `palette` by nearest color
 * (squared Euclidean distance in RGB space). Caches the result per distinct
 * color it has already resolved — video frames are full of runs and repeats
 * of the same handful of colors, so this turns most of the frame into cache
 * hits instead of a fresh nearest-neighbor search per pixel.
 */
export function mapToIndices(imageData: ImageData, palette: RGB[]): Uint8Array {
	const { data, width, height } = imageData;
	const indices = new Uint8Array(width * height);
	const cache = new Map<number, number>();

	for (let p = 0; p < indices.length; p++) {
		const i = p * 4;
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		const key = (r << 16) | (g << 8) | b;

		let index = cache.get(key);
		if (index === undefined) {
			let best = 0;
			let bestDist = Infinity;
			for (let c = 0; c < palette.length; c++) {
				const dr = palette[c].r - r;
				const dg = palette[c].g - g;
				const db = palette[c].b - b;
				const dist = dr * dr + dg * dg + db * db;
				if (dist < bestDist) {
					bestDist = dist;
					best = c;
				}
			}
			index = best;
			cache.set(key, index);
		}
		indices[p] = index;
	}
	return indices;
}
