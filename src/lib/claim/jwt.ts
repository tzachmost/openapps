import type { JsonValue } from '$lib/sift/json';
import {
	base64UrlDecode,
	base64UrlDecodeToText,
	base64UrlEncode,
	base64UrlEncodeText
} from './base64url';

export type JwtObject = Record<string, JsonValue>;

export type ParsedJwt = {
	header: JwtObject;
	payload: JwtObject;
	/** Exactly the bytes that were signed — `header64.payload64`, before any re-serialization. */
	signingInput: string;
	signature: Uint8Array<ArrayBuffer>;
};

export type ParseResult = { ok: true; value: ParsedJwt } | { ok: false; message: string };

function isPlainObject(value: unknown): value is JwtObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseJwt(token: string): ParseResult {
	const trimmed = token.trim();
	if (trimmed === '') return { ok: false, message: 'Paste a token to decode.' };

	const parts = trimmed.split('.');
	if (parts.length !== 3) {
		return {
			ok: false,
			message: `A JWT has three dot-separated parts (header.payload.signature) — this one has ${parts.length}.`
		};
	}
	const [headerPart, payloadPart, signaturePart] = parts;

	let header: unknown;
	let payload: unknown;
	try {
		header = JSON.parse(base64UrlDecodeToText(headerPart));
	} catch {
		return { ok: false, message: 'The header segment is not valid base64url-encoded JSON.' };
	}
	try {
		payload = JSON.parse(base64UrlDecodeToText(payloadPart));
	} catch {
		return { ok: false, message: 'The payload segment is not valid base64url-encoded JSON.' };
	}
	if (!isPlainObject(header)) {
		return {
			ok: false,
			message: 'The header must decode to a JSON object, not an array or scalar.'
		};
	}
	if (!isPlainObject(payload)) {
		return {
			ok: false,
			message: 'The payload must decode to a JSON object, not an array or scalar.'
		};
	}

	let signature: Uint8Array<ArrayBuffer>;
	try {
		signature = base64UrlDecode(signaturePart);
	} catch {
		return { ok: false, message: 'The signature segment is not valid base64url.' };
	}

	return {
		ok: true,
		value: { header, payload, signingInput: `${headerPart}.${payloadPart}`, signature }
	};
}

const HMAC_ALGS = ['HS256', 'HS384', 'HS512'] as const;
type HmacAlg = (typeof HMAC_ALGS)[number];

export function isHmacAlg(alg: unknown): alg is HmacAlg {
	return typeof alg === 'string' && (HMAC_ALGS as readonly string[]).includes(alg);
}

const HMAC_HASH: Record<HmacAlg, string> = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' };

export type EncodeResult = { ok: true; token: string } | { ok: false; message: string };

/** Builds and HMAC-signs a JWT from header/payload objects. Only HS256/384/512 — RS/ES/PS
 *  signing needs a private key, and this tool never asks for one (see verify.ts's doc
 *  comment: accepting a private key here would be the wrong feature for a browser tool to
 *  offer, not just an unimplemented one). */
export async function encodeJwt(
	header: JwtObject,
	payload: JwtObject,
	secret: string
): Promise<EncodeResult> {
	if (!isHmacAlg(header.alg)) {
		return {
			ok: false,
			message:
				'The header\'s "alg" must be HS256, HS384, or HS512 — Claim only signs with a shared secret. Asymmetric algorithms (RS*/ES*) need a private key.'
		};
	}
	const signingInput = `${base64UrlEncodeText(JSON.stringify(header))}.${base64UrlEncodeText(JSON.stringify(payload))}`;
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: HMAC_HASH[header.alg] },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
	return { ok: true, token: `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}` };
}
