<script lang="ts">
	import { resolve } from '$app/paths';
	import { takePendingFile } from '$lib/fileHandoff';
	import { diffLines, wordDiff, type WordSpan } from '$lib/delta/text';
	import { MAX_LINES, splitLines } from '$lib/delta/text';
	import { buildRows, summarizeRows, type Row } from '$lib/delta/rows';
	import { buildUnifiedDiff, endsWithNewline } from '$lib/delta/patch';
	import { SAMPLE_BEFORE, SAMPLE_AFTER } from '$lib/delta/samples';

	type ViewMode = 'split' | 'unified';

	let leftInput = $state('');
	let rightInput = $state('');
	let viewMode = $state<ViewMode>('split');
	let ignoreWhitespace = $state(false);
	let ignoreCase = $state(false);
	let leftFileInput: HTMLInputElement | undefined = $state();
	let rightFileInput: HTMLInputElement | undefined = $state();
	let patchCopied = $state(false);

	const leftLineCount = $derived(leftInput === '' ? 0 : splitLines(leftInput).length);
	const rightLineCount = $derived(rightInput === '' ? 0 : splitLines(rightInput).length);
	const tooLarge = $derived(leftLineCount > MAX_LINES || rightLineCount > MAX_LINES);

	const ops = $derived(
		leftInput === '' || rightInput === '' || tooLarge
			? null
			: diffLines(leftInput, rightInput, { ignoreWhitespace, ignoreCase })
	);
	const rows = $derived<Row[] | null>(ops ? buildRows(ops) : null);
	const stats = $derived(rows ? summarizeRows(rows) : null);
	const isIdentical = $derived(
		!!stats && stats.added === 0 && stats.removed === 0 && stats.changed === 0
	);
	const patchText = $derived(
		ops
			? buildUnifiedDiff(
					ops,
					'original',
					'modified',
					3,
					endsWithNewline(leftInput),
					endsWithNewline(rightInput)
				)
			: ''
	);

	function swap() {
		[leftInput, rightInput] = [rightInput, leftInput];
	}

	function clearBoth() {
		leftInput = '';
		rightInput = '';
	}

	function loadSample() {
		leftInput = SAMPLE_BEFORE;
		rightInput = SAMPLE_AFTER;
	}

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

	async function copyPatch() {
		try {
			await navigator.clipboard.writeText(patchText);
			patchCopied = true;
			setTimeout(() => (patchCopied = false), 1200);
		} catch {
			// Clipboard access can be denied by the browser; the text stays selectable in a download either way.
		}
	}

	function downloadPatch() {
		const blob = new Blob([patchText], { type: 'text/x-patch' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'delta.patch';
		anchor.click();
		URL.revokeObjectURL(url);
	}

	// Landing page's file-drop hub hands off a file here instead of asking for a second drop —
	// lands in the "before" side, the natural default for a single file.
	const handoffFile = takePendingFile();
	if (handoffFile) loadFile(handoffFile, (text) => (leftInput = text));
</script>

{#snippet spans(items: WordSpan[], variant: 'removed' | 'added')}
	{#each items as span, i (i)}{#if span.changed}<mark class={variant}>{span.text}</mark
			>{:else}{span.text}{/if}{/each}
{/snippet}

<svelte:head>
	<title>Delta — compare two versions of any text</title>
	<meta
		name="description"
		content="Paste or drop two versions of any text or code and Delta shows a real line-by-line diff — word-level highlights on changed lines, split or unified view, exportable as a standard .patch file. Nothing leaves your browser."
	/>
</svelte:head>

<div class="page">
	<a class="back" href={resolve('/')}>← all tools</a>

	<header class="intro">
		<h1>Delta</h1>
		<p>
			Paste or drop two versions of any text — code, config, prose — and Delta computes a real
			line-by-line diff (Myers' algorithm, not a naive comparison) with word-level highlights on
			changed lines. Runs entirely on your device.
		</p>
	</header>

	<section class="editors-section">
		<div class="editors">
			<div class="panel">
				<div class="panel-header">
					<span>Original</span>
					<div class="panel-actions">
						<button class="ghost small" onclick={() => leftFileInput?.click()}>Upload</button>
						<input
							bind:this={leftFileInput}
							type="file"
							accept="text/*,.txt,.md,.json,.js,.ts,.css,.html,.py,.yml,.yaml"
							class="visually-hidden"
							onchange={(e) => onFilePick(e, (text) => (leftInput = text))}
						/>
					</div>
				</div>
				<textarea
					bind:value={leftInput}
					spellcheck="false"
					placeholder="Paste the original text…"
					ondrop={(e) => onDrop(e, (text) => (leftInput = text))}
					ondragover={(e) => e.preventDefault()}></textarea>
			</div>

			<div class="editors-middle">
				<button class="icon-button" aria-label="Swap original and modified" onclick={swap}>⇄</button
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
							accept="text/*,.txt,.md,.json,.js,.ts,.css,.html,.py,.yml,.yaml"
							class="visually-hidden"
							onchange={(e) => onFilePick(e, (text) => (rightInput = text))}
						/>
					</div>
				</div>
				<textarea
					bind:value={rightInput}
					spellcheck="false"
					placeholder="Paste the modified text…"
					ondrop={(e) => onDrop(e, (text) => (rightInput = text))}
					ondragover={(e) => e.preventDefault()}></textarea>
			</div>
		</div>

		<div class="diff-actions">
			<button class="link" onclick={loadSample}>Load sample</button>
			<button class="link" onclick={clearBoth}>Clear both</button>
		</div>
	</section>

	{#if leftInput.trim() === '' || rightInput.trim() === ''}
		<p class="hint">Paste text into both sides to compare them.</p>
	{:else if tooLarge}
		<div class="error-banner">
			<p>
				<strong>Too large to diff safely in the browser.</strong> Delta compares up to {MAX_LINES.toLocaleString()}
				lines per side — this input has {Math.max(leftLineCount, rightLineCount).toLocaleString()}.
			</p>
		</div>
	{:else if rows && stats}
		{#if isIdentical}
			<p class="hint identical">These two are identical, line for line.</p>
		{:else}
			<div class="toolbar">
				<div class="toolbar-group">
					<span class="summary-chip added">+{stats.added} added</span>
					<span class="summary-chip removed">−{stats.removed} removed</span>
					<span class="summary-chip changed">~{stats.changed} changed</span>
				</div>
				<div class="toolbar-group">
					<div class="segmented" role="group" aria-label="View">
						<button class:active={viewMode === 'split'} onclick={() => (viewMode = 'split')}
							>Split</button
						>
						<button class:active={viewMode === 'unified'} onclick={() => (viewMode = 'unified')}
							>Unified</button
						>
					</div>
					<div class="segmented" role="group" aria-label="Comparison options">
						<button
							class:active={ignoreWhitespace}
							onclick={() => (ignoreWhitespace = !ignoreWhitespace)}>Ignore whitespace</button
						>
						<button class:active={ignoreCase} onclick={() => (ignoreCase = !ignoreCase)}
							>Ignore case</button
						>
					</div>
				</div>
			</div>

			<div class="diff-panel">
				{#if viewMode === 'split'}
					<div class="split-table">
						{#each rows as row, i (i)}
							{#if row.kind === 'equal'}
								<div class="grid-row equal">
									<div class="num">{row.oldLine}</div>
									<div class="content">{row.text}</div>
									<div class="num">{row.newLine}</div>
									<div class="content">{row.text}</div>
								</div>
							{:else if row.kind === 'delete'}
								<div class="grid-row delete">
									<div class="num">{row.oldLine}</div>
									<div class="content removed">{row.text}</div>
									<div class="num empty"></div>
									<div class="content empty"></div>
								</div>
							{:else if row.kind === 'insert'}
								<div class="grid-row insert">
									<div class="num empty"></div>
									<div class="content empty"></div>
									<div class="num">{row.newLine}</div>
									<div class="content added">{row.text}</div>
								</div>
							{:else}
								{@const words = wordDiff(row.oldText, row.newText)}
								<div class="grid-row replace">
									<div class="num">{row.oldLine}</div>
									<div class="content removed">{@render spans(words.oldSpans, 'removed')}</div>
									<div class="num">{row.newLine}</div>
									<div class="content added">{@render spans(words.newSpans, 'added')}</div>
								</div>
							{/if}
						{/each}
					</div>
				{:else}
					<div class="unified-table">
						{#each rows as row, i (i)}
							{#if row.kind === 'equal'}
								<div class="grid-row equal">
									<div class="num">{row.oldLine}</div>
									<div class="num">{row.newLine}</div>
									<div class="marker"></div>
									<div class="content">{row.text}</div>
								</div>
							{:else if row.kind === 'delete'}
								<div class="grid-row delete">
									<div class="num">{row.oldLine}</div>
									<div class="num"></div>
									<div class="marker">−</div>
									<div class="content removed">{row.text}</div>
								</div>
							{:else if row.kind === 'insert'}
								<div class="grid-row insert">
									<div class="num"></div>
									<div class="num">{row.newLine}</div>
									<div class="marker">+</div>
									<div class="content added">{row.text}</div>
								</div>
							{:else}
								{@const words = wordDiff(row.oldText, row.newText)}
								<div class="grid-row delete">
									<div class="num">{row.oldLine}</div>
									<div class="num"></div>
									<div class="marker">−</div>
									<div class="content removed">{@render spans(words.oldSpans, 'removed')}</div>
								</div>
								<div class="grid-row insert">
									<div class="num"></div>
									<div class="num">{row.newLine}</div>
									<div class="marker">+</div>
									<div class="content added">{@render spans(words.newSpans, 'added')}</div>
								</div>
							{/if}
						{/each}
					</div>
				{/if}
			</div>

			<div class="patch-actions">
				<span class="patch-label">Unified diff</span>
				<button class="ghost small" onclick={copyPatch}>{patchCopied ? 'Copied!' : 'Copy'}</button>
				<button class="ghost small" onclick={downloadPatch}>Download .patch</button>
			</div>
		{/if}
	{/if}
</div>

<style>
	.page {
		max-width: 62rem;
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

	.editors-section {
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

	.hint {
		margin-top: 1.25rem;
		font-size: 0.85rem;
		color: var(--text-dim);
	}

	.hint.identical {
		color: var(--diff-add);
		font-weight: 600;
	}

	.error-banner {
		margin-top: 1.25rem;
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
		white-space: nowrap;
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

	.diff-panel {
		margin-top: 1rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 14px;
		overflow-x: auto;
	}

	.split-table,
	.unified-table {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		line-height: 1.55;
	}

	.split-table {
		min-width: 42rem;
	}

	.unified-table {
		min-width: 28rem;
	}

	.split-table .grid-row {
		display: grid;
		grid-template-columns: 3rem 1fr 3rem 1fr;
	}

	.unified-table .grid-row {
		display: grid;
		grid-template-columns: 3rem 3rem 1.25rem 1fr;
	}

	.num {
		padding: 0.15rem 0.6rem;
		text-align: right;
		color: var(--text-dim);
		user-select: none;
		border-right: 1px solid var(--border);
	}

	.marker {
		padding: 0.15rem 0.2rem;
		text-align: center;
		color: var(--text-dim);
		user-select: none;
	}

	.content {
		padding: 0.15rem 0.75rem;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.content.empty,
	.num.empty {
		background: color-mix(in srgb, var(--text-dim) 6%, transparent);
	}

	.grid-row.delete .content.removed,
	.grid-row.replace .content.removed {
		background: color-mix(in srgb, var(--accent) 10%, transparent);
	}

	.grid-row.insert .content.added,
	.grid-row.replace .content.added {
		background: color-mix(in srgb, var(--diff-add) 12%, transparent);
	}

	.unified-table .grid-row.delete .num,
	.unified-table .grid-row.delete .marker {
		background: color-mix(in srgb, var(--accent) 10%, transparent);
	}

	.unified-table .grid-row.insert .num,
	.unified-table .grid-row.insert .marker {
		background: color-mix(in srgb, var(--diff-add) 12%, transparent);
	}

	mark.removed {
		background: color-mix(in srgb, var(--accent) 38%, transparent);
		color: inherit;
		border-radius: 3px;
	}

	mark.added {
		background: color-mix(in srgb, var(--diff-add) 40%, transparent);
		color: inherit;
		border-radius: 3px;
	}

	.patch-actions {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-top: 1rem;
	}

	.patch-label {
		font-size: 0.78rem;
		color: var(--text-dim);
		margin-right: 0.2rem;
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
