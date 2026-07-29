export type Stop = {
	id: string;
	/** Percent of canvas width/height, 0–100. */
	x: number;
	y: number;
	/** Percent of the canvas's longer side, used as the orb's radius. */
	size: number;
	color: string;
};

export type BloomOptions = {
	background: string;
	/** 0–100. */
	blur: number;
	/** 0–100. */
	grain: number;
};

export type BloomPreset = {
	id: string;
	label: string;
	background: string;
	stops: Omit<Stop, 'id'>[];
};

/**
 * Curated rather than a random-hue generator by default, same instinct as
 * Mat's background presets — an open palette mostly produces combinations
 * nobody would have chosen on purpose. Each preset is three orbs loosely
 * spread toward the corners so they overlap in the middle, where the blur
 * pass blends them.
 */
export const BLOOM_PRESETS: BloomPreset[] = [
	{
		id: 'ember',
		label: 'Ember',
		background: '#241008',
		stops: [
			{ x: 20, y: 24, size: 62, color: '#ff8a4c' },
			{ x: 80, y: 30, size: 58, color: '#df4a20' },
			{ x: 50, y: 84, size: 66, color: '#7a1d0f' }
		]
	},
	{
		id: 'dusk',
		label: 'Dusk',
		background: '#190f2e',
		stops: [
			{ x: 18, y: 22, size: 60, color: '#8f6bd9' },
			{ x: 82, y: 28, size: 58, color: '#c2506a' },
			{ x: 50, y: 85, size: 64, color: '#4a2f6e' }
		]
	},
	{
		id: 'tide',
		label: 'Tide',
		background: '#07242d',
		stops: [
			{ x: 20, y: 20, size: 60, color: '#5fb8c9' },
			{ x: 80, y: 30, size: 58, color: '#2f6f8e' },
			{ x: 50, y: 85, size: 66, color: '#0e4a5c' }
		]
	},
	{
		id: 'moss',
		label: 'Moss',
		background: '#141f15',
		stops: [
			{ x: 22, y: 22, size: 58, color: '#adc88d' },
			{ x: 80, y: 26, size: 60, color: '#5f8f52' },
			{ x: 48, y: 86, size: 66, color: '#2c4a2a' }
		]
	},
	{
		id: 'blush',
		label: 'Blush',
		background: '#291a1c',
		stops: [
			{ x: 20, y: 24, size: 62, color: '#ffdcca' },
			{ x: 80, y: 28, size: 58, color: '#f0a0a6' },
			{ x: 50, y: 86, size: 64, color: '#c46a72' }
		]
	},
	{
		id: 'citrus',
		label: 'Citrus',
		background: '#1b1604',
		stops: [
			{ x: 18, y: 22, size: 58, color: '#ffe066' },
			{ x: 82, y: 30, size: 60, color: '#ff9f1c' },
			{ x: 48, y: 86, size: 64, color: '#c76b0a' }
		]
	},
	{
		id: 'ink',
		label: 'Ink',
		background: '#0b0b0f',
		stops: [
			{ x: 20, y: 22, size: 60, color: '#53536e' },
			{ x: 80, y: 28, size: 58, color: '#26263a' },
			{ x: 50, y: 86, size: 64, color: '#7d7d9c' }
		]
	}
];

export type SizePreset = { id: string; label: string; width: number; height: number };

/** Widths/heights are the actual full-quality output size, same as a real
 * wallpaper or social-image target — the 1×/2× export control multiplies on
 * top of these for a retina-density version, it doesn't replace them. */
export const BLOOM_SIZES: SizePreset[] = [
	{ id: 'wallpaper', label: 'Wallpaper', width: 2560, height: 1440 },
	{ id: 'square', label: 'Square', width: 1600, height: 1600 },
	{ id: 'story', label: 'Story', width: 1080, height: 1920 },
	{ id: 'banner', label: 'Banner', width: 1500, height: 500 }
];

export const MIN_STOPS = 2;
export const MAX_STOPS = 6;

export const DEFAULT_PRESET_ID = 'dusk';
export const DEFAULT_OPTIONS: BloomOptions = { background: '#190f2e', blur: 55, grain: 22 };

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

let idCounter = 0;
export function makeStopId(): string {
	idCounter += 1;
	return `stop-${idCounter}`;
}

export function stopsFromPreset(preset: BloomPreset): Stop[] {
	return preset.stops.map((stop) => ({ ...stop, id: makeStopId() }));
}

/**
 * Reshuffles positions (never colors, so the result always stays within the
 * curated palette the user picked) into a loose ring with per-stop jitter —
 * plain even spacing around a circle looks mechanical, so each slot's angle
 * and radius get a small random offset instead.
 */
export function jitterPositions(stops: Stop[]): Stop[] {
	const n = stops.length;
	return stops.map((stop, i) => {
		const baseAngle = (i / n) * Math.PI * 2;
		const angle = baseAngle + (Math.random() - 0.5) * ((Math.PI * 2) / n) * 0.7;
		const radius = 28 + Math.random() * 16;
		const x = clamp(50 + Math.cos(angle) * radius, 10, 90);
		const y = clamp(50 + Math.sin(angle) * radius * 0.85, 10, 90);
		return { ...stop, x: Math.round(x), y: Math.round(y) };
	});
}

let noiseTile: HTMLCanvasElement | null = null;

function getNoiseTile(): HTMLCanvasElement {
	if (noiseTile) return noiseTile;
	const size = 128;
	const tile = document.createElement('canvas');
	tile.width = size;
	tile.height = size;
	const ctx = tile.getContext('2d');
	if (!ctx) throw new Error('Canvas is not supported in this browser.');
	const image = ctx.createImageData(size, size);
	for (let i = 0; i < image.data.length; i += 4) {
		const value = 128 + (Math.random() * 2 - 1) * 70;
		image.data[i] = value;
		image.data[i + 1] = value;
		image.data[i + 2] = value;
		image.data[i + 3] = 255;
	}
	ctx.putImageData(image, 0, 0);
	noiseTile = tile;
	return tile;
}

function paintGrain(
	ctx: CanvasRenderingContext2D,
	deviceWidth: number,
	deviceHeight: number,
	amount: number
) {
	if (amount <= 0) return;
	const pattern = ctx.createPattern(getNoiseTile(), 'repeat');
	if (!pattern) return;
	ctx.save();
	// Raw device pixels, ignoring the export scale, so grain stays a fine
	// texture at 2x rather than turning into visible blocks.
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalCompositeOperation = 'overlay';
	ctx.globalAlpha = amount * 0.09;
	ctx.fillStyle = pattern;
	ctx.fillRect(0, 0, deviceWidth, deviceHeight);
	ctx.restore();
}

/**
 * Sizes and paints `canvas`, used for both the live preview and the export —
 * only `scale` differs, so what you download is exactly what you were
 * looking at. Orbs are plain solid-filled circles; the softness comes from
 * `ctx.filter`'s blur applied per-shape, not from a gradient fill — overlaps
 * naturally blend where one blurred edge fades over another, which is what a
 * hand-authored mesh gradient actually looks like without hand-rolling a
 * bilinear color-grid interpolation.
 */
export function renderBloom(
	canvas: HTMLCanvasElement,
	width: number,
	height: number,
	stops: Stop[],
	opts: BloomOptions,
	scale: number
): void {
	const deviceWidth = Math.max(1, Math.round(width * scale));
	const deviceHeight = Math.max(1, Math.round(height * scale));
	canvas.width = deviceWidth;
	canvas.height = deviceHeight;

	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas is not supported in this browser.');

	ctx.setTransform(scale, 0, 0, scale, 0, 0);
	ctx.fillStyle = opts.background;
	ctx.fillRect(0, 0, width, height);

	const longSide = Math.max(width, height);
	const blurPx = (opts.blur / 100) * longSide * 0.22;

	ctx.save();
	ctx.filter = blurPx > 0.5 ? `blur(${blurPx}px)` : 'none';
	for (const stop of stops) {
		const cx = (stop.x / 100) * width;
		const cy = (stop.y / 100) * height;
		const r = (stop.size / 100) * longSide * 0.5;
		ctx.fillStyle = stop.color;
		ctx.beginPath();
		ctx.arc(cx, cy, r, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();

	paintGrain(ctx, deviceWidth, deviceHeight, opts.grain / 100);
}
