import { hexToRgb, hslToRgb, rgbToHex, rgbToHsl } from './convert';

export type HarmonySwatch = { hex: string; label: string };

export const HARMONY_TYPES = [
	'complementary',
	'analogous',
	'triadic',
	'split',
	'tetradic',
	'shades'
] as const;

export type HarmonyType = (typeof HARMONY_TYPES)[number];

export const HARMONY_LABELS: Record<HarmonyType, string> = {
	complementary: 'Complementary',
	analogous: 'Analogous',
	triadic: 'Triadic',
	split: 'Split-complementary',
	tetradic: 'Tetradic',
	shades: 'Tints & shades'
};

const norm360 = (h: number) => ((h % 360) + 360) % 360;

/** Lightness stops for the tint/shade ramp — fixed, not derived from the base's own lightness. */
const SHADE_STOPS = [95, 85, 75, 65, 55, 45, 35, 25, 15];

export function harmonyPalette(baseHex: string, type: HarmonyType): HarmonySwatch[] {
	const hsl = rgbToHsl(hexToRgb(baseHex));
	const at = (h: number, s: number, l: number, label: string): HarmonySwatch => ({
		hex: rgbToHex(hslToRgb({ h: norm360(h), s, l })),
		label
	});

	switch (type) {
		case 'complementary':
			return [at(hsl.h, hsl.s, hsl.l, 'Base'), at(hsl.h + 180, hsl.s, hsl.l, 'Complement')];
		case 'analogous':
			return [
				at(hsl.h - 30, hsl.s, hsl.l, '-30°'),
				at(hsl.h, hsl.s, hsl.l, 'Base'),
				at(hsl.h + 30, hsl.s, hsl.l, '+30°')
			];
		case 'triadic':
			return [
				at(hsl.h, hsl.s, hsl.l, 'Base'),
				at(hsl.h + 120, hsl.s, hsl.l, '+120°'),
				at(hsl.h + 240, hsl.s, hsl.l, '+240°')
			];
		case 'split':
			return [
				at(hsl.h, hsl.s, hsl.l, 'Base'),
				at(hsl.h + 150, hsl.s, hsl.l, '+150°'),
				at(hsl.h + 210, hsl.s, hsl.l, '+210°')
			];
		case 'tetradic':
			return [
				at(hsl.h, hsl.s, hsl.l, 'Base'),
				at(hsl.h + 90, hsl.s, hsl.l, '+90°'),
				at(hsl.h + 180, hsl.s, hsl.l, '+180°'),
				at(hsl.h + 270, hsl.s, hsl.l, '+270°')
			];
		case 'shades':
			return SHADE_STOPS.map((l) => at(hsl.h, hsl.s, l, `${l}%`));
	}
}
