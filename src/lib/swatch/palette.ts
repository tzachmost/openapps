export type RGB = { r: number; g: number; b: number };

export type PaletteColor = {
	rgb: RGB;
	hex: string;
	hsl: { h: number; s: number; l: number };
	/** Share of sampled pixels this color represents, 0–1. */
	population: number;
	/** Which text color reads legibly on top of this swatch. */
	textColor: 'light' | 'dark';
};

const SAMPLE_MAX_DIMENSION = 120;
const MIN_ALPHA = 125;

/**
 * Downscales the image onto a small offscreen canvas and reads back opaque-ish
 * pixels. Downscaling first keeps median-cut fast (a few thousand pixels instead
 * of millions) without materially changing the dominant colors.
 */
export function samplePixels(bitmap: ImageBitmap): RGB[] {
	const scale = Math.min(1, SAMPLE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
	const width = Math.max(1, Math.round(bitmap.width * scale));
	const height = Math.max(1, Math.round(bitmap.height * scale));

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new Error('Canvas is not supported in this browser.');
	ctx.drawImage(bitmap, 0, 0, width, height);

	const { data } = ctx.getImageData(0, 0, width, height);
	const pixels: RGB[] = [];
	for (let i = 0; i < data.length; i += 4) {
		if (data[i + 3] < MIN_ALPHA) continue;
		pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
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

/** Splits the widest, largest-range bucket in half (by median) until `colorCount` buckets exist. */
function medianCut(pixels: RGB[], colorCount: number): RGB[][] {
	const buckets: RGB[][] = [pixels];

	while (buckets.length < colorCount) {
		let splitIndex = -1;
		// Start at 0, not -1: a bucket with zero range is already a single flat color
		// (e.g. a solid background), and splitting it further just produces two
		// buckets that average back to the same duplicate color.
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

export function rgbToHex({ r, g, b }: RGB): string {
	return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const l = (max + min) / 2;

	if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };

	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h: number;
	switch (max) {
		case rn:
			h = (gn - bn) / d + (gn < bn ? 6 : 0);
			break;
		case gn:
			h = (bn - rn) / d + 2;
			break;
		default:
			h = (rn - gn) / d + 4;
	}
	h *= 60;

	return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** WCAG relative luminance, used to pick a legible black/white label color per swatch. */
function relativeLuminance({ r, g, b }: RGB): number {
	const linear = [r, g, b].map((c) => {
		const n = c / 255;
		return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
	});
	return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function buildPalette(pixels: RGB[], colorCount: number): PaletteColor[] {
	if (pixels.length === 0) return [];

	const buckets = medianCut(pixels, colorCount);
	const total = pixels.length;

	// Two different buckets can still average to the same rounded hex (e.g. two
	// near-identical off-whites either side of a soft edge) — merge those rather
	// than rendering duplicate swatches with a duplicate `each` key.
	const byHex = new Map<string, PaletteColor>();
	for (const bucket of buckets) {
		if (bucket.length === 0) continue;
		const rgb = averageColor(bucket);
		const hex = rgbToHex(rgb);
		const existing = byHex.get(hex);
		if (existing) {
			existing.population += bucket.length / total;
			continue;
		}
		byHex.set(hex, {
			rgb,
			hex,
			hsl: rgbToHsl(rgb),
			population: bucket.length / total,
			textColor: relativeLuminance(rgb) > 0.42 ? 'dark' : 'light'
		});
	}

	return [...byHex.values()].sort((a, b) => b.population - a.population);
}
