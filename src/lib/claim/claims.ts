import type { JsonValue } from '$lib/sift/json';
import type { JwtObject } from './jwt';

export const CLAIM_LABELS: Record<string, string> = {
	iss: 'Issuer',
	sub: 'Subject',
	aud: 'Audience',
	exp: 'Expiration',
	nbf: 'Not valid before',
	iat: 'Issued at',
	jti: 'JWT ID'
};

const STANDARD_ORDER = ['iss', 'sub', 'aud', 'exp', 'nbf', 'iat', 'jti'];
const TIME_CLAIMS = new Set(['exp', 'nbf', 'iat']);

export type ClaimRow = { key: string; label: string; value: JsonValue; standard: boolean };

/** Standard registered claims first, in the order RFC 7519 lists them, then everything else
 *  in the order the payload defined it — never alphabetized, so a token's own claim order
 *  (which sometimes carries meaning, e.g. a custom claim placed right after `sub`) survives. */
export function orderedClaims(payload: JwtObject): ClaimRow[] {
	const keys = Object.keys(payload);
	const standard = STANDARD_ORDER.filter((k) => keys.includes(k));
	const rest = keys.filter((k) => !STANDARD_ORDER.includes(k));
	return [...standard, ...rest].map((key) => ({
		key,
		label: CLAIM_LABELS[key] ?? key,
		value: payload[key],
		standard: STANDARD_ORDER.includes(key)
	}));
}

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 60 * 60 * 24 * 365],
	['month', 60 * 60 * 24 * 30],
	['day', 60 * 60 * 24],
	['hour', 60 * 60],
	['minute', 60],
	['second', 1]
];

export function relativeTime(epochSeconds: number, nowSeconds: number): string {
	const diff = epochSeconds - nowSeconds;
	const abs = Math.abs(diff);
	for (const [unit, secondsPerUnit] of UNITS) {
		if (abs >= secondsPerUnit) return RTF.format(Math.round(diff / secondsPerUnit), unit);
	}
	return RTF.format(0, 'second');
}

export function formatEpoch(epochSeconds: number): string {
	if (!Number.isFinite(epochSeconds)) return 'not a valid timestamp';
	return new Date(epochSeconds * 1000).toLocaleString(undefined, {
		dateStyle: 'medium',
		timeStyle: 'medium'
	});
}

export function formatClaimValue(key: string, value: JsonValue): string {
	if (TIME_CLAIMS.has(key) && typeof value === 'number') return `${formatEpoch(value)} (${value})`;
	if (Array.isArray(value))
		return value.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(', ');
	if (value === null) return 'null';
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
}

export type ExpiryState = 'expired' | 'not-yet-valid' | 'valid' | 'no-expiry';
export type ExpiryStatus = { state: ExpiryState; message: string };

/** `nbf` (not-yet-valid) takes priority over `exp` when both would otherwise apply — a
 *  token can't be simultaneously "not started yet" and "already expired" in a way that's
 *  useful to report, and nbf-in-the-future is the more surprising, more worth-flagging state. */
export function computeExpiryStatus(payload: JwtObject, nowSeconds: number): ExpiryStatus {
	const exp = typeof payload.exp === 'number' ? payload.exp : undefined;
	const nbf = typeof payload.nbf === 'number' ? payload.nbf : undefined;

	if (nbf !== undefined && nowSeconds < nbf) {
		return {
			state: 'not-yet-valid',
			message: `Not valid until ${relativeTime(nbf, nowSeconds)} — ${formatEpoch(nbf)}.`
		};
	}
	if (exp === undefined) {
		return {
			state: 'no-expiry',
			message: 'No expiration claim — this token never expires on its own.'
		};
	}
	if (nowSeconds >= exp) {
		return {
			state: 'expired',
			message: `Expired ${relativeTime(exp, nowSeconds)} — ${formatEpoch(exp)}.`
		};
	}
	return {
		state: 'valid',
		message: `Valid — expires ${relativeTime(exp, nowSeconds)}, ${formatEpoch(exp)}.`
	};
}
