/**
 * Color model conversions: hex/RGB/HSL/HSV/OKLCH. No dependency — every formula here is the
 * standard textbook one (HSL/HSV round-trip through RGB; OKLCH is Björn Ottosson's OKLab
 * spec, sRGB -> linear -> LMS -> OKLab -> cylindrical). OKLCH is read-only (RGB -> OKLCH only):
 * the reverse needs gamut mapping for out-of-range OKLCH input, which this tool never produces
 * since every color originates from an in-gamut sRGB pick.
 */

export type Rgb = { r: number; g: number; b: number };
export type Hsl = { h: number; s: number; l: number };
export type Hsv = { h: number; s: number; v: number };
export type Oklch = { l: number; c: number; h: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const norm360 = (h: number) => ((h % 360) + 360) % 360;

/** Accepts "#abc", "abc", "#aabbcc", "aabbcc" (case-insensitive); returns a lowercase 6-digit "#rrggbb" or null. */
export function normalizeHex(input: string): string | null {
	const clean = input.trim().replace(/^#/, '');
	if (/^[0-9a-f]{3}$/i.test(clean)) {
		return (
			'#' +
			clean
				.split('')
				.map((c) => c + c)
				.join('')
				.toLowerCase()
		);
	}
	if (/^[0-9a-f]{6}$/i.test(clean)) return '#' + clean.toLowerCase();
	return null;
}

export function hexToRgb(hex: string): Rgb {
	const clean = normalizeHex(hex) ?? '#000000';
	const value = parseInt(clean.slice(1), 16);
	return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
	const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
	const rn = r / 255,
		gn = g / 255,
		bn = b / 255;
	const max = Math.max(rn, gn, bn),
		min = Math.min(rn, gn, bn);
	const l = (max + min) / 2;
	if (max === min) return { h: 0, s: 0, l: l * 100 };
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h: number;
	if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
	else if (max === gn) h = (bn - rn) / d + 2;
	else h = (rn - gn) / d + 4;
	return { h: h * 60, s: s * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
	const sn = s / 100,
		ln = l / 100;
	if (sn === 0) {
		const v = Math.round(ln * 255);
		return { r: v, g: v, b: v };
	}
	const hue2rgb = (p: number, q: number, t: number) => {
		let tt = t;
		if (tt < 0) tt += 1;
		if (tt > 1) tt -= 1;
		if (tt < 1 / 6) return p + (q - p) * 6 * tt;
		if (tt < 1 / 2) return q;
		if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
		return p;
	};
	const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
	const p = 2 * ln - q;
	const hn = norm360(h) / 360;
	return {
		r: Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
		g: Math.round(hue2rgb(p, q, hn) * 255),
		b: Math.round(hue2rgb(p, q, hn - 1 / 3) * 255)
	};
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
	const rn = r / 255,
		gn = g / 255,
		bn = b / 255;
	const max = Math.max(rn, gn, bn),
		min = Math.min(rn, gn, bn);
	const d = max - min;
	const v = max;
	const s = max === 0 ? 0 : d / max;
	let h = 0;
	if (d !== 0) {
		if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
		else if (max === gn) h = (bn - rn) / d + 2;
		else h = (rn - gn) / d + 4;
		h *= 60;
	}
	return { h, s: s * 100, v: v * 100 };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
	const sn = s / 100,
		vn = v / 100;
	const c = vn * sn;
	const hh = norm360(h) / 60;
	const x = c * (1 - Math.abs((hh % 2) - 1));
	let rp = 0,
		gp = 0,
		bp = 0;
	if (hh < 1) [rp, gp, bp] = [c, x, 0];
	else if (hh < 2) [rp, gp, bp] = [x, c, 0];
	else if (hh < 3) [rp, gp, bp] = [0, c, x];
	else if (hh < 4) [rp, gp, bp] = [0, x, c];
	else if (hh < 5) [rp, gp, bp] = [x, 0, c];
	else [rp, gp, bp] = [c, 0, x];
	const m = vn - c;
	return {
		r: Math.round((rp + m) * 255),
		g: Math.round((gp + m) * 255),
		b: Math.round((bp + m) * 255)
	};
}

function srgbToLinear(c: number): number {
	const cn = c / 255;
	return cn <= 0.04045 ? cn / 12.92 : Math.pow((cn + 0.055) / 1.055, 2.4);
}

/** sRGB -> OKLCH via OKLab (bottosson.github.io/posts/oklab). L in [0,1], C roughly [0,0.4], H in degrees. */
export function rgbToOklch({ r, g, b }: Rgb): Oklch {
	const lr = srgbToLinear(r),
		lg = srgbToLinear(g),
		lb = srgbToLinear(b);

	const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
	const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
	const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

	const l_ = Math.cbrt(l),
		m_ = Math.cbrt(m),
		s_ = Math.cbrt(s);

	const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
	const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
	const bLab = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

	const c = Math.sqrt(a * a + bLab * bLab);
	const h = norm360((Math.atan2(bLab, a) * 180) / Math.PI);
	return { l: L, c, h };
}

export function formatRgb({ r, g, b }: Rgb): string {
	return `rgb(${r}, ${g}, ${b})`;
}

export function formatHsl({ h, s, l }: Hsl): string {
	return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

export function formatHsv({ h, s, v }: Hsv): string {
	return `hsv(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(v)}%)`;
}

export function formatOklch({ l, c, h }: Oklch): string {
	return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}
