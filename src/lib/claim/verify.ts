import type { ParsedJwt } from './jwt';
import { pemToDer } from './pem';

export type AlgFamily = 'hmac' | 'rsa' | 'ecdsa' | 'none' | 'unsupported';

const HMAC: Record<string, string> = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' };
const RSA: Record<string, string> = { RS256: 'SHA-256', RS384: 'SHA-384', RS512: 'SHA-512' };
const ECDSA: Record<string, { hash: string; curve: string }> = {
	ES256: { hash: 'SHA-256', curve: 'P-256' },
	ES384: { hash: 'SHA-384', curve: 'P-384' },
	ES512: { hash: 'SHA-512', curve: 'P-521' }
};

export function algFamily(alg: string): AlgFamily {
	if (alg === 'none') return 'none';
	if (alg in HMAC) return 'hmac';
	if (alg in RSA) return 'rsa';
	if (alg in ECDSA) return 'ecdsa';
	return 'unsupported';
}

export type VerifyResult =
	{ status: 'valid' } | { status: 'invalid' } | { status: 'error'; message: string };

/**
 * Verifies a JWT's signature entirely via SubtleCrypto — never a hand-rolled HMAC/RSA/ECDSA
 * implementation, unlike Seal's MD5. A from-scratch signature check is exactly the kind of
 * security-critical code this site shouldn't be the one to get subtly wrong, and the
 * platform's implementation is both audited and already present.
 *
 * HS* takes a shared secret; the RS and ES families take a public key (SPKI PEM, the
 * "-----BEGIN PUBLIC KEY-----" form). Verifying a signature only ever needs the public half
 * of a keypair, so
 * this deliberately never asks for or accepts a private key — there's no legitimate reason
 * for a signature-verification tool to want one, so building it in place of a private-key
 * signer would be encouraging a real credential to be pasted into someone's browser tab.
 * Encoding a fresh token (jwt.ts's encodeJwt) covers the "I need to sign something" case
 * with HS256/384/512 only, where the "key" is just a shared test secret, not a keypair.
 *
 * ECDSA's raw signature format (r||s concatenated, no ASN.1 DER wrapping) happens to be
 * exactly what JOSE/JWT already uses for ES256/384/512 — same for RSASSA-PKCS1-v1_5's plain
 * signature bytes — so no signature re-encoding step is needed for either family.
 */
export async function verifySignature(
	parsed: ParsedJwt,
	keyMaterial: string
): Promise<VerifyResult> {
	const alg = parsed.header.alg;
	if (typeof alg !== 'string' || alg === '') {
		return { status: 'error', message: 'No "alg" found in the header.' };
	}
	const family = algFamily(alg);
	const data = new TextEncoder().encode(parsed.signingInput);

	try {
		if (family === 'hmac') {
			const key = await crypto.subtle.importKey(
				'raw',
				new TextEncoder().encode(keyMaterial),
				{ name: 'HMAC', hash: HMAC[alg] },
				false,
				['verify']
			);
			const ok = await crypto.subtle.verify('HMAC', key, parsed.signature, data);
			return { status: ok ? 'valid' : 'invalid' };
		}
		if (family === 'rsa') {
			const key = await crypto.subtle.importKey(
				'spki',
				pemToDer(keyMaterial),
				{ name: 'RSASSA-PKCS1-v1_5', hash: RSA[alg] },
				false,
				['verify']
			);
			const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, parsed.signature, data);
			return { status: ok ? 'valid' : 'invalid' };
		}
		if (family === 'ecdsa') {
			const { hash, curve } = ECDSA[alg];
			const key = await crypto.subtle.importKey(
				'spki',
				pemToDer(keyMaterial),
				{ name: 'ECDSA', namedCurve: curve },
				false,
				['verify']
			);
			const ok = await crypto.subtle.verify({ name: 'ECDSA', hash }, key, parsed.signature, data);
			return { status: ok ? 'valid' : 'invalid' };
		}
		return { status: 'error', message: `"${alg}" isn't a signature algorithm Claim verifies.` };
	} catch (error) {
		return {
			status: 'error',
			message:
				error instanceof Error
					? `Could not use this key: ${error.message}`
					: 'Could not use this key.'
		};
	}
}
