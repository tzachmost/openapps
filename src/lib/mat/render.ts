import { buildPalette, type RGB } from '$lib/swatch/palette';

export type Background = {
	kind: 'none' | 'solid' | 'linear';
	/** One color for `solid`, two or more stops for `linear`, ignored for `none`. */
	colors: string[];
	/** CSS `linear-gradient` convention: 0deg points up, 90deg points right. */
	angle: number;
};

export type BackgroundPreset = {
	id: string;
	label: string;
	background: Background;
};

/**
 * Deliberately small and curated rather than a full color picker — the point of
 * the tool is to make a screenshot look considered in three clicks, and an open
 * palette mostly produces gradients nobody would have chosen on purpose.
 */
export const BACKGROUND_PRESETS: BackgroundPreset[] = [
	{ id: 'paper', label: 'Paper', background: { kind: 'solid', colors: ['#efe9df'], angle: 0 } },
	{ id: 'slate', label: 'Slate', background: { kind: 'solid', colors: ['#22201c'], angle: 0 } },
	{
		id: 'ember',
		label: 'Ember',
		background: { kind: 'linear', colors: ['#ffa269', '#df4a20'], angle: 155 }
	},
	{
		id: 'dusk',
		label: 'Dusk',
		background: { kind: 'linear', colors: ['#5f4d8f', '#c2506a'], angle: 155 }
	},
	{
		id: 'tide',
		label: 'Tide',
		background: { kind: 'linear', colors: ['#2f6f8e', '#82ccc3'], angle: 155 }
	},
	{
		id: 'moss',
		label: 'Moss',
		background: { kind: 'linear', colors: ['#3f6b4a', '#adc88d'], angle: 155 }
	},
	{
		id: 'blush',
		label: 'Blush',
		background: { kind: 'linear', colors: ['#ffdcca', '#f0a0a6'], angle: 155 }
	},
	{
		id: 'mist',
		label: 'Mist',
		background: { kind: 'linear', colors: ['#e2e6ed', '#b6bfce'], angle: 155 }
	}
];

export const AUTO_PRESET_ID = 'auto';
export const NONE_PRESET_ID = 'none';

export const TRANSPARENT_BACKGROUND: Background = { kind: 'none', colors: [], angle: 0 };

export type RatioOption = { id: string; label: string; value: number | null };

export const RATIOS: RatioOption[] = [
	{ id: 'auto', label: 'Auto', value: null },
	{ id: 'square', label: '1:1', value: 1 },
	{ id: 'portrait', label: '4:5', value: 4 / 5 },
	{ id: 'photo', label: '3:2', value: 3 / 2 },
	{ id: 'wide', label: '16:9', value: 16 / 9 }
];

export type MatOptions = {
	/** Percent of the image's longer side. */
	padding: number;
	/** Percent of the maximum sensible corner radius. */
	radius: number;
	/** 0 = no shadow at all. */
	shadow: number;
	ratio: string;
	background: Background;
	grain: boolean;
	frame: boolean;
	frameTheme: 'light' | 'dark';
	title: string;
};

export type Layout = {
	/** Canvas size in natural (unscaled) units. */
	width: number;
	height: number;
	card: { x: number; y: number; width: number; height: number };
	barHeight: number;
	radius: number;
};

export const DEFAULT_OPTIONS: MatOptions = {
	padding: 9,
	radius: 34,
	shadow: 46,
	ratio: 'auto',
	background: BACKGROUND_PRESETS[2].background,
	grain: true,
	frame: false,
	frameTheme: 'light',
	title: ''
};

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function ratioValue(id: string): number | null {
	return RATIOS.find((option) => option.id === id)?.value ?? null;
}

export function computeLayout(imageWidth: number, imageHeight: number, opts: MatOptions): Layout {
	const longSide = Math.max(imageWidth, imageHeight);
	const pad = (opts.padding / 100) * longSide;
	const barHeight = opts.frame ? Math.round(clamp(imageWidth * 0.045, 24, 56)) : 0;

	const cardWidth = imageWidth;
	const cardHeight = imageHeight + barHeight;

	let width = cardWidth + pad * 2;
	let height = cardHeight + pad * 2;

	const ratio = ratioValue(opts.ratio);
	if (ratio) {
		// Only ever grow the canvas to reach the target ratio, so the image itself is
		// never cropped to fit a frame the user picked for the *background*.
		if (width / height < ratio) width = height * ratio;
		else height = width / ratio;
	}

	const maxRadius = Math.min(cardWidth, cardHeight) * 0.08;
	return {
		width: Math.round(width),
		height: Math.round(height),
		card: {
			x: (width - cardWidth) / 2,
			y: (height - cardHeight) / 2,
			width: cardWidth,
			height: cardHeight
		},
		barHeight,
		radius: (opts.radius / 100) * maxRadius
	};
}

function roundedRectPath(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number
) {
	// Hand-rolled rather than `ctx.roundRect` so this works the same everywhere,
	// including in older WebViews where roundRect is missing.
	const r = clamp(radius, 0, Math.min(width, height) / 2);
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + width - r, y);
	ctx.arcTo(x + width, y, x + width, y + r, r);
	ctx.lineTo(x + width, y + height - r);
	ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
	ctx.lineTo(x + r, y + height);
	ctx.arcTo(x, y + height, x, y + height - r, r);
	ctx.lineTo(x, y + r);
	ctx.arcTo(x, y, x + r, y, r);
	ctx.closePath();
}

function paintBackground(
	ctx: CanvasRenderingContext2D,
	background: Background,
	width: number,
	height: number
) {
	if (background.kind === 'none' || background.colors.length === 0) return;

	if (background.kind === 'solid') {
		ctx.fillStyle = background.colors[0];
	} else {
		// CSS gradient-line geometry: the line runs through the center along the
		// angle, and is long enough that both corners it points at are covered.
		const radians = (background.angle * Math.PI) / 180;
		const dx = Math.sin(radians);
		const dy = -Math.cos(radians);
		const length = Math.abs(width * dx) + Math.abs(height * dy);
		const cx = width / 2;
		const cy = height / 2;
		const gradient = ctx.createLinearGradient(
			cx - (dx * length) / 2,
			cy - (dy * length) / 2,
			cx + (dx * length) / 2,
			cy + (dy * length) / 2
		);
		background.colors.forEach((color, i) => {
			gradient.addColorStop(i / (background.colors.length - 1), color);
		});
		ctx.fillStyle = gradient;
	}
	ctx.fillRect(0, 0, width, height);
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
		// Monochrome noise centered on mid-grey: composited with `overlay`, 128 is a
		// no-op and the deviations lighten or darken, which is what grain actually is.
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

function paintGrain(ctx: CanvasRenderingContext2D, deviceWidth: number, deviceHeight: number) {
	const pattern = ctx.createPattern(getNoiseTile(), 'repeat');
	if (!pattern) return;
	ctx.save();
	// Painted in raw device pixels, ignoring the export scale, so grain stays a
	// fine texture at 3x instead of turning into visible blocks.
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalCompositeOperation = 'overlay';
	ctx.globalAlpha = 0.055;
	ctx.fillStyle = pattern;
	ctx.fillRect(0, 0, deviceWidth, deviceHeight);
	ctx.restore();
}

function paintWindowBar(ctx: CanvasRenderingContext2D, layout: Layout, opts: MatOptions) {
	const { card, barHeight } = layout;
	const dark = opts.frameTheme === 'dark';

	ctx.fillStyle = dark ? '#2a2724' : '#f3f1ed';
	ctx.fillRect(card.x, card.y, card.width, barHeight);

	ctx.fillStyle = dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)';
	ctx.fillRect(card.x, card.y + barHeight - Math.max(1, barHeight * 0.02), card.width, 1);

	const dotRadius = barHeight * 0.12;
	const gap = barHeight * 0.42;
	ctx.fillStyle = dark ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.18)';
	for (let i = 0; i < 3; i++) {
		ctx.beginPath();
		ctx.arc(card.x + barHeight * 0.6 + i * gap, card.y + barHeight / 2, dotRadius, 0, Math.PI * 2);
		ctx.fill();
	}

	const title = opts.title.trim();
	if (!title) return;

	ctx.save();
	ctx.font = `${Math.round(barHeight * 0.34)}px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)';
	// Keep the title clear of the dots on narrow cards rather than letting it overlap.
	const available = card.width - barHeight * 2.6;
	let text = title;
	while (text.length > 1 && ctx.measureText(text).width > available) {
		text = text.slice(0, -1);
	}
	if (text !== title) text = `${text.slice(0, -1)}…`;
	ctx.fillText(text, card.x + card.width / 2, card.y + barHeight / 2);
	ctx.restore();
}

/**
 * Sizes and paints `canvas`, returning the layout it used. The same function
 * drives the on-screen preview and the exported file — only `scale` differs, so
 * what you download is exactly what you were looking at.
 */
export function renderMat(
	canvas: HTMLCanvasElement,
	image: ImageBitmap,
	opts: MatOptions,
	scale: number
): Layout {
	const layout = computeLayout(image.width, image.height, opts);
	const deviceWidth = Math.max(1, Math.round(layout.width * scale));
	const deviceHeight = Math.max(1, Math.round(layout.height * scale));

	canvas.width = deviceWidth;
	canvas.height = deviceHeight;

	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas is not supported in this browser.');

	ctx.setTransform(scale, 0, 0, scale, 0, 0);
	ctx.clearRect(0, 0, layout.width, layout.height);
	paintBackground(ctx, opts.background, layout.width, layout.height);

	if (opts.grain && opts.background.kind !== 'none') paintGrain(ctx, deviceWidth, deviceHeight);

	ctx.setTransform(scale, 0, 0, scale, 0, 0);

	const { card, radius, barHeight } = layout;
	const longSide = Math.max(image.width, image.height);

	if (opts.shadow > 0) {
		const strength = opts.shadow / 100;
		ctx.save();
		ctx.shadowColor = `rgba(15, 12, 8, ${0.4 * strength})`;
		ctx.shadowBlur = longSide * 0.09 * strength;
		ctx.shadowOffsetY = longSide * 0.032 * strength;
		// Filled once purely to cast the shadow; the image covers it immediately after.
		ctx.fillStyle = opts.frame && opts.frameTheme === 'dark' ? '#2a2724' : '#ffffff';
		roundedRectPath(ctx, card.x, card.y, card.width, card.height, radius);
		ctx.fill();
		ctx.restore();
	}

	ctx.save();
	roundedRectPath(ctx, card.x, card.y, card.width, card.height, radius);
	ctx.clip();
	if (opts.frame) paintWindowBar(ctx, layout, opts);
	ctx.drawImage(image, card.x, card.y + barHeight, card.width, image.height);
	ctx.restore();

	// A hairline inside the clip edge keeps light screenshots from dissolving into
	// light backgrounds — the same trick as a 1px border on a white card.
	ctx.save();
	ctx.strokeStyle = 'rgba(15, 12, 8, 0.10)';
	ctx.lineWidth = Math.max(1, longSide * 0.0008);
	roundedRectPath(ctx, card.x, card.y, card.width, card.height, radius);
	ctx.stroke();
	ctx.restore();

	return layout;
}

/**
 * Builds a background in the image's own hue family. Uses Swatch's median-cut
 * palette, then favours the most *saturated* prominent color rather than the
 * literal most common one — screenshots are mostly white or grey by area, and a
 * white-to-off-white gradient is not a background anybody wants.
 */
export function backgroundFromPixels(pixels: RGB[]): Background {
	const palette = buildPalette(pixels, 6);
	const neutral: Background = {
		kind: 'linear',
		colors: ['hsl(36 14% 84%)', 'hsl(30 12% 58%)'],
		angle: 155
	};
	if (palette.length === 0) return neutral;

	let best = palette[0];
	let bestScore = -1;
	for (const color of palette) {
		const score = color.population * (0.12 + color.hsl.s / 100);
		if (score > bestScore) {
			bestScore = score;
			best = color;
		}
	}

	// A near-greyscale image has no hue worth amplifying; inventing one would just
	// be a random tint, so fall back to the warm neutral instead.
	if (best.hsl.s < 6) return neutral;

	const saturation = clamp(best.hsl.s, 24, 62);
	return {
		kind: 'linear',
		colors: [
			`hsl(${best.hsl.h} ${saturation}% 68%)`,
			`hsl(${(best.hsl.h + 24) % 360} ${Math.min(saturation + 8, 70)}% 42%)`
		],
		angle: 155
	};
}

/** A CSS gradient string for the preset chips, so the chip shows the real background. */
export function backgroundToCss(background: Background): string {
	if (background.kind === 'none') return 'transparent';
	if (background.kind === 'solid') return background.colors[0];
	return `linear-gradient(${background.angle}deg, ${background.colors.join(', ')})`;
}
