<script lang="ts">
	import { resolve } from '$app/paths';
	import { SvelteSet } from 'svelte/reactivity';
	import JsonNode from '$lib/components/JsonNode.svelte';
	import { formatBytes } from '$lib/format';
	import {
		parseJson,
		stringifyPretty,
		stringifyMinified,
		measure,
		type ParseResult
	} from '$lib/sift/json';
	import { diffValues, toPlainTree, summarizeDiff, type DiffNode } from '$lib/sift/diff';
	import { SAMPLE_BEFORE, SAMPLE_AFTER } from '$lib/sift/samples';

	type Indent = '2' | '4' | 'tab';

	let mode = $state<'format' | 'diff'>('format');

	// --- Format mode ---
	let formatInput = $state('');
	let indent = $state<Indent>('2');
	let formatCollapsed = new SvelteSet<string>();
	let formatCopied = $state(false);
	let formatFileInput: HTMLInputElement | undefined = $state();

	const formatParsed = $derived<ParseResult | null>(
		formatInput.trim() === '' ? null : parseJson(formatInput)
	);
	const formatTree = $derived<DiffNode | null>(
		formatParsed?.ok ? toPlainTree(formatParsed.value) : null
	);
	const formatStats = $derived(formatParsed?.ok ? measure(formatParsed.value) : null);

	function indentString(): string {
		return indent === 'tab' ? '\t' : ' '.repeat(Number(indent));
	}

	function prettify() {
		if (formatParsed?.ok) formatInput = stringifyPretty(formatParsed.value, indentString());
	}

	function minify() {
		if (formatParsed?.ok) formatInput = stringifyMinified(formatParsed.value);
	}

	async function copyFormatted() {
		try {
			await navigator.clipboard.writeText(formatInput);
			formatCopied = true;
			setTimeout(() => (formatCopied = false), 1200);
		} catch {
			// Clipboard access can be denied by the browser; the text stays selectable either way.
		}
	}

	function downloadFormatted() {
		const blob = new Blob([formatInput], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'formatted.json';
		anchor.click();
		URL.revokeObjectURL(url);
	}

	function loadFormatSample() {
		formatInput = SAMPLE_BEFORE;
	}

	function clearFormat() {
		formatInput = '';
		formatCollapsed.clear();
	}

	// --- Diff mode ---
	let leftInput = $state('');
	let rightInput = $state('');
	let diffCollapsed = new SvelteSet<string>();
	let leftFileInput: HTMLInputElement | undefined = $state();
	let rightFileInput: HTMLInputElement | undefined = $state();

	const leftParsed = $derived<ParseResult | null>(
		leftInput.trim() === '' ? null : parseJson(leftInput)
	);
	const rightParsed = $derived<ParseResult | null>(
		rightInput.trim() === '' ? null : parseJson(rightInput)
	);
	const diffTree = $derived<DiffNode | null>(
		leftParsed?.ok && rightParsed?.ok ? diffValues(leftParsed.value, rightParsed.value) : null
	);
	const diffSummary = $derived(diffTree ? summarizeDiff(diffTree) : null);
	const isIdentical = $derived(
		!!diffSummary &&
			diffSummary.added === 0 &&
			diffSummary.removed === 0 &&
			diffSummary.changed === 0
	);

	function swapDiff() {
		[leftInput, rightInput] = [rightInput, leftInput];
	}

	function clearDiff() {
		leftInput = '';
		rightInput = '';
		diffCollapsed.clear();
	}

	function loadDiffSample() {
		leftInput = SAMPLE_BEFORE;
		rightInput = SAMPLE_AFTER;
	}

	// --- Shared: file loading + collapse/expand ---
	async function loadFile(file: File, assign: (text: string) => void) {
		assign(await file.text());
	}

	function onFilePick(event: Event, assign: (text: string) => void) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) loadFile(file, assign);
		target.value = '';
	}

	function onDrop(event: DragEvent, assign: (text: string) => void) {
		event.preventDefault();
		const file = event.dataTransfer?.files?.[0];
		if (file) loadFile(file, assign);
	}

	function collectContainerPaths(node: DiffNode, path: string, out: string[]) {
		if (!node.children || node.children.length === 0) return;
		out.push(path);
		for (const child of node.children) collectContainerPaths(child, `${path}/${child.key}`, out);
	}

	function collapseAll(tree: DiffNode | null, collapsed: SvelteSet<string>) {
		if (!tree) return;
		const paths: string[] = [];
		collectContainerPaths(tree, '', paths);
		collapsed.clear();
		for (const path of paths) collapsed.add(path);
	}
</script>

<svelte:head>
	<title>Sift — format, validate, and diff JSON</title>
	<meta
		name="description"
		content="Pretty-print, validate, and compare JSON entirely in your browser — a collapsible tree view, precise error locations, and a structural diff. Nothing is uploaded."
	/>
</svelte:head>

<div class="page">
	<a class="back" href={resolve('/')}>← all tools</a>

	<header class="intro">
		<h1>Sift</h1>
		<p>
			Paste JSON to format, validate, and explore it as a collapsible tree — or switch to Diff to
			compare two versions structurally, key by key. Everything runs on your device.
		</p>
	</header>

	<div class="mode-toggle" role="group" aria-label="Mode">
		<button class:active={mode === 'format'} onclick={() => (mode = 'format')}>Format</button>
		<button class:active={mode === 'diff'} onclick={() => (mode = 'diff')}>Diff</button>
	</div>

	{#if mode === 'format'}
		<section class="format">
			<div class="panel">
				<div class="panel-header">
					<span>Input</span>
					<div class="panel-actions">
						{#if formatInput.trim() !== ''}
							<button class="link" onclick={clearFormat}>Clear</button>
						{/if}
						<button class="link" onclick={loadFormatSample}>Load sample</button>
						<button class="ghost small" onclick={() => formatFileInput?.click()}>Upload file</button
						>
						<input
							bind:this={formatFileInput}
							type="file"
							accept=".json,application/json,text/plain"
							class="visually-hidden"
							onchange={(e) => onFilePick(e, (text) => (formatInput = text))}
						/>
					</div>
				</div>
				<textarea
					bind:value={formatInput}
					spellcheck="false"
					placeholder="Paste JSON here, or drop a .json file…"
					ondrop={(e) => onDrop(e, (text) => (formatInput = text))}
					ondragover={(e) => e.preventDefault()}></textarea>
			</div>

			{#if formatInput.trim() === ''}
				<p class="hint">Nothing to show yet — paste some JSON above.</p>
			{:else if formatParsed && !formatParsed.ok}
				<div class="error-banner">
					<p>
						<strong>Line {formatParsed.line}, column {formatParsed.column}</strong> — {formatParsed.message}
					</p>
					{#if formatParsed.excerpt}<code>{formatParsed.excerpt}</code>{/if}
				</div>
			{:else if formatTree && formatStats}
				<div class="toolbar">
					<div class="toolbar-group">
						<span class="stats">
							{formatBytes(new TextEncoder().encode(formatInput).length)} · {formatStats.keyCount}
							key{formatStats.keyCount === 1 ? '' : 's'} · depth {formatStats.depth}
						</span>
					</div>
					<div class="toolbar-group">
						<div class="segmented" role="group" aria-label="Indent size">
							<button class:active={indent === '2'} onclick={() => (indent = '2')}>2</button>
							<button class:active={indent === '4'} onclick={() => (indent = '4')}>4</button>
							<button class:active={indent === 'tab'} onclick={() => (indent = 'tab')}>Tab</button>
						</div>
						<button class="ghost small" onclick={prettify}>Prettify</button>
						<button class="ghost small" onclick={minify}>Minify</button>
						<button class="ghost small" onclick={copyFormatted}
							>{formatCopied ? 'Copied!' : 'Copy'}</button
						>
						<button class="ghost small" onclick={downloadFormatted}>Download</button>
					</div>
				</div>

				<div class="tree-header">
					<button class="link" onclick={() => formatCollapsed.clear()}>Expand all</button>
					<button class="link" onclick={() => collapseAll(formatTree, formatCollapsed)}>
						Collapse all
					</button>
				</div>
				<div class="tree-panel">
					<JsonNode node={formatTree} path="" depth={0} collapsed={formatCollapsed} />
				</div>
			{/if}
		</section>
	{:else}
		<section class="diff">
			<div class="editors">
				<div class="panel">
					<div class="panel-header">
						<span>Original</span>
						<div class="panel-actions">
							<button class="ghost small" onclick={() => leftFileInput?.click()}>Upload</button>
							<input
								bind:this={leftFileInput}
								type="file"
								accept=".json,application/json,text/plain"
								class="visually-hidden"
								onchange={(e) => onFilePick(e, (text) => (leftInput = text))}
							/>
						</div>
					</div>
					<textarea
						bind:value={leftInput}
						spellcheck="false"
						placeholder="Paste the original JSON…"
						ondrop={(e) => onDrop(e, (text) => (leftInput = text))}
						ondragover={(e) => e.preventDefault()}></textarea>
					{#if leftParsed && !leftParsed.ok}
						<p class="inline-error">
							Line {leftParsed.line}, column {leftParsed.column} — {leftParsed.message}
						</p>
					{/if}
				</div>

				<div class="editors-middle">
					<button class="icon-button" aria-label="Swap original and modified" onclick={swapDiff}
						>⇄</button
					>
				</div>

				<div class="panel">
					<div class="panel-header">
						<span>Modified</span>
						<div class="panel-actions">
							<button class="ghost small" onclick={() => rightFileInput?.click()}>Upload</button>
							<input
								bind:this={rightFileInput}
								type="file"
								accept=".json,application/json,text/plain"
								class="visually-hidden"
								onchange={(e) => onFilePick(e, (text) => (rightInput = text))}
							/>
						</div>
					</div>
					<textarea
						bind:value={rightInput}
						spellcheck="false"
						placeholder="Paste the modified JSON…"
						ondrop={(e) => onDrop(e, (text) => (rightInput = text))}
						ondragover={(e) => e.preventDefault()}></textarea>
					{#if rightParsed && !rightParsed.ok}
						<p class="inline-error">
							Line {rightParsed.line}, column {rightParsed.column} — {rightParsed.message}
						</p>
					{/if}
				</div>
			</div>

			<div class="diff-actions">
				<button class="link" onclick={loadDiffSample}>Load sample</button>
				<button class="link" onclick={clearDiff}>Clear both</button>
			</div>

			{#if leftInput.trim() === '' || rightInput.trim() === ''}
				<p class="hint">Paste JSON into both sides to compare them.</p>
			{:else if diffTree && diffSummary}
				{#if isIdentical}
					<p class="hint identical">These two are structurally identical.</p>
				{:else}
					<div class="toolbar">
						<div class="toolbar-group">
							<span class="summary-chip added">+{diffSummary.added} added</span>
							<span class="summary-chip removed">−{diffSummary.removed} removed</span>
							<span class="summary-chip changed">~{diffSummary.changed} changed</span>
						</div>
						<div class="toolbar-group">
							<button class="link" onclick={() => diffCollapsed.clear()}>Expand all</button>
							<button class="link" onclick={() => collapseAll(diffTree, diffCollapsed)}>
								Collapse all
							</button>
						</div>
					</div>
					<div class="tree-panel">
						<JsonNode node={diffTree} path="" depth={0} collapsed={diffCollapsed} />
					</div>
				{/if}
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

	.format,
	.diff {
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

	.panel-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	textarea {
		width: 100%;
		min-height: 12rem;
		padding: 0.9rem;
		border: none;
		background: transparent;
		color: var(--text);
		font-family: var(--font-mono);
		font-size: 0.82rem;
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

	.hint.identical {
		color: var(--diff-add);
		font-weight: 600;
	}

	.inline-error {
		margin: 0;
		padding: 0.6rem 0.9rem;
		border-top: 1px solid var(--border);
		font-size: 0.78rem;
		color: var(--accent);
	}

	.error-banner {
		margin-top: 1rem;
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

	.error-banner code {
		display: block;
		margin-top: 0.5rem;
		padding: 0.4rem 0.6rem;
		background: var(--bg);
		border-radius: 8px;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-dim);
		overflow-x: auto;
		white-space: pre;
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 1.25rem;
	}

	.toolbar-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.stats {
		font-size: 0.8rem;
		color: var(--text-dim);
	}

	.segmented {
		display: flex;
		border: 1px solid var(--border);
		border-radius: 999px;
		overflow: hidden;
	}

	.segmented button {
		font: inherit;
		font-size: 0.75rem;
		padding: 0.4rem 0.65rem;
		border: none;
		background: transparent;
		color: var(--text-dim);
		cursor: pointer;
	}

	.segmented button.active {
		background: var(--accent);
		color: var(--accent-text);
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

	button.ghost.small {
		padding: 0.35rem 0.7rem;
		white-space: nowrap;
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

	.tree-header {
		display: flex;
		gap: 1rem;
		margin-top: 1.25rem;
		margin-bottom: 0.4rem;
	}

	.tree-panel {
		padding: 0.75rem 0.25rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 14px;
		overflow-x: auto;
	}

	.summary-chip {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-weight: 600;
		padding: 0.3rem 0.65rem;
		border-radius: 999px;
	}

	.summary-chip.added {
		color: var(--diff-add);
		background: color-mix(in srgb, var(--diff-add) 14%, transparent);
	}

	.summary-chip.removed {
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 14%, transparent);
	}

	.summary-chip.changed {
		color: var(--diff-changed);
		background: color-mix(in srgb, var(--diff-changed) 18%, transparent);
	}

	.editors {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: stretch;
		gap: 0.75rem;
	}

	.editors-middle {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.icon-button {
		width: 2.1rem;
		height: 2.1rem;
		display: grid;
		place-items: center;
		border-radius: 50%;
		border: 1px solid var(--border);
		background: var(--bg-elevated);
		color: var(--text-dim);
		font-size: 1rem;
		cursor: pointer;
	}

	.icon-button:hover {
		color: var(--text);
		border-color: var(--border-strong);
	}

	.diff-actions {
		display: flex;
		gap: 1rem;
		margin-top: 0.6rem;
	}

	@media (max-width: 42rem) {
		.editors {
			grid-template-columns: 1fr;
		}

		.editors-middle {
			padding: 0.25rem 0;
		}

		.icon-button {
			transform: rotate(90deg);
		}
	}
</style>
