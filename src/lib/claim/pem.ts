/** Strips PEM armor ("-----BEGIN ...-----" / "-----END ...-----") and whitespace, then
 *  base64-decodes what's left into the raw DER bytes SubtleCrypto's `importKey('spki', …)`
 *  expects. No ASN.1 parsing needed beyond that — SubtleCrypto reads the DER structure itself. */
export function pemToDer(pem: string): ArrayBuffer {
	const body = pem
		.replace(/-----BEGIN [^-]+-----/g, '')
		.replace(/-----END [^-]+-----/g, '')
		.replace(/\s+/g, '');
	if (body === '') throw new Error('no key data found — expected a PEM block with BEGIN/END lines');
	const binary = atob(body);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes.buffer;
}
