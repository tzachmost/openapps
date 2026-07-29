import type { BloomOptions, Stop } from './render';

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * Approximates the canvas render as layered CSS radial-gradients — flat
 * color-to-transparent circles, in the same stacking order as the canvas
 * paints them (last stop on top). There is no CSS equivalent of per-shape
 * blur-then-composite, so this can only ever be a close approximation, not a
 * pixel match — stated in the UI rather than implied by the "Copy CSS"
 * button, the same honesty pattern as everywhere else on the site.
 */
export function bloomToCss(stops: Stop[], opts: BloomOptions): string {
	const layers = [...stops]
		.reverse()
		.map((stop) => {
			// The canvas radius is measured against the longer side; a CSS
			// `circle` gradient's percentage is measured against the corner
			// distance, so this is a tuned approximation, not a unit conversion.
			const spread = clamp(stop.size * 1.7, 45, 100);
			return `radial-gradient(circle at ${stop.x}% ${stop.y}%, ${stop.color} 0%, transparent ${spread}%)`;
		})
		.join(',\n    ');

	return `background:\n    ${layers},\n    ${opts.background};`;
}
