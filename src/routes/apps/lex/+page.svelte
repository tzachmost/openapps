<script lang="ts">
	import ToolHeader from '$lib/components/ToolHeader.svelte';
	import RelatedTools from '$lib/components/RelatedTools.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import Button from '$lib/components/Button.svelte';
	import {
		FLAG_ORDER,
		FLAG_INFO,
		type FlagKey,
		buildFlagsString,
		checkPattern,
		findMatches,
		buildSegments,
		replaceAll
	} from '$lib/lex/regex';
	import { REFERENCE } from '$lib/lex/reference';
	import { SAMPLE_PATTERN, SAMPLE_FLAGS, SAMPLE_TEXT, SAMPLE_REPLACEMENT } from '$lib/lex/samples';

	type Mode = 'test' | 'replace';

	let pattern = $state('');
	let flags = $state<Record<FlagKey, boolean>>({
		g: true,
		i: false,
		m: false,
		s: false,
		u: false,
		y: false
	});
	let testText = $state('');
	let mode = $state<Mode>('test');
	let replacement = $state('');
	let resultCopied = $state(false);
	let testFileInput: HTMLInputElement | undefined = $state();

	const flagsString = $derived(buildFlagsString(flags));
	const compiled = $derived(pattern === '' ? null : checkPattern(pattern, flagsString));
	const matchData = $derived(
		compiled?.ok && testText !== '' ? findMatches(pattern, flagsString, testText) : null
	);
	const segments = $derived(matchData ? buildSegments(testText, matchData.matches) : null);
	const replacedText = $derived(
		mode === 'replace' && compiled?.ok && testText !== ''
			? replaceAll(pattern, flagsString, testText, replacement)
			: ''
	);

	const GROUP_COLORS = ['--m0', '--m1', '--m2', '--m3', '--m4', '--m5'];
	function colorVar(i: number): string {
		return GROUP_COLORS[i % GROUP_COLORS.length];
	}

	function toggleFlag(key: FlagKey) {
		flags[key] = !flags[key];
	}

	function loadSample() {
		pattern = SAMPLE_PATTERN;
		flags = { ...SAMPLE_FLAGS };
		testText = SAMPLE_TEXT;
		replacement = SAMPLE_REPLACEMENT;
		mode = 'test';
	}

	function clearAll() {
		pattern = '';
		testText = '';
		replacement = '';
	}

	async function loadTestFile(file: File) {
		testText = await file.text();
	}

	function onFilePick(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) loadTestFile(file);
		target.value = '';
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		const file = event.dataTransfer?.files?.[0];
		if (file) loadTestFile(file);
	}

	async function copyResult() {
		try {
			await navigator.clipboard.writeText(replacedText);
			resultCopied = true;
			setTimeout(() => (resultCopied = false), 1200);
		} catch {
			// Clipboard access can be denied by the browser; the text is still selectable on screen.
		}
	}

	function downloadResult() {
		const blob = new Blob([replacedText], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'lex-result.txt';
		anchor.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head>
	<title>Lex — test and build regular expressions</title>
	<meta
		name="description"
		content="Write a pattern, paste a test string, and see every match highlighted live — capture groups, named groups, and a Replace mode with $1/$<name> substitution. Runs on your browser's own regex engine, nothing leaves your device."
	/>
</svelte:head>

<div class="page">
	<ToolHeader title="Lex">
		Write a pattern and see it match live against your own text — full and capture groups broken out
		per match, plus a Replace mode with real substitution. Runs on your browser's own regex engine;
		nothing is ever sent anywhere.
	</ToolHeader>

	<section class="pattern-section">
		<div class="pattern-bar">
			<div class="pattern-field" class:invalid={compiled?.ok === false}>
				<span class="delim">/</span>
				<input
					bind:value={pattern}
					aria-label="Regular expression pattern"
					spellcheck="false"
					placeholder="e.g. [\w.+-]+@[\w-]+\.\w+"
				/>
				<span class="delim">/</span>
				<span class="flags-display">{flagsString}</span>
			</div>
			<div class="flag-toggles" role="group" aria-label="Regex flags">
				{#each FLAG_ORDER as f (f)}
					<Button
						variant={flags[f] ? 'primary' : 'ghost'}
						size="small"
						title={FLAG_INFO[f]}
						aria-pressed={flags[f]}
						onclick={() => toggleFlag(f)}
					>
						{f}
					</Button>
				{/each}
			</div>
		</div>
		<p class="caution">
			Runs directly in your browser's own regex engine — a pathological pattern (nested quantifiers,
			catastrophic backtracking) can still freeze the tab, same as it would in any code that used
			it.
		</p>
	</section>

	{#if compiled && !compiled.ok}
		<div class="error-banner">
			<p><strong>Invalid pattern.</strong> {compiled.error}</p>
		</div>
	{/if}

	<section class="test-section">
		<div class="panel">
			<div class="panel-header">
				<span>Test string</span>
				<div class="panel-actions">
					<Segmented
						compact
						label="Mode"
						bind:value={mode}
						options={[
							{ value: 'test', label: 'Test' },
							{ value: 'replace', label: 'Replace' }
						]}
					/>
					<Button variant="ghost" size="small" onclick={() => testFileInput?.click()}>Upload</Button
					>
					<input
						bind:this={testFileInput}
						type="file"
						accept="text/*,.txt,.log,.csv,.json,.md"
						class="visually-hidden"
						onchange={onFilePick}
					/>
				</div>
			</div>
			<textarea
				bind:value={testText}
				spellcheck="false"
				placeholder="Paste or drop text to test your pattern against…"
				ondrop={onDrop}
				ondragover={(e) => e.preventDefault()}></textarea>
		</div>

		<div class="editors-actions">
			<Button variant="ghost" size="small" onclick={loadSample}>Load sample</Button>
			<Button variant="ghost" size="small" onclick={clearAll}>Clear</Button>
		</div>
	</section>

	{#if testText === ''}
		<p class="hint">Paste some text above to see matches highlighted live.</p>
	{:else if pattern === ''}
		<p class="hint">Enter a pattern to start matching.</p>
	{:else if matchData && segments}
		{#if mode === 'test'}
			{#if matchData.matches.length === 0}
				<p class="hint">No matches in the test string.</p>
			{:else}
				<div class="results-toolbar">
					<span class="summary-chip"
						>{matchData.matches.length} match{matchData.matches.length === 1 ? '' : 'es'}</span
					>
					{#if matchData.truncated}
						<span class="summary-chip truncated"
							>showing the first {matchData.matches.length.toLocaleString()}</span
						>
					{/if}
				</div>

				<div class="highlighted-panel">
					<div class="highlighted">
						{#each segments as seg, i (i)}
							{#if seg.matchIndex === null}{seg.text}{:else if seg.text === ''}<mark
									class="match zero"
									style="--mc: var({colorVar(seg.matchIndex)})"
									title="zero-length match"
								></mark>{:else}<mark class="match" style="--mc: var({colorVar(seg.matchIndex)})"
									>{seg.text}</mark
								>{/if}
						{/each}
					</div>
				</div>

				<div class="matches-list">
					{#each matchData.matches as m, i (i)}
						<div class="match-row">
							<span class="match-badge" style="--mc: var({colorVar(i)})">#{i + 1}</span>
							<div class="match-body">
								<div class="match-meta">
									<code class="match-text">{m.match === '' ? '(empty match)' : m.match}</code>
									<span class="match-at">at index {m.index}</span>
								</div>
								{#if m.groups.length > 0}
									<div class="groups">
										{#each m.groups as g, gi (gi)}
											<span class="group-chip"><b>{gi + 1}</b> {g ?? '—'}</span>
										{/each}
									</div>
								{/if}
								{#if m.named}
									<div class="groups">
										{#each Object.entries(m.named) as [name, val] (name)}
											<span class="group-chip"><b>{name}</b> {val ?? '—'}</span>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{:else}
			<div class="replace-panel">
				<label class="field-label" for="replacement">Replacement</label>
				<input
					id="replacement"
					bind:value={replacement}
					spellcheck="false"
					placeholder="e.g. $1, $<name>, or plain text"
				/>
				<p class="hint small">
					<code>$1</code>, <code>$2</code>… for numbered groups, <code>$&lt;name&gt;</code> for
					named ones, <code>$&amp;</code> for the whole match, <code>$$</code> for a literal $.
				</p>
			</div>

			<div class="panel result-panel">
				<div class="panel-header">
					<span>Result</span>
					<div class="panel-actions">
						<Button variant="ghost" size="small" onclick={copyResult}>
							{resultCopied ? 'Copied!' : 'Copy'}
						</Button>
						<Button variant="ghost" size="small" onclick={downloadResult}>Download</Button>
					</div>
				</div>
				<pre class="result-text">{replacedText}</pre>
			</div>
		{/if}
	{/if}

	<details class="reference">
		<summary>Quick reference</summary>
		<div class="reference-body">
			{#each REFERENCE as group (group.title)}
				<div class="ref-group">
					<h3>{group.title}</h3>
					<div class="table-scroll">
						<table>
							<tbody>
								{#each group.rows as row (row.token)}
									<tr>
										<td class="token"><code>{row.token}</code></td>
										<td class="meaning">{row.meaning}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/each}
		</div>
	</details>

	<RelatedTools slug="lex" />
</div>

<style>
	.page {
		max-width: 62rem;
		margin: 0 auto;
		padding: 0 clamp(1.25rem, 4vw, 3rem) 4rem;
		--m0: #2f6fb9;
		--m1: #2f8f5b;
		--m2: #7c5cd6;
		--m3: #b9852a;
		--m4: #1f8f83;
		--m5: #c04570;
	}

	@media (prefers-color-scheme: dark) {
		.page {
			--m0: #6fa8f0;
			--m1: #4bb87e;
			--m2: #ab8ff2;
			--m3: #d9a63d;
			--m4: #4bc9bd;
			--m5: #f27fac;
		}
	}

	.pattern-section {
		margin-top: 1.5rem;
	}

	.pattern-bar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.pattern-field {
		flex: 1 1 18rem;
		display: flex;
		align-items: center;
		gap: 0.15rem;
		background: var(--bg-elevated);
		border: 2px solid var(--border-strong);
		border-radius: 4px;
		padding: 0.5rem 0.85rem;
	}

	.pattern-field.invalid {
		border-color: var(--accent);
	}

	.delim {
		font-family: var(--font-mono);
		color: var(--text-dim);
		font-size: 1.05rem;
		user-select: none;
	}

	.pattern-field input {
		flex: 1;
		min-width: 0;
		border: none;
		background: transparent;
		color: var(--text);
		font-family: var(--font-mono);
		font-size: 0.95rem;
		padding: 0.15rem 0.4rem;
	}

	.pattern-field input:focus {
		outline: none;
	}

	.flags-display {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--accent);
		min-width: 1.2em;
	}

	.flag-toggles {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.caution {
		margin-top: 0.6rem;
		font-size: 0.76rem;
		color: var(--text-dim);
		max-width: 46rem;
		line-height: 1.5;
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

	.test-section {
		margin-top: 1.25rem;
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
		flex-wrap: wrap;
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
		gap: 0.6rem;
		flex-wrap: wrap;
	}

	textarea {
		width: 100%;
		min-height: 9rem;
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

	.editors-actions {
		display: flex;
		gap: 1rem;
		margin-top: 0.6rem;
	}

	.hint {
		margin-top: 1.25rem;
		font-size: 0.85rem;
		color: var(--text-dim);
	}

	.hint.small {
		margin-top: 0.5rem;
		font-size: 0.76rem;
	}

	.hint.small code {
		font-family: var(--font-mono);
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 3px;
		padding: 0.05em 0.3em;
	}

	.results-toolbar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 1.25rem;
	}

	.summary-chip {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-weight: 600;
		padding: 0.3rem 0.65rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--accent) 14%, transparent);
		color: var(--accent);
	}

	.summary-chip.truncated {
		background: color-mix(in srgb, var(--text-dim) 16%, transparent);
		color: var(--text-dim);
	}

	.highlighted-panel {
		margin-top: 0.75rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 0.9rem;
		overflow-x: auto;
	}

	.highlighted {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-word;
	}

	mark.match {
		background: color-mix(in srgb, var(--mc) 35%, transparent);
		border-bottom: 2px solid var(--mc);
		color: inherit;
		border-radius: 2px;
		padding: 0 1px;
	}

	mark.match.zero {
		display: inline-block;
		width: 2px;
		height: 1em;
		vertical-align: middle;
		background: var(--mc);
		border-radius: 1px;
	}

	.matches-list {
		margin-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.match-row {
		display: flex;
		gap: 0.75rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 0.65rem 0.85rem;
	}

	.match-badge {
		flex: none;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--mc);
		padding-top: 0.15rem;
	}

	.match-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.match-meta {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
	}

	.match-text {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		background: color-mix(in srgb, var(--text-dim) 10%, transparent);
		border-radius: 3px;
		padding: 0.1em 0.4em;
		word-break: break-word;
	}

	.match-at {
		font-size: 0.74rem;
		color: var(--text-dim);
	}

	.groups {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.group-chip {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--text-dim);
		background: color-mix(in srgb, var(--text-dim) 8%, transparent);
		border-radius: 999px;
		padding: 0.2rem 0.6rem;
	}

	.group-chip b {
		color: var(--text);
		margin-right: 0.35em;
	}

	.replace-panel {
		margin-top: 1.25rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 0.9rem;
	}

	.field-label {
		display: block;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-dim);
		margin-bottom: 0.5rem;
	}

	.replace-panel input {
		width: 100%;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg);
		color: var(--text);
		font-family: var(--font-mono);
		font-size: 0.85rem;
		padding: 0.55rem 0.7rem;
	}

	.replace-panel input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.result-panel {
		margin-top: 0.75rem;
	}

	.result-text {
		margin: 0;
		padding: 0.9rem;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.reference {
		margin-top: 2rem;
		border: 2px solid var(--border-strong);
		background: var(--bg-elevated);
		border-radius: 4px;
	}

	.reference summary {
		cursor: pointer;
		padding: 0.85rem 1.1rem;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-dim);
	}

	.reference[open] summary {
		border-bottom: 1px solid var(--border);
		color: var(--text);
	}

	.reference-body {
		padding: 1.1rem;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: 1.25rem;
	}

	.ref-group h3 {
		font-size: 0.78rem;
		color: var(--text-dim);
		margin-bottom: 0.5rem;
	}

	.table-scroll {
		overflow-x: auto;
	}

	.ref-group table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8rem;
	}

	.ref-group td {
		padding: 0.3rem 0.5rem 0.3rem 0;
		vertical-align: top;
	}

	.ref-group .token {
		white-space: nowrap;
		font-family: var(--font-mono);
		color: var(--accent);
	}

	.ref-group .meaning {
		color: var(--text-dim);
	}

	@media (max-width: 30rem) {
		.pattern-bar {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
