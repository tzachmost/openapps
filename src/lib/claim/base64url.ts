/** Base64url (RFC 4648 §5) — the encoding every JWS/JWT segment uses: no padding,
 *  '+' → '-', '/' → '_'. Node/Buffer isn't available here, so this goes through the
 *  browser's own atob/btoa rather than a hand-rolled table, same "trust the platform for
 *  the boring parts" instinct as Crest trusting canvas.toBlob for PNG. */

export function base64UrlDecode(input: string): Uint8Array<ArrayBuffer> {
	const padded = input.replace(/-/g, '+').replace(/_/g, '/');
	const withPadding = padded + '='.repeat((4 - (padded.length % 4)) % 4);
	const binary = atob(withPadding);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes as Uint8Array<ArrayBuffer>;
}

export function base64UrlEncode(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecodeToText(input: string): string {
	return new TextDecoder().decode(base64UrlDecode(input));
}

export function base64UrlEncodeText(text: string): string {
	return base64UrlEncode(new TextEncoder().encode(text));
}
