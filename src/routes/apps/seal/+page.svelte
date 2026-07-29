<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatBytes } from '$lib/format';
	import { ALGORITHMS, hashBytes, parseExpectedHash, type Digests } from '$lib/seal/hash';

	// SubtleCrypto and the hand-rolled MD5 both need the whole file in memory as one
	// ArrayBuffer — there's no streaming digest API for MD5, and chunking would only help
	// the SHA family. Past this size a hash still *works*, it just risks freezing the tab
	// for long enough to look broken, so it's an honest hard cap instead — same pattern as
	// Loop's frame budget and Delta's line cap.
	const MAX_HASH_BYTES = 1024 ** 3; // 1 GiB

	type FileItem = {
		id: string;
		file: File;
		status: 'hashing' | 'ready' | 'error' | 'too-large';
		digests?: Digests;
		showAll: boolean;
		compareInput: string;
		errorMessage?: string;
	};

	// --- Mode ---
	let mode = $state<'text' | 'files'>('text');

	// --- Text mode ---
	let textInput = $state('');
	let textDigests = $state<Digests | null>(null);
	let textHashing = $state(false);
	let textCompareInput = $state('');

	$effect(() => {
		const value = textInput;
		if (value === '') {
			textDigests = null;
			textHashing = false;
			return;
		}
		let cancelled = false;
		textHashing = true;
		hashBytes(new TextEncoder().encode(value)).then((digests) => {
			if (cancelled) return;
			textDigests = digests;
			textHashing = false;
		});
		return () => {
			cancelled = true;
		};
	});

	const textCompare = $derived(compareResult(textDigests ?? undefined, textCompareInput));

	// --- Files mode ---
	let items = $state<FileItem[]>([]);
	let dragActive = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

	// Look the item back up by id rather than closing over an object reference — see Bare/
	// Squish for why (the $state array hands out reactive proxies only after assignment).
	function findItem(id: string): FileItem | undefined {
		return items.find((entry) => entry.id === id);
	}

	async function hashItem(id: string) {
		const item = findItem(id);
		if (!item) return;
		if (item.file.size > MAX_HASH_BYTES) {
			item.status = 'too-large';
			return;
		}
		try {
			const buffer = await item.file.arrayBuffer();
			const digests = await hashBytes(new Uint8Array(buffer));
			const current = findItem(id);
			if (!current) return;
			current.digests = digests;
			current.status = 'ready';
		} catch (error) {
			const current = findItem(id);
			if (!current) return;
			current.status = 'error';
			current.errorMessage = error instanceof Error ? error.message : 'Could not hash this file.';
		}
	}

	function addFiles(fileList: FileList | File[]) {
		const files = Array.from(fileList);
		const newItems: FileItem[] = files.map((file) => ({
			id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
			file,
			status: 'hashing',
			showAll: false,
			compareInput: ''
		}));
		items = [...items, ...newItems];
		for (const item of newItems) hashItem(item.id);
	}

	function removeItem(id: string) {
		items = items.filter((entry) => entry.id !== id);
	}

	function clearAll() {
		items = [];
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragActive = false;
		if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
	}

	function onFilePick(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files?.length) addFiles(target.files);
		target.value = '';
	}

	// SHA-256 → ids of every ready item sharing it. A group of size 1 just means "unique".
	const duplicateGroups = $derived.by(() => {
		const groups = new Map<string, string[]>();
		for (const item of items) {
			if (item.status !== 'ready' || !item.digests) continue;
			const key = item.digests['SHA-256'];
			const group = groups.get(key) ?? [];
			group.push(item.id);
			groups.set(key, group);
		}
		return groups;
	});

	function duplicateCount(item: FileItem): number {
		if (item.status !== 'ready' || !item.digests) return 0;
		return (duplicateGroups.get(item.digests['SHA-256'])?.length ?? 1) - 1;
	}

	// --- Shared: compare-with-expected-hash logic ---
	function compareResult(
		digests: Digests | undefined,
		compareInput: string
	): { status: 'match' | 'mismatch' | 'unrecognized'; algorithm: string | null } | null {
		if (compareInput.trim() === '') return null;
		const parsed = parseExpectedHash(compareInput);
		if (!parsed) return null;
		if (parsed.algorithm === null) return { status: 'unrecognized', algorithm: null };
		if (!digests) return null;
		const match = digests[parsed.algorithm] === parsed.hex;
		return { status: match ? 'match' : 'mismatch', algorithm: parsed.algorithm };
	}

	// --- Shared: copy-to-clipboard with per-row feedback ---
	let copiedKey = $state<string | null>(null);

	async function copyHash(key: string, value: string) {
		try {
			await navigator.clipboard.writeText(value);
			copiedKey = key;
			setTimeout(() => {
				if (copiedKey === key) copiedKey = null;
			}, 1200);
		} catch {
			// Clipboard access can be denied by the browser; the hash stays selectable either way.
		}
	}
</script>

<svelte:head>
	<title>Seal — checksums and hash verification</title>
	<meta
		name="description"
		content="Compute MD5, SHA-1, SHA-256, SHA-384, and SHA-512 for text or files, and verify against an expected hash — entirely in your browser. Nothing is uploaded."
	/>
</svelte:head>

<div class="page">
	<a class="back" href={resolve('/')}>← all tools</a>

	<header class="intro">
		<h1>Seal</h1>
		<p>
			Compute a file or a piece of text's checksum across five algorithms, and check it against one
			you were given. Everything is hashed on your device — nothing is ever uploaded.
		</p>
	</header>

	<div class="mode-toggle" role="group" aria-label="Mode">
		<button class:active={mode === 'text'} onclick={() => (mode = 'text')}>Text</button>
		<button class:active={mode === 'files'} onclick={() => (mode = 'files')}>Files</button>
	</div>

	{#if mode === 'text'}
		<section class="text-mode">
			<div class="panel">
				<div class="panel-header">
					<span>Input</span>
					{#if textInput !== ''}
						<button class="link" onclick={() => (textInput = '')}>Clear</button>
					{/if}
				</div>
				<textarea
					bind:value={textInput}
					spellcheck="false"
					placeholder="Type or paste text to hash…"></textarea>
			</div>

			{#if textInput === ''}
				<p class="hint">Nothing to hash yet — type or paste something above.</p>
			{:else}
				<div class="digest-table" class:pending={textHashing}>
					{#each ALGORITHMS as algorithm (algorithm)}
						<div class="digest-row">
							<span class="algo">{algorithm}</span>
							<code>{textDigests?.[algorithm] ?? '…'}</code>
							<button
								class="link"
								disabled={!textDigests}
								onclick={() => textDigests && copyHash(`text-${algorithm}`, textDigests[algorithm])}
							>
								{copiedKey === `text-${algorithm}` ? 'Copied!' : 'Copy'}
							</button>
						</div>
					{/each}
				</div>

				<div class="compare">
					<label for="text-compare">Compare with an expected hash</label>
					<input
						id="text-compare"
						type="text"
						bind:value={textCompareInput}
						spellcheck="false"
						placeholder="Paste a hash to check it against the one above…"
					/>
					{#if textCompare}
						{#if textCompare.status === 'match'}
							<p class="compare-result match">✓ Matches {textCompare.algorithm}.</p>
						{:else if textCompare.status === 'mismatch'}
							<p class="compare-result mismatch">✗ Does not match {textCompare.algorithm}.</p>
						{:else}
							<p class="compare-result unrecognized">
								Not a recognized hash length for MD5, SHA-1, SHA-256, SHA-384, or SHA-512.
							</p>
						{/if}
					{/if}
				</div>
			{/if}
		</section>
	{:else}
		<section class="files-mode">
			<div
				class="dropzone"
				class:active={dragActive}
				ondragover={(event) => {
					event.preventDefault();
					dragActive = true;
				}}
				ondragleave={() => (dragActive = false)}
				ondrop={onDrop}
				onclick={() => fileInput?.click()}
				onkeydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') fileInput?.click();
				}}
				role="button"
				tabindex="0"
			>
				<p><strong>Drop any files here</strong> or click to browse.</p>
				<input
					bind:this={fileInput}
					type="file"
					multiple
					class="visually-hidden"
					onchange={onFilePick}
				/>
			</div>

			{#if items.length > 0}
				<div class="results-header">
					<p>{items.length} file{items.length === 1 ? '' : 's'}</p>
					<button class="ghost" onclick={clearAll}>Clear</button>
				</div>

				<ul>
					{#each items as item (item.id)}
						{@const compare = compareResult(item.digests, item.compareInput)}
						<li>
							<div class="row">
								<div class="meta">
									<p class="name">{item.file.name}</p>
									<p class="status">
										{formatBytes(item.file.size)}
										{#if item.status === 'hashing'}
											· hashing…
										{:else if item.status === 'too-large'}
											· too large to hash safely in the browser (over {formatBytes(MAX_HASH_BYTES)})
										{:else if item.status === 'error'}
											· <span class="error">{item.errorMessage}</span>
										{:else if duplicateCount(item) > 0}
											· <span class="duplicate"
												>matches {duplicateCount(item)} other file{duplicateCount(item) === 1
													? ''
													: 's'} in this list</span
											>
										{/if}
									</p>
								</div>
								<button class="icon-button" aria-label="Remove" onclick={() => removeItem(item.id)}
									>×</button
								>
							</div>

							{#if item.status === 'ready' && item.digests}
								<div class="digest-row">
									<span class="algo">SHA-256</span>
									<code>{item.digests['SHA-256']}</code>
									<button
										class="link"
										onclick={() =>
											item.digests && copyHash(`${item.id}-SHA-256`, item.digests['SHA-256'])}
									>
										{copiedKey === `${item.id}-SHA-256` ? 'Copied!' : 'Copy'}
									</button>
								</div>

								<button class="link show-all" onclick={() => (item.showAll = !item.showAll)}>
									{item.showAll ? 'Hide other formats' : 'Show MD5, SHA-1, SHA-384, SHA-512'}
								</button>

								{#if item.showAll}
									<div class="digest-table nested">
										{#each ALGORITHMS.filter((a) => a !== 'SHA-256') as algorithm (algorithm)}
											<div class="digest-row">
												<span class="algo">{algorithm}</span>
												<code>{item.digests[algorithm]}</code>
												<button
													class="link"
													onclick={() =>
														item.digests &&
														copyHash(`${item.id}-${algorithm}`, item.digests[algorithm])}
												>
													{copiedKey === `${item.id}-${algorithm}` ? 'Copied!' : 'Copy'}
												</button>
											</div>
										{/each}
									</div>
								{/if}

								<div class="compare">
									<input
										type="text"
										bind:value={item.compareInput}
										spellcheck="false"
										placeholder="Paste an expected hash to verify…"
									/>
									{#if compare}
										{#if compare.status === 'match'}
											<p class="compare-result match">✓ Matches {compare.algorithm}.</p>
										{:else if compare.status === 'mismatch'}
											<p class="compare-result mismatch">✗ Does not match {compare.algorithm}.</p>
										{:else}
											<p class="compare-result unrecognized">Not a recognized hash length.</p>
										{/if}
									{/if}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>

<style>
	.page {
		max-width: 42rem;
		margin: 0 auto;
		padding: 0 clamp(1.25rem, 4vw, 3rem) 4rem;
		--match: #2f8f5b;
	}

	@media (prefers-color-scheme: dark) {
		.page {
			--match: #4bb87e;
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

	.text-mode,
	.files-mode {
		margin-top: 1.5rem;
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

	textarea {
		width: 100%;
		min-height: 8rem;
		padding: 0.9rem;
		border: none;
		background: transparent;
		color: var(--text);
		font-family: var(--font-mono);
		font-size: 0.85rem;
		line-height: 1.5;
		resize: vertical;
	}

	textarea:focus {
		outline: none;
	}

	.hint {
		margin-top: 1.25rem;
		font-size: 0.85rem;
		color: var(--text-dim);
	}

	.digest-table {
		margin-top: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		transition: opacity 0.15s ease;
	}

	.digest-table.pending {
		opacity: 0.5;
	}

	.digest-table.nested {
		margin-top: 0.5rem;
	}

	.digest-row {
		display: grid;
		grid-template-columns: 5.5rem 1fr auto;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.7rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 10px;
	}

	.digest-row .algo {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-dim);
	}

	.digest-row code {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		word-break: break-all;
	}

	.compare {
		margin-top: 1.25rem;
	}

	.compare label {
		display: block;
		margin-bottom: 0.4rem;
		font-size: 0.8rem;
		color: var(--text-dim);
	}

	.compare input {
		width: 100%;
		padding: 0.6rem 0.8rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 10px;
		color: var(--text);
		font-family: var(--font-mono);
		font-size: 0.82rem;
	}

	.compare input:focus {
		outline: none;
		border-color: var(--border-strong);
	}

	.compare-result {
		margin-top: 0.5rem;
		font-size: 0.82rem;
		font-weight: 600;
	}

	.compare-result.match {
		color: var(--match);
	}

	.compare-result.mismatch {
		color: var(--accent);
	}

	.compare-result.unrecognized {
		color: var(--text-dim);
		font-weight: 400;
	}

	.dropzone {
		border: 1.5px dashed var(--border-strong);
		border-radius: 16px;
		padding: clamp(2rem, 6vw, 3rem) 1.5rem;
		text-align: center;
		cursor: pointer;
		color: var(--text-dim);
		transition:
			border-color 0.15s ease,
			background 0.15s ease;
	}

	.dropzone:hover,
	.dropzone.active {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 6%, transparent);
	}

	.dropzone strong {
		color: var(--text);
	}

	.results-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 1.5rem;
		margin-bottom: 1rem;
	}

	.results-header p {
		font-size: 0.9rem;
		color: var(--text-dim);
	}

	button.ghost {
		font: inherit;
		font-size: 0.8rem;
		background: transparent;
		border: 1px solid var(--border);
		color: var(--text);
		border-radius: 999px;
		padding: 0.45rem 0.9rem;
		cursor: pointer;
		transition: border-color 0.15s ease;
	}

	button.ghost:hover {
		border-color: var(--border-strong);
	}

	button.link {
		font: inherit;
		font-size: 0.78rem;
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

	button.link:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.show-all {
		display: inline-block;
		margin-top: 0.6rem;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	li {
		padding: 0.75rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 12px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.9rem;
	}

	.meta {
		flex: 1;
		min-width: 0;
	}

	.name {
		font-size: 0.9rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.status {
		margin-top: 0.15rem;
		font-size: 0.8rem;
		color: var(--text-dim);
	}

	.status .error {
		color: var(--accent);
	}

	.status .duplicate {
		color: var(--accent);
		font-weight: 600;
	}

	li .digest-row {
		margin-top: 0.7rem;
	}

	.icon-button {
		width: 1.8rem;
		height: 1.8rem;
		display: grid;
		place-items: center;
		border-radius: 50%;
		border: 1px solid transparent;
		background: transparent;
		color: var(--text-dim);
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
		flex-shrink: 0;
	}

	.icon-button:hover {
		color: var(--text);
		border-color: var(--border);
	}

	@media (max-width: 30rem) {
		.digest-row {
			grid-template-columns: 1fr;
			row-gap: 0.3rem;
		}
	}
</style>
