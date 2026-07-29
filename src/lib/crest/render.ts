/** Rendering primitives shared between the live preview and every exported size. */

export type Background = { kind: 'transparent' } | { kind: 'solid'; color: string };

export type IconOptions = {
	background: Background;
	/** Margin on each edge, as a fraction of the canvas (0–0.3). */
	padding: number;
};

/** The centered square crop of an image — Crest always crops to the shorter
 * side rather than stretching, same "never distort, be honest about it"
 * instinct as the rest of the site. */
export function centerSquareCrop(width: number, height: number) {
	const size = Math.min(width, height);
	return { sx: (width - size) / 2, sy: (height - size) / 2, size };
}

/**
 * Draws `bitmap` into `canvas` at exactly `size × size`: centered square crop,
 * optional background fill, optional padding. Used for both the live preview
 * and every exported PNG/ICO frame, so what's on screen is provably what gets
 * downloaded — the only thing that ever changes between calls is `size`.
 */
export function renderIcon(
	canvas: HTMLCanvasElement | OffscreenCanvas,
	bitmap: ImageBitmap,
	size: number,
	opts: IconOptions
) {
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
	if (!ctx) throw new Error('Canvas 2D context unavailable.');
	ctx.clearRect(0, 0, size, size);

	if (opts.background.kind === 'solid') {
		ctx.fillStyle = opts.background.color;
		ctx.fillRect(0, 0, size, size);
	}

	const crop = centerSquareCrop(bitmap.width, bitmap.height);
	const margin = size * Math.min(Math.max(opts.padding, 0), 0.3);
	const drawn = size - margin * 2;
	ctx.drawImage(bitmap, crop.sx, crop.sy, crop.size, crop.size, margin, margin, drawn, drawn);
}

/** iOS renders any transparent pixel in a home-screen icon as solid black — unlike a
 * browser tab, there's no checkerboard fallback there, so a genuinely transparent icon
 * reads as broken rather than "no background chosen". Used to force an opaque render
 * for outputs that need one, without silently changing what the user asked for. */
export function opaqueFallback(opts: IconOptions, fallback = '#ffffff'): IconOptions {
	return opts.background.kind === 'transparent'
		? { ...opts, background: { kind: 'solid', color: fallback } }
		: opts;
}

export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array<ArrayBuffer>> {
	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
	if (!blob) throw new Error('Could not encode PNG.');
	return new Uint8Array(await blob.arrayBuffer());
}

/** Renders `bitmap` at `size` with the given options and returns PNG bytes,
 * without touching the visible preview canvas. */
export async function renderIconPng(
	bitmap: ImageBitmap,
	size: number,
	opts: IconOptions
): Promise<Uint8Array<ArrayBuffer>> {
	const canvas = document.createElement('canvas');
	renderIcon(canvas, bitmap, size, opts);
	return canvasToPng(canvas);
}
