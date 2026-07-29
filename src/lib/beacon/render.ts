import type { QrMatrix } from './qr';

export type RenderOptions = {
	/** Modules of light quiet zone around the code — 4 is the spec minimum for reliable scanning. */
	quietZone: number;
	foreground: string;
	background: string;
};

export const DEFAULT_QUIET_ZONE = 4;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
	const clean = hex.replace('#', '');
	const value = parseInt(
		clean.length === 3
			? clean
					.split('')
					.map((c) => c + c)
					.join('')
			: clean,
		16
	);
	return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

/** WCAG relative luminance — same formula used in Swatch to pick legible label colors. */
function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
	const channel = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio (1–21) between two hex colors. */
export function contrastRatio(hexA: string, hexB: string): number {
	const lumA = relativeLuminance(hexToRgb(hexA));
	const lumB = relativeLuminance(hexToRgb(hexB));
	const lighter = Math.max(lumA, lumB);
	const darker = Math.min(lumA, lumB);
	return (lighter + 0.05) / (darker + 0.05);
}

export function renderToCanvas(
	canvas: HTMLCanvasElement,
	matrix: QrMatrix,
	opts: RenderOptions,
	scale: number
) {
	const modules = matrix.size + opts.quietZone * 2;
	const px = modules * scale;
	canvas.width = px;
	canvas.height = px;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	ctx.fillStyle = opts.background;
	ctx.fillRect(0, 0, px, px);
	ctx.fillStyle = opts.foreground;
	for (let row = 0; row < matrix.size; row++) {
		for (let col = 0; col < matrix.size; col++) {
			if (!matrix.modules[row][col]) continue;
			const x = (col + opts.quietZone) * scale;
			const y = (row + opts.quietZone) * scale;
			ctx.fillRect(x, y, scale, scale);
		}
	}
}

export function toSvgString(matrix: QrMatrix, opts: RenderOptions): string {
	const modules = matrix.size + opts.quietZone * 2;
	const cells: string[] = [];
	for (let row = 0; row < matrix.size; row++) {
		let runStart = -1;
		for (let col = 0; col <= matrix.size; col++) {
			const dark = col < matrix.size && matrix.modules[row][col];
			if (dark && runStart === -1) runStart = col;
			if (!dark && runStart !== -1) {
				const x = runStart + opts.quietZone;
				const y = row + opts.quietZone;
				cells.push(`<rect x="${x}" y="${y}" width="${col - runStart}" height="1"/>`);
				runStart = -1;
			}
		}
	}
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${modules} ${modules}" shape-rendering="crispEdges">`,
		`<rect width="${modules}" height="${modules}" fill="${opts.background}"/>`,
		`<g fill="${opts.foreground}">${cells.join('')}</g>`,
		`</svg>`
	].join('');
}
