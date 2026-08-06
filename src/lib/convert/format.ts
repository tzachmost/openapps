/** Formats a converted number for display: enough precision that everyday magnitudes
 *  look exact, switches to exponential notation only when fixed-point would otherwise
 *  be misleadingly long (very large or very small values), and never shows raw
 *  floating-point noise (e.g. `3.9999999999999996` instead of `4`). */
export function smartFormat(n: number): string {
	if (!Number.isFinite(n)) return '—';
	if (n === 0) return '0';

	const abs = Math.abs(n);
	if (abs >= 1e15 || abs < 1e-9) {
		return n.toExponential(4).replace(/\.?0+e/, 'e');
	}

	// Target ~10 significant digits, fewer fraction digits for larger magnitudes so a
	// huge value doesn't render with an absurd number of trailing decimals, then trim
	// any trailing zeros so a whole number reads as "4", not "4.000000000".
	const magnitude = abs >= 1 ? Math.floor(Math.log10(abs)) + 1 : 0;
	const fractionDigits = Math.min(12, Math.max(0, 10 - magnitude));
	let s = n.toFixed(fractionDigits);
	if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
	return s;
}

/** Parses a row's raw typed input into a finite number, or `null` while it's mid-type
 *  (empty, a bare sign, a bare decimal point) or genuinely not a number at all — the
 *  caller keeps showing the last valid conversion rather than treating either case as
 *  a hard error. */
export function parseNumber(raw: string): number | null {
	const trimmed = raw.trim();
	if (trimmed === '' || trimmed === '-' || trimmed === '.' || trimmed === '-.') return null;
	const n = Number(trimmed);
	return Number.isFinite(n) ? n : null;
}
