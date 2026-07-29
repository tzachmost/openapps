export type BezierPoints = {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
};

/** CSS requires x within [0, 1] so the curve is a well-defined function of time. */
export const X_MIN = 0;
export const X_MAX = 1;

/**
 * y is unbounded by the spec (overshoot enables back/anticipate curves) — clamped here to a
 * range that comfortably covers the most extreme published preset (easeInOutBack's -0.6/1.6)
 * with a little room to drag past it, without letting the editor run away to an impractical size.
 */
export const Y_MIN = -0.7;
export const Y_MAX = 1.7;

export function clampPoints(p: BezierPoints): BezierPoints {
	return {
		x1: Math.min(X_MAX, Math.max(X_MIN, p.x1)),
		y1: Math.min(Y_MAX, Math.max(Y_MIN, p.y1)),
		x2: Math.min(X_MAX, Math.max(X_MIN, p.x2)),
		y2: Math.min(Y_MAX, Math.max(Y_MIN, p.y2))
	};
}

function cubic(t: number, p1: number, p2: number): number {
	const u = 1 - t;
	return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
}

function cubicDerivative(t: number, p1: number, p2: number): number {
	const u = 1 - t;
	return 3 * u * u * p1 + 6 * u * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

/**
 * Given x in [0, 1], find the t that produces it (x1/x2 are clamped to [0, 1] so x(t)
 * is monotonic and this has exactly one solution), then return y(t). Same UnitBezier
 * approach browsers use internally: a few rounds of Newton-Raphson, falling back to
 * bisection if the derivative is near zero (a flat handle can make Newton overshoot).
 */
export function solveBezierY(x: number, points: BezierPoints): number {
	const { x1, y1, x2, y2 } = points;
	const targetX = Math.min(1, Math.max(0, x));

	let t = targetX;
	for (let i = 0; i < 8; i++) {
		const derivative = cubicDerivative(t, x1, x2);
		if (Math.abs(derivative) < 1e-6) break;
		t -= (cubic(t, x1, x2) - targetX) / derivative;
		t = Math.min(1, Math.max(0, t));
	}

	if (Math.abs(cubic(t, x1, x2) - targetX) > 1e-5) {
		let lower = 0;
		let upper = 1;
		t = targetX;
		for (let i = 0; i < 40; i++) {
			const current = cubic(t, x1, x2);
			if (Math.abs(current - targetX) < 1e-7) break;
			if (current < targetX) lower = t;
			else upper = t;
			t = (lower + upper) / 2;
		}
	}

	return cubic(t, y1, y2);
}

export function toCssValue(p: BezierPoints): string {
	return `cubic-bezier(${round(p.x1)}, ${round(p.y1)}, ${round(p.x2)}, ${round(p.y2)})`;
}

export function toArray(p: BezierPoints): [number, number, number, number] {
	return [round(p.x1), round(p.y1), round(p.x2), round(p.y2)];
}

function round(n: number): number {
	return Math.round(n * 1000) / 1000;
}

/** A standalone JS port of solveBezierY with the points baked in, for use outside CSS. */
export function toJsFunction(p: BezierPoints): string {
	const [x1, y1, x2, y2] = toArray(p);
	return `// cubic-bezier(${x1}, ${y1}, ${x2}, ${y2}) — Newton-Raphson solve, same algorithm browsers use internally
function ease(x) {
	const x1 = ${x1}, y1 = ${y1}, x2 = ${x2}, y2 = ${y2};
	const cubic = (t, p1, p2) => {
		const u = 1 - t;
		return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
	};
	const derivative = (t, p1, p2) => {
		const u = 1 - t;
		return 3 * u * u * p1 + 6 * u * t * (p2 - p1) + 3 * t * t * (1 - p2);
	};
	let t = Math.min(1, Math.max(0, x));
	for (let i = 0; i < 8; i++) {
		const d = derivative(t, x1, x2);
		if (Math.abs(d) < 1e-6) break;
		t -= (cubic(t, x1, x2) - x) / d;
		t = Math.min(1, Math.max(0, t));
	}
	return cubic(t, y1, y2);
}`;
}
