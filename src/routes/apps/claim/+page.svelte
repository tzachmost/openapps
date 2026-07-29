<script lang="ts">
	import { resolve } from '$app/paths';
	import { SvelteSet } from 'svelte/reactivity';
	import JsonNode from '$lib/components/JsonNode.svelte';
	import { toPlainTree } from '$lib/sift/diff';
	import { parseJson, type JsonValue } from '$lib/sift/json';
	import { parseJwt, encodeJwt, type JwtObject, type EncodeResult } from '$lib/claim/jwt';
	import { verifySignature, algFamily, type VerifyResult } from '$lib/claim/verify';
	import { orderedClaims, computeExpiryStatus, formatClaimValue } from '$lib/claim/claims';

	const SAMPLE_SECRET = 'claim-demo-secret';

	let mode = $state<'decode' | 'encode'>('decode');

	// --- Shared: copy-to-clipboard with per-key feedback ---
	let copiedKey = $state<string | null>(null);

	async function copyText(key: string, text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copiedKey = key;
			setTimeout(() => {
				if (copiedKey === key) copiedKey = null;
			}, 1200);
		} catch {
			// Clipboard access can be denied by the browser; the text stays selectable either way.
		}
	}

	function asObject(value: JsonValue): JwtObject | null {
		if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
		return value as JwtObject;
	}

	// --- Decode mode ---
	let token = $state('');
	let nowSeconds = $state(Math.floor(Date.now() / 1000));
	let keyInput = $state('');
	let verifyResult = $state<VerifyResult | null>(null);
	let verifying = $state(false);
	let headerCollapsed = new SvelteSet<string>();
	let payloadCollapsed = new SvelteSet<string>();

	// A live countdown/relative-expiry display needs the clock to actually tick while the
	// tab is sitting open, not just at parse time.
	$effect(() => {
		const id = setInterval(() => {
			nowSeconds = Math.floor(Date.now() / 1000);
		}, 15_000);
		return () => clearInterval(id);
	});

	const parsed = $derived(token.trim() === '' ? null : parseJwt(token));

	// A previous verify result belongs to whatever token/key produced it — stale once either changes.
	$effect(() => {
		token;
		keyInput;
		verifyResult = null;
	});

	const headerTree = $derived(parsed?.ok ? toPlainTree(parsed.value.header) : null);
	const payloadTree = $derived(parsed?.ok ? toPlainTree(parsed.value.payload) : null);
	const claimRows = $derived(parsed?.ok ? orderedClaims(parsed.value.payload) : []);
	const expiryStatus = $derived(
		parsed?.ok ? computeExpiryStatus(parsed.value.payload, nowSeconds) : null
	);
	const alg = $derived.by(() => {
		const value = parsed?.ok ? parsed.value.header.alg : undefined;
		return typeof value === 'string' ? value : null;
	});
	const family = $derived(alg ? algFamily(alg) : null);

	async function runVerify() {
		if (!parsed?.ok) return;
		verifying = true;
		verifyResult = await verifySignature(parsed.value, keyInput);
		verifying = false;
	}

	function clearDecode() {
		token = '';
		keyInput = '';
		verifyResult = null;
		headerCollapsed.clear();
		payloadCollapsed.clear();
	}

	async function loadSample() {
		const now = Math.floor(Date.now() / 1000);
		const header = { alg: 'HS256', typ: 'JWT' };
		const payload = {
			sub: 'user_042',
			name: 'Ada Lovelace',
			iss: 'https://example.com',
			aud: 'openapps-demo',
			iat: now - 7200,
			exp: now - 3600
		};
		const result = await encodeJwt(header, payload, SAMPLE_SECRET);
		if (result.ok) {
			token = result.token;
			keyInput = SAMPLE_SECRET;
		}
	}

	// --- Encode mode ---
	let encHeaderText = $state(JSON.stringify({ alg: 'HS256', typ: 'JWT' }, null, 2));
	let encPayloadText = $state(JSON.stringify({ sub: '1234567890', name: 'Ada Lovelace' }, null, 2));
	let encSecret = $state('');
	let encResult = $state<EncodeResult | null>(null);
	let encSigning = $state(false);

	function setAlg(newAlg: string) {
		const parsedHeader = parseJson(encHeaderText);
		const base = (parsedHeader.ok && asObject(parsedHeader.value)) || {};
		encHeaderText = JSON.stringify({ ...base, alg: newAlg, typ: base.typ ?? 'JWT' }, null, 2);
	}

	function insertNowClaims() {
		const parsedPayload = parseJson(encPayloadText);
		const base = (parsedPayload.ok && asObject(parsedPayload.value)) || {};
		const now = Math.floor(Date.now() / 1000);
		encPayloadText = JSON.stringify({ ...base, iat: now, exp: now + 3600 }, null, 2);
	}

	async function sign() {
		encResult = null;
		const headerParsed = parseJson(encHeaderText);
		if (!headerParsed.ok) {
			encResult = {
				ok: false,
				message: `Header — line ${headerParsed.line}: ${headerParsed.message}`
			};
			return;
		}
		const header = asObject(headerParsed.value);
		if (!header) {
			encResult = { ok: false, message: 'Header must be a JSON object.' };
			return;
		}
		const payloadParsed = parseJson(encPayloadText);
		if (!payloadParsed.ok) {
			encResult = {
				ok: false,
				message: `Payload — line ${payloadParsed.line}: ${payloadParsed.message}`
			};
			return;
		}
		const payload = asObject(payloadParsed.value);
		if (!payload) {
			encResult = { ok: false, message: 'Payload must be a JSON object.' };
			return;
		}
		if (encSecret === '') {
			encResult = { ok: false, message: 'Enter a secret to sign with.' };
			return;
		}
		encSigning = true;
		encResult = await encodeJwt(header, payload, encSecret);
		encSigning = false;
	}

	function decodeGenerated() {
		if (!encResult?.ok) return;
		token = encResult.token;
		keyInput = encSecret;
		mode = 'decode';
	}
</script>

<svelte:head>
	<title>Claim — decode, inspect, and verify a JWT</title>
	<meta
		name="description"
		content="Decode a JSON Web Token's header and claims, see a plain-language expiry status, and verify its signature — HMAC secrets or RSA/ECDSA public keys, via the browser's own Web Crypto. Also builds and signs a fresh HS256/384/512 token. Nothing leaves your device."
	/>
</svelte:head>

<div class="page">
	<a class="back" href={resolve('/')}>← all tools</a>

	<header class="intro">
		<h1>Claim</h1>
		<p>
			Paste a token to decode its header and claims, see when it expires in plain language, and
			verify its signature — or switch to Encode to build and sign a fresh one. Tokens and keys
			never leave your browser; verification runs on the Web Crypto API already built into it.
		</p>
	</header>

	<div class="mode-toggle" role="group" aria-label="Mode">
		<button class:active={mode === 'decode'} onclick={() => (mode = 'decode')}>Decode</button>
		<button class:active={mode === 'encode'} onclick={() => (mode = 'encode')}>Encode</button>
	</div>

	{#if mode === 'decode'}
		<section class="decode">
			<div class="panel">
				<div class="panel-header">
					<span>Token</span>
					<div class="panel-actions">
						{#if token !== ''}
							<button class="link" onclick={clearDecode}>Clear</button>
						{/if}
						<button class="link" onclick={loadSample}>Load sample</button>
					</div>
				</div>
				<textarea
					bind:value={token}
					spellcheck="false"
					placeholder="Paste a JWT here — eyJhbGc...header.payload.signature"></textarea>
			</div>

			{#if token.trim() === ''}
				<p class="hint">Nothing to decode yet — paste a token above, or load the sample.</p>
			{:else if parsed && !parsed.ok}
				<div class="error-banner">
					<p><strong>Couldn't decode this.</strong> {parsed.message}</p>
				</div>
			{:else if parsed?.ok}
				{#if alg === 'none'}
					<div class="status-banner danger">
						<p>
							<strong>alg: "none"</strong> — this token has no signature at all. Anyone can forge one
							with any claims they like by removing the signature and setting this field. Never trust
							a token like this from an untrusted source; it's a well-known JWT vulnerability, not a quirk
							of this decoder.
						</p>
					</div>
				{/if}

				{#if expiryStatus}
					<div
						class="status-banner"
						class:valid={expiryStatus.state === 'valid'}
						class:warn={expiryStatus.state === 'not-yet-valid'}
						class:danger={expiryStatus.state === 'expired'}
						class:neutral={expiryStatus.state === 'no-expiry'}
					>
						<p>{expiryStatus.message}</p>
					</div>
				{/if}

				{#if claimRows.length > 0}
					<div class="claims-table">
						{#each claimRows as row (row.key)}
							<div class="claim-row" class:standard={row.standard}>
								<span class="claim-label">{row.label}</span>
								<span class="claim-value">{formatClaimValue(row.key, row.value)}</span>
							</div>
						{/each}
					</div>
				{/if}

				<div class="json-panels">
					<div class="panel">
						<div class="panel-header">
							<span>Header</span>
							<button
								class="link"
								onclick={() =>
									parsed?.ok && copyText('header', JSON.stringify(parsed.value.header, null, 2))}
							>
								{copiedKey === 'header' ? 'Copied!' : 'Copy'}
							</button>
						</div>
						<div class="tree-panel">
							{#if headerTree}
								<JsonNode node={headerTree} path="" depth={0} collapsed={headerCollapsed} />
							{/if}
						</div>
					</div>
					<div class="panel">
						<div class="panel-header">
							<span>Payload</span>
							<button
								class="link"
								onclick={() =>
									parsed?.ok && copyText('payload', JSON.stringify(parsed.value.payload, null, 2))}
							>
								{copiedKey === 'payload' ? 'Copied!' : 'Copy'}
							</button>
						</div>
						<div class="tree-panel">
							{#if payloadTree}
								<JsonNode node={payloadTree} path="" depth={0} collapsed={payloadCollapsed} />
							{/if}
						</div>
					</div>
				</div>

				<div class="verify-panel">
					<div class="verify-header">
						<span>Signature</span>
						{#if alg}<span class="alg-badge">{alg}</span>{/if}
					</div>

					{#if family === 'none'}
						<p class="hint">No signature to verify — see the warning above.</p>
					{:else if family === 'hmac'}
						<label for="key-input">Secret (the same one the token was signed with)</label>
						<input
							id="key-input"
							type="text"
							bind:value={keyInput}
							spellcheck="false"
							placeholder="your-256-bit-secret"
						/>
						<div class="verify-actions">
							<button
								class="primary small"
								disabled={keyInput === '' || verifying}
								onclick={runVerify}
							>
								{verifying ? 'Verifying…' : 'Verify signature'}
							</button>
						</div>
					{:else if family === 'rsa' || family === 'ecdsa'}
						<label for="key-input">Public key (PEM, SPKI format)</label>
						<textarea
							id="key-input"
							bind:value={keyInput}
							spellcheck="false"
							placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"
						></textarea>
						<div class="verify-actions">
							<button
								class="primary small"
								disabled={keyInput.trim() === '' || verifying}
								onclick={runVerify}
							>
								{verifying ? 'Verifying…' : 'Verify signature'}
							</button>
						</div>
					{:else}
						<p class="hint">"{alg}" isn't a signature algorithm Claim verifies yet.</p>
					{/if}

					{#if verifyResult}
						<div
							class="status-banner"
							class:valid={verifyResult.status === 'valid'}
							class:danger={verifyResult.status === 'invalid'}
							class:warn={verifyResult.status === 'error'}
						>
							{#if verifyResult.status === 'valid'}
								<p><strong>Signature valid</strong> — this token was signed with this key.</p>
							{:else if verifyResult.status === 'invalid'}
								<p><strong>Signature invalid</strong> — this token was not signed with this key.</p>
							{:else}
								<p>{verifyResult.message}</p>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</section>
	{:else}
		<section class="encode">
			<div class="panel">
				<div class="panel-header">
					<span>Header</span>
					<div class="panel-actions segmented" role="group" aria-label="Algorithm">
						<button onclick={() => setAlg('HS256')}>HS256</button>
						<button onclick={() => setAlg('HS384')}>HS384</button>
						<button onclick={() => setAlg('HS512')}>HS512</button>
					</div>
				</div>
				<textarea bind:value={encHeaderText} spellcheck="false"></textarea>
			</div>

			<div class="panel">
				<div class="panel-header">
					<span>Payload</span>
					<button class="link" onclick={insertNowClaims}>Insert iat / exp (now, +1h)</button>
				</div>
				<textarea bind:value={encPayloadText} spellcheck="false"></textarea>
			</div>

			<div class="verify-panel">
				<label for="enc-secret">Secret</label>
				<input
					id="enc-secret"
					type="text"
					bind:value={encSecret}
					spellcheck="false"
					placeholder="your-256-bit-secret"
				/>
				<div class="verify-actions">
					<button class="primary small" disabled={encSigning} onclick={sign}>
						{encSigning ? 'Signing…' : 'Sign & generate'}
					</button>
				</div>
			</div>

			{#if encResult && !encResult.ok}
				<div class="error-banner">
					<p>{encResult.message}</p>
				</div>
			{:else if encResult?.ok}
				<div class="panel">
					<div class="panel-header">
						<span>Token</span>
						<div class="panel-actions">
							<button
								class="link"
								onclick={() => encResult?.ok && copyText('token', encResult.token)}
							>
								{copiedKey === 'token' ? 'Copied!' : 'Copy'}
							</button>
							<button class="link" onclick={decodeGenerated}>Decode this →</button>
						</div>
					</div>
					<textarea readonly value={encResult.token}></textarea>
				</div>
			{/if}
		</section>
	{/if}
</div>

<style>
	.page {
		max-width: 60rem;
		margin: 0 auto;
		padding: 0 clamp(1.25rem, 4vw, 3rem) 4rem;
		--diff-add: #2f8f5b;
		--diff-changed: #b9852a;
	}

	@media (prefers-color-scheme: dark) {
		.page {
			--diff-add: #4bb87e;
			--diff-changed: #d9a63d;
		}
	}

	.back {
		display: inline-block;
		margin-bottom: 1.5rem;
		font-size: 0.85rem;
		color: var(--text-dim);
		text-decoration: none;
	}

	.back:hover {
		color: var(--text);
	}

	.intro h1 {
		font-size: clamp(1.8rem, 4vw, 2.3rem);
		letter-spacing: -0.02em;
	}

	.intro p {
		margin-top: 0.5rem;
		max-width: 42rem;
		color: var(--text-dim);
		line-height: 1.5;
	}

	.mode-toggle {
		display: inline-flex;
		gap: 0.25rem;
		margin-top: 1.5rem;
		padding: 0.25rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 999px;
	}

	.mode-toggle button {
		font: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		padding: 0.4rem 1.1rem;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--text-dim);
		cursor: pointer;
	}

	.mode-toggle button.active {
		background: var(--accent);
		color: var(--accent-text);
	}

	.decode,
	.encode {
		margin-top: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.panel {
		display: flex;
		flex-direction: column;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 14px;
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.6rem 0.9rem;
		border-bottom: 1px solid var(--border);
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-dim);
	}

	.panel-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	textarea,
	input[type='text'] {
		width: 100%;
		padding: 0.9rem;
		border: none;
		background: transparent;
		color: var(--text);
		font-family: var(--font-mono);
		font-size: 0.82rem;
		line-height: 1.5;
	}

	textarea {
		min-height: 6rem;
		resize: vertical;
	}

	.decode textarea {
		min-height: 5.5rem;
	}

	textarea:focus,
	input:focus {
		outline: none;
	}

	.hint {
		margin-top: 0;
		font-size: 0.85rem;
		color: var(--text-dim);
	}

	.error-banner {
		padding: 0.9rem 1rem;
		background: color-mix(in srgb, var(--accent) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
		border-radius: 12px;
		font-size: 0.85rem;
	}

	.error-banner p {
		color: var(--text);
	}

	.error-banner strong {
		color: var(--accent);
	}

	.status-banner {
		padding: 0.75rem 1rem;
		border-radius: 12px;
		font-size: 0.85rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
	}

	.status-banner p {
		color: var(--text);
		line-height: 1.5;
	}

	.status-banner.valid {
		background: color-mix(in srgb, var(--diff-add) 12%, transparent);
		border-color: color-mix(in srgb, var(--diff-add) 30%, transparent);
	}

	.status-banner.valid strong {
		color: var(--diff-add);
	}

	.status-banner.warn {
		background: color-mix(in srgb, var(--diff-changed) 14%, transparent);
		border-color: color-mix(in srgb, var(--diff-changed) 32%, transparent);
	}

	.status-banner.warn strong {
		color: var(--diff-changed);
	}

	.status-banner.danger {
		background: color-mix(in srgb, var(--accent) 8%, transparent);
		border-color: color-mix(in srgb, var(--accent) 30%, transparent);
	}

	.status-banner.danger strong {
		color: var(--accent);
	}

	.status-banner.neutral p {
		color: var(--text-dim);
	}

	.claims-table {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.claim-row {
		display: grid;
		grid-template-columns: 9rem 1fr;
		gap: 0.6rem;
		padding: 0.5rem 0.7rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 10px;
		font-size: 0.82rem;
	}

	.claim-label {
		color: var(--text-dim);
	}

	.claim-row.standard .claim-label {
		color: var(--text);
		font-weight: 600;
	}

	.claim-value {
		font-family: var(--font-mono);
		overflow-wrap: anywhere;
	}

	.json-panels {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.tree-panel {
		padding: 0.75rem 0.25rem;
		max-height: 22rem;
		overflow: auto;
	}

	.verify-panel {
		padding: 1rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 14px;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.verify-header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-dim);
	}

	.alg-badge {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		background: var(--bg);
		border: 1px solid var(--border);
		color: var(--text);
		text-transform: none;
		letter-spacing: normal;
	}

	.verify-panel label {
		font-size: 0.8rem;
		color: var(--text-dim);
	}

	.verify-panel input,
	.verify-panel textarea {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 10px;
	}

	.verify-panel textarea {
		min-height: 5.5rem;
	}

	.verify-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.segmented {
		display: flex;
		border: 1px solid var(--border);
		border-radius: 999px;
		overflow: hidden;
	}

	.segmented button {
		font: inherit;
		font-size: 0.72rem;
		padding: 0.3rem 0.6rem;
		border: none;
		background: transparent;
		color: var(--text-dim);
		cursor: pointer;
	}

	.segmented button:hover {
		color: var(--text);
	}

	button.link {
		font: inherit;
		font-size: 0.8rem;
		background: none;
		border: none;
		padding: 0;
		color: var(--text-dim);
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}

	button.link:hover {
		color: var(--text);
	}

	button.primary {
		font: inherit;
		font-size: 0.85rem;
		background: var(--accent);
		border: 1px solid var(--accent);
		color: var(--accent-text);
		border-radius: 999px;
		padding: 0.6rem 1rem;
		cursor: pointer;
		font-weight: 500;
	}

	button.primary.small {
		padding: 0.5rem 0.9rem;
		font-size: 0.8rem;
	}

	button.primary:hover:not(:disabled) {
		filter: brightness(1.05);
	}

	button.primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 42rem) {
		.json-panels {
			grid-template-columns: 1fr;
		}
	}
</style>
