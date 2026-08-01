import { hexToRgb, type Rgb } from './convert';

/** WCAG relative luminance — same formula as Swatch's textColor pick and Beacon's contrastRatio. */
function relativeLuminance({ r, g, b }: Rgb): number {
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

/** Legible black/white label color for a swatch, same threshold Swatch uses. */
export function pickTextColor(hex: string): 'light' | 'dark' {
	return relativeLuminance(hexToRgb(hex)) > 0.42 ? 'dark' : 'light';
}

export type ContrastCheck = { label: string; threshold: number; passes: boolean };

export function wcagChecks(ratio: number): ContrastCheck[] {
	return [
		{ label: 'Normal text · AA', threshold: 4.5, passes: ratio >= 4.5 },
		{ label: 'Normal text · AAA', threshold: 7, passes: ratio >= 7 },
		{ label: 'Large text · AA', threshold: 3, passes: ratio >= 3 },
		{ label: 'Large text · AAA', threshold: 4.5, passes: ratio >= 4.5 }
	];
}
