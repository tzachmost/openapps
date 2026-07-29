import { md5 } from './md5';

export const ALGORITHMS = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const;
export type Algorithm = (typeof ALGORITHMS)[number];

export type Digests = Record<Algorithm, string>;

function toHex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

// MD5 isn't in SubtleCrypto (browsers deliberately don't expose it — it's broken for anything
// security-sensitive), so it's computed by the hand-rolled implementation in md5.ts; every other
// algorithm here goes through the platform's own SubtleCrypto rather than reimplementing SHA.
export async function hashBytes(bytes: Uint8Array<ArrayBuffer>): Promise<Digests> {
	// A Uint8Array view is itself a valid BufferSource for SubtleCrypto — no need to slice
	// out its underlying buffer first (which is also what triggers the ArrayBuffer vs.
	// SharedArrayBuffer generic mismatch TypeScript's newer lib.dom types complain about).
	const [sha1, sha256, sha384, sha512] = await Promise.all([
		crypto.subtle.digest('SHA-1', bytes),
		crypto.subtle.digest('SHA-256', bytes),
		crypto.subtle.digest('SHA-384', bytes),
		crypto.subtle.digest('SHA-512', bytes)
	]);
	return {
		MD5: md5(bytes),
		'SHA-1': toHex(sha1),
		'SHA-256': toHex(sha256),
		'SHA-384': toHex(sha384),
		'SHA-512': toHex(sha512)
	};
}

const HEX_LENGTH_TO_ALGORITHM: Record<number, Algorithm> = {
	32: 'MD5',
	40: 'SHA-1',
	64: 'SHA-256',
	96: 'SHA-384',
	128: 'SHA-512'
};

/** Normalizes a pasted hash (trims, strips internal whitespace, lowercases) and, if it's a
 *  plausible hex digest, reports which of Seal's algorithms it's the right length for. */
export function parseExpectedHash(
	raw: string
): { hex: string; algorithm: Algorithm } | { hex: string; algorithm: null } | null {
	const hex = raw.replace(/\s+/g, '').toLowerCase();
	if (hex === '') return null;
	if (!/^[0-9a-f]+$/.test(hex)) return { hex, algorithm: null };
	return { hex, algorithm: HEX_LENGTH_TO_ALGORITHM[hex.length] ?? null };
}
