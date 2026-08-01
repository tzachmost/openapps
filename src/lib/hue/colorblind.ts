import { hexToRgb, rgbToHex } from './convert';

export const CVD_TYPES = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'] as const;
export type CvdType = (typeof CVD_TYPES)[number];

export const CVD_INFO: Record<CvdType, { label: string; prevalence: string }> = {
	protanopia: { label: 'Protanopia', prevalence: 'red-blind, ~1% of men' },
	deuteranopia: { label: 'Deuteranopia', prevalence: 'green-blind, ~1% of men' },
	tritanopia: { label: 'Tritanopia', prevalence: 'blue-blind, rare, <0.1% of people' },
	achromatopsia: { label: 'Achromatopsia', prevalence: 'no color at all, very rare' }
};

/**
 * Machado, Oliveira & Fernandes (2009), "A Physiologically-based Model for Simulation of
 * Color Vision Deficiency" — the 100%-severity (full dichromacy) matrices, cross-checked
 * against an independent transcription of the paper's dataset before hardcoding. Applied in
 * linear RGB: decode sRGB gamma, multiply, re-encode gamma — these coefficients model cone
 * response, which is a linear-light quantity, not gamma-compressed pixel values.
 */
const CVD_MATRICES: Record<Exclude<CvdType, 'achromatopsia'>, readonly number[]> = {
	protanopia: [
		0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998
	],
	deuteranopia: [
		0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881
	],
	tritanopia: [
		1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039
	]
};

function srgbToLinear(c: number): number {
	const cn = c / 255;
	return cn <= 0.04045 ? cn / 12.92 : Math.pow((cn + 0.055) / 1.055, 2.4);
}

function linearToSrgb(linear: number): number {
	const c = Math.max(linear, 0);
	const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
	return Math.min(255, Math.max(0, Math.round(s * 255)));
}

/** Simulates how a color would appear under a given color vision deficiency. Approximate, not diagnostic. */
export function simulate(hex: string, type: CvdType): string {
	const { r, g, b } = hexToRgb(hex);
	const lr = srgbToLinear(r),
		lg = srgbToLinear(g),
		lb = srgbToLinear(b);

	if (type === 'achromatopsia') {
		// Rec. 709 luminance in linear light, then re-encoded — a true grayscale, not a gamma-space average.
		const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
		const v = linearToSrgb(y);
		return rgbToHex({ r: v, g: v, b: v });
	}

	const m = CVD_MATRICES[type];
	const outR = m[0] * lr + m[1] * lg + m[2] * lb;
	const outG = m[3] * lr + m[4] * lg + m[5] * lb;
	const outB = m[6] * lr + m[7] * lg + m[8] * lb;
	return rgbToHex({ r: linearToSrgb(outR), g: linearToSrgb(outG), b: linearToSrgb(outB) });
}
