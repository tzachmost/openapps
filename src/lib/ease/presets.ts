import type { BezierPoints } from './bezier';

export type Preset = {
	label: string;
	points: BezierPoints;
};

export type PresetGroup = {
	label: string;
	presets: Preset[];
};

function pt(x1: number, y1: number, x2: number, y2: number): BezierPoints {
	return { x1, y1, x2, y2 };
}

export const DEFAULT_PRESET: Preset = { label: 'Ease', points: pt(0.25, 0.1, 0.25, 1) };

/**
 * Standard groups come straight from the CSS spec keywords and Material Design's
 * published curves. The per-family in/out/in-out groups are the cubic-bezier
 * approximations published by easings.net — the de facto reference table most
 * animation libraries (Tailwind, animate.css, etc.) draw the same values from.
 * Elastic and bounce are deliberately excluded: they have no cubic-bezier
 * equivalent, since a single bezier segment can't produce multiple oscillations.
 */
export const PRESET_GROUPS: PresetGroup[] = [
	{
		label: 'Standard',
		presets: [
			{ label: 'Linear', points: pt(0, 0, 1, 1) },
			{ label: 'Ease', points: pt(0.25, 0.1, 0.25, 1) },
			{ label: 'Ease in', points: pt(0.42, 0, 1, 1) },
			{ label: 'Ease out', points: pt(0, 0, 0.58, 1) },
			{ label: 'Ease in out', points: pt(0.42, 0, 0.58, 1) }
		]
	},
	{
		label: 'Material Design',
		presets: [
			{ label: 'Standard', points: pt(0.4, 0, 0.2, 1) },
			{ label: 'Decelerate', points: pt(0, 0, 0.2, 1) },
			{ label: 'Accelerate', points: pt(0.4, 0, 1, 1) }
		]
	},
	{
		label: 'Sine',
		presets: [
			{ label: 'In', points: pt(0.12, 0, 0.39, 0) },
			{ label: 'Out', points: pt(0.61, 1, 0.88, 1) },
			{ label: 'In out', points: pt(0.37, 0, 0.63, 1) }
		]
	},
	{
		label: 'Quad',
		presets: [
			{ label: 'In', points: pt(0.11, 0, 0.5, 0) },
			{ label: 'Out', points: pt(0.5, 1, 0.89, 1) },
			{ label: 'In out', points: pt(0.45, 0, 0.55, 1) }
		]
	},
	{
		label: 'Cubic',
		presets: [
			{ label: 'In', points: pt(0.32, 0, 0.67, 0) },
			{ label: 'Out', points: pt(0.33, 1, 0.68, 1) },
			{ label: 'In out', points: pt(0.65, 0, 0.35, 1) }
		]
	},
	{
		label: 'Quart',
		presets: [
			{ label: 'In', points: pt(0.5, 0, 0.75, 0) },
			{ label: 'Out', points: pt(0.25, 1, 0.5, 1) },
			{ label: 'In out', points: pt(0.76, 0, 0.24, 1) }
		]
	},
	{
		label: 'Quint',
		presets: [
			{ label: 'In', points: pt(0.64, 0, 0.78, 0) },
			{ label: 'Out', points: pt(0.22, 1, 0.36, 1) },
			{ label: 'In out', points: pt(0.83, 0, 0.17, 1) }
		]
	},
	{
		label: 'Expo',
		presets: [
			{ label: 'In', points: pt(0.7, 0, 0.84, 0) },
			{ label: 'Out', points: pt(0.16, 1, 0.3, 1) },
			{ label: 'In out', points: pt(0.87, 0, 0.13, 1) }
		]
	},
	{
		label: 'Circ',
		presets: [
			{ label: 'In', points: pt(0.55, 0, 1, 0.45) },
			{ label: 'Out', points: pt(0, 0.55, 0.45, 1) },
			{ label: 'In out', points: pt(0.85, 0, 0.15, 1) }
		]
	},
	{
		label: 'Back',
		presets: [
			{ label: 'In', points: pt(0.36, 0, 0.66, -0.56) },
			{ label: 'Out', points: pt(0.34, 1.56, 0.64, 1) },
			{ label: 'In out', points: pt(0.68, -0.6, 0.32, 1.6) }
		]
	}
];
