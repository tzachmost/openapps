<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		generatePassword,
		generatePassphrase,
		strengthOf,
		estimateCrackTime,
		WORDLIST_SIZE,
		type PasswordOptions,
		type PassphraseOptions
	} from '$lib/ward/generate';

	const SEPARATORS = [
		{ id: '-', label: 'Hyphen' },
		{ id: ' ', label: 'Space' },
		{ id: '.', label: 'Period' },
		{ id: '', label: 'None' }
	];

	let mode = $state<'password' | 'passphrase'>('password');

	let passwordOpts = $state<PasswordOptions>({
		length: 20,
		lower: true,
		upper: true,
		digits: true,
		symbols: true,
		excludeAmbiguous: false,
		requireEachType: true
	});
	let passwordNonce = $state(0);

	let passphraseOpts = $state<PassphraseOptions>({
		wordCount: 5,
		separator: '-',
		capitalize: true,
		appendNumber: false
	});
	let passphraseNonce = $state(0);

	const passwordResult = $derived.by(() => {
		passwordNonce;
		return generatePassword(passwordOpts);
	});

	const passphraseResult = $derived.by(() => {
		passphraseNonce;
		return generatePassphrase(passphraseOpts);
	});

	const result = $derived(mode === 'password' ? passwordResult : passphraseResult);
	const strength = $derived(result ? strengthOf(result.entropyBits) : null);
	const crackTime = $derived(result ? estimateCrackTime(result.entropyBits) : null);

	let copied = $state(false);

	async function copyValue() {
		if (!result) return;
		try {
			await navigator.clipboard.writeText(result.value);
			copied = true;
			setTimeout(() => (copied = false), 1200);
		} catch {
			// Clipboard access can be denied by the browser; the value stays selectable either way.
		}
	}

	function regenerate() {
		if (mode === 'password') passwordNonce++;
		else passphraseNonce++;
	}
</script>

<svelte:head>
	<title>Ward — password and passphrase generator</title>
	<meta
		name="description"
		content="Generate a strong password or a diceware passphrase using your browser's own cryptographic randomness. Nothing is stored, nothing leaves your device."
	/>
</svelte:head>

<div class="page">
	<a class="back" href={resolve('/')}>← all tools</a>

	<header class="intro">
		<h1>Ward</h1>
		<p>
			Every character comes from <code>crypto.getRandomValues</code>, your browser's
			cryptographically secure random number generator — never <code>Math.random</code>, which isn't
			built to resist guessing. Nothing here is saved or sent anywhere; close the tab and it's gone.
		</p>
	</header>

	<div class="mode-toggle" role="group" aria-label="Mode">
		<button class:active={mode === 'password'} onclick={() => (mode = 'password')}>Password</button>
		<button class:active={mode === 'passphrase'} onclick={() => (mode = 'passphrase')}
			>Passphrase</button
		>
	</div>

	<div class="panel">
		{#if result}
			<output class="value">{result.value}</output>
		{:else}
			<p class="empty">Pick at least one character type below.</p>
		{/if}
		<div class="panel-actions">
			<button class="ghost" onclick={regenerate}>New</button>
			<button class="primary" disabled={!result} onclick={copyValue}>
				{copied ? 'Copied!' : 'Copy'}
			</button>
		</div>
	</div>

	{#if result && strength && crackTime}
		<div class="meter">
			<div class="bar">
				<div
					class="fill"
					class:level0={strength.level === 0}
					class:level1={strength.level === 1}
					class:level2={strength.level === 2}
					class:level3={strength.level === 3}
					class:level4={strength.level === 4}
					style:width={`${20 + strength.level * 20}%`}
				></div>
			</div>
			<p class="strength-line">
				<strong>{strength.label}</strong>
				<span class="dim">
					· ~{Math.round(result.entropyBits)} bits of entropy · brute force averages {crackTime}
				</span>
			</p>
			<p class="caveat">
				Assumes 10 billion guesses a second, a fast offline attack — an order of magnitude, not a
				promise. A slow, salted hash on the other end resists far more than this; plaintext or a
				fast hash resists far less.
			</p>
		</div>
	{/if}

	{#if mode === 'password'}
		<fieldset class="controls">
			<legend>Length <em>{passwordOpts.length}</em></legend>
			<input type="range" min="8" max="64" step="1" bind:value={passwordOpts.length} />

			<div class="toggle-grid">
				<label class="toggle">
					<input type="checkbox" bind:checked={passwordOpts.lower} />
					<span>Lowercase (a–z)</span>
				</label>
				<label class="toggle">
					<input type="checkbox" bind:checked={passwordOpts.upper} />
					<span>Uppercase (A–Z)</span>
				</label>
				<label class="toggle">
					<input type="checkbox" bind:checked={passwordOpts.digits} />
					<span>Digits (0–9)</span>
				</label>
				<label class="toggle">
					<input type="checkbox" bind:checked={passwordOpts.symbols} />
					<span>Symbols (!@#…)</span>
				</label>
			</div>

			<label class="toggle standalone">
				<input type="checkbox" bind:checked={passwordOpts.excludeAmbiguous} />
				<span>Exclude look-alike characters (I, l, 1, O, 0, o)</span>
			</label>
			<label class="toggle standalone">
				<input type="checkbox" bind:checked={passwordOpts.requireEachType} />
				<span>Require at least one of each selected type</span>
			</label>
		</fieldset>
	{:else}
		<fieldset class="controls">
			<legend>Words <em>{passphraseOpts.wordCount}</em></legend>
			<input type="range" min="3" max="10" step="1" bind:value={passphraseOpts.wordCount} />

			<div class="segmented">
				{#each SEPARATORS as sep (sep.id)}
					<label class:selected={passphraseOpts.separator === sep.id}>
						<input type="radio" bind:group={passphraseOpts.separator} value={sep.id} />
						{sep.label}
					</label>
				{/each}
			</div>

			<label class="toggle standalone">
				<input type="checkbox" bind:checked={passphraseOpts.capitalize} />
				<span>Capitalize each word</span>
			</label>
			<label class="toggle standalone">
				<input type="checkbox" bind:checked={passphraseOpts.appendNumber} />
				<span>Add a two-digit number</span>
			</label>

			<p class="note">
				Drawn from the EFF's public 7,776-word list — the same "diceware" method as five dice rolls
				per word — {WORDLIST_SIZE.toLocaleString()} words, each one distinct enough to read and remember
				on its own.
			</p>
		</fieldset>
	{/if}
</div>

<style>
	.page {
		max-width: 42rem;
		margin: 0 auto;
		padding: 0 clamp(1.25rem, 4vw, 3rem) 4rem;
		--level0: #c0392b;
		--level1: #d9822b;
		--level2: #cbaa1a;
		--level3: #6fa83f;
		--level4: #2f8f5b;
	}

	@media (prefers-color-scheme: dark) {
		.page {
			--level0: #e05c4c;
			--level1: #eb9a4a;
			--level2: #dcc248;
			--level3: #86c25c;
			--level4: #4bb87e;
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
		color: var(--text-dim);
		line-height: 1.5;
	}

	.intro code {
		font-family: var(--font-mono);
		font-size: 0.85em;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0.05em 0.35em;
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

	.panel {
		margin-top: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		padding: 1.1rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 14px;
	}

	.value {
		display: block;
		font-family: var(--font-mono);
		font-size: clamp(1rem, 3.2vw, 1.3rem);
		line-height: 1.5;
		word-break: break-all;
		user-select: all;
	}

	.empty {
		color: var(--text-dim);
		font-size: 0.9rem;
	}

	.panel-actions {
		display: flex;
		gap: 0.5rem;
	}

	button.ghost,
	button.primary {
		font: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		padding: 0.5rem 1rem;
		border-radius: 10px;
		cursor: pointer;
	}

	button.ghost {
		background: transparent;
		border: 1px solid var(--border);
		color: var(--text);
	}

	button.ghost:hover {
		border-color: var(--border-strong);
	}

	button.primary {
		background: var(--accent);
		border: 1px solid var(--accent);
		color: var(--accent-text);
	}

	button.primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.meter {
		margin-top: 1rem;
	}

	.bar {
		height: 6px;
		border-radius: 999px;
		background: var(--border);
		overflow: hidden;
	}

	.fill {
		height: 100%;
		border-radius: inherit;
		transition: width 0.15s ease;
	}

	.fill.level0 {
		background: var(--level0);
	}
	.fill.level1 {
		background: var(--level1);
	}
	.fill.level2 {
		background: var(--level2);
	}
	.fill.level3 {
		background: var(--level3);
	}
	.fill.level4 {
		background: var(--level4);
	}

	.strength-line {
		margin-top: 0.5rem;
		font-size: 0.85rem;
	}

	.dim {
		color: var(--text-dim);
		font-weight: 400;
	}

	.caveat {
		margin-top: 0.35rem;
		font-size: 0.78rem;
		color: var(--text-dim);
		line-height: 1.45;
	}

	.controls {
		margin: 1.75rem 0 0;
		padding: 0;
		border: 0;
	}

	.controls legend {
		padding: 0;
		margin-bottom: 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dim);
	}

	.controls legend em {
		font-style: normal;
		color: var(--text);
	}

	input[type='range'] {
		width: 100%;
		accent-color: var(--accent);
	}

	.toggle-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem 1rem;
		margin-top: 1rem;
	}

	.toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.82rem;
		cursor: pointer;
	}

	.toggle input {
		accent-color: var(--accent);
	}

	.toggle.standalone {
		margin-top: 0.8rem;
	}

	.segmented {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: 1rem;
	}

	.segmented label {
		font-size: 0.75rem;
		padding: 0.35rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		cursor: pointer;
		color: var(--text-dim);
		transition:
			border-color 0.15s ease,
			color 0.15s ease,
			background 0.15s ease;
	}

	.segmented label:hover {
		border-color: var(--border-strong);
		color: var(--text);
	}

	.segmented label.selected {
		border-color: var(--accent);
		color: var(--text);
		background: var(--bg-elevated);
	}

	.segmented input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.note {
		margin-top: 1rem;
		font-size: 0.8rem;
		color: var(--text-dim);
		line-height: 1.5;
	}

	@media (max-width: 26rem) {
		.toggle-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
