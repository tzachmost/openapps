<script lang="ts">
	import { resolve } from '$app/paths';
	import { renderMarkdown } from '$lib/folio/markdown';
	import { buildStandaloneDocument } from '$lib/folio/document';
	import { SAMPLE } from '$lib/folio/sample';

	let source = $state(SAMPLE);
	let fileInput: HTMLInputElement | undefined = $state();
	let copied = $state(false);

	const html = $derived(renderMarkdown(source));
	const wordCount = $derived(source.trim() === '' ? 0 : source.trim().split(/\s+/).length);

	function titleFromSource(text: string): string {
		const heading = /^#{1,6}[ \t]+(.+)$/m.exec(text);
		return heading ? heading[1].trim() : 'document';
	}

	function slugify(text: string): string {
		const slug = text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/(^-|-$)/g, '');
		return slug || 'document';
	}

	function loadSample() {
		source = SAMPLE;
	}

	function clear() {
		source = '';
	}

	async function loadFile(file: File) {
		source = await file.text();
	}

	function onFilePick(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) loadFile(file);
		target.value = '';
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		const file = event.dataTransfer?.files?.[0];
		if (file) loadFile(file);
	}

	function downloadHtml() {
		const title = titleFromSource(source);
		const doc = buildStandaloneDocument(html, title);
		const blob = new Blob([doc], { type: 'text/html' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `${slugify(title)}.html`;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	function downloadMarkdown() {
		const title = titleFromSource(source);
		const blob = new Blob([source], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `${slugify(title)}.md`;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	async function copyHtml() {
		try {
			await navigator.clipboard.writeText(html);
			copied = true;
			setTimeout(() => (copied = false), 1200);
		} catch {
			// Clipboard access can be denied by the browser; nothing else to do.
		}
	}

	function printDocument() {
		window.print();
	}
</script>

<svelte:head>
	<title>Folio — Markdown, typeset</title>
	<meta
		name="description"
		content="Write Markdown and see it typeset live, then export a standalone HTML file or print straight to PDF. No dependency, no upload — everything runs in your browser."
	/>
</svelte:head>

<div class="page">
	<a class="back" href={resolve('/')}>← all tools</a>

	<header class="intro">
		<h1>Folio</h1>
		<p>
			Write Markdown on the left, watch it typeset on the right. When it's ready, download it as a
			self-contained HTML file or print it straight to PDF — nothing ever leaves your browser.
		</p>
	</header>

	<div class="toolbar">
		<div class="toolbar-group">
			<span class="stats">{wordCount} word{wordCount === 1 ? '' : 's'}</span>
		</div>
		<div class="toolbar-group">
			<button class="link" onclick={loadSample}>Load sample</button>
			<button class="link" onclick={clear}>Clear</button>
			<button class="ghost small" onclick={() => fileInput?.click()}>Upload .md</button>
			<input
				bind:this={fileInput}
				type="file"
				accept=".md,.markdown,text/markdown,text/plain"
				class="visually-hidden"
				onchange={onFilePick}
			/>
			<button class="ghost small" onclick={downloadMarkdown}>Download .md</button>
			<button class="ghost small" onclick={copyHtml}>{copied ? 'Copied!' : 'Copy HTML'}</button>
			<button class="ghost small" onclick={downloadHtml}>Download HTML</button>
			<button class="primary small" onclick={printDocument}>Print / Save as PDF</button>
		</div>
	</div>

	<div class="split">
		<div class="panel editor-panel">
			<div class="panel-header">
				<span>Markdown</span>
			</div>
			<textarea
				bind:value={source}
				spellcheck="false"
				placeholder="Start writing…"
				ondrop={onDrop}
				ondragover={(e) => e.preventDefault()}></textarea>
		</div>

		<div class="panel preview-panel">
			<div class="panel-header">
				<span>Preview</span>
			</div>
			<div class="doc-preview">
				{#if source.trim() === ''}
					<p class="hint">Nothing to preview yet — start writing, or load the sample.</p>
				{:else}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- html is our own renderer's escaped output, never raw source markup -->
					{@html html}
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.page {
		max-width: 72rem;
		margin: 0 auto;
		padding: 0 clamp(1.25rem, 4vw, 3rem) 4rem;
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

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-top: 1.75rem;
		margin-bottom: 1rem;
	}

	.toolbar-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.stats {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-dim);
	}

	.link {
		font: inherit;
		font-size: 0.85rem;
		color: var(--text-dim);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.link:hover {
		color: var(--text);
	}

	.ghost,
	.primary {
		font: inherit;
		font-size: 0.82rem;
		font-weight: 600;
		border-radius: 8px;
		cursor: pointer;
		white-space: nowrap;
	}

	.ghost.small,
	.primary.small {
		padding: 0.4rem 0.75rem;
	}

	.ghost {
		background: var(--bg-elevated);
		color: var(--text);
		border: 1px solid var(--border);
	}

	.ghost:hover {
		border-color: var(--border-strong);
	}

	.primary {
		background: var(--accent);
		color: var(--accent-text);
		border: 1px solid var(--accent);
	}

	.primary:hover {
		filter: brightness(1.06);
	}

	.split {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.25rem;
		align-items: start;
	}

	@media (max-width: 860px) {
		.split {
			grid-template-columns: 1fr;
		}
	}

	.panel {
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--bg-elevated);
		box-shadow: var(--shadow);
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.6rem 0.9rem;
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-dim);
		border-bottom: 1px solid var(--border);
	}

	textarea {
		display: block;
		width: 100%;
		height: 68vh;
		min-height: 24rem;
		padding: 1rem;
		border: none;
		background: transparent;
		color: var(--text);
		font-family: var(--font-mono);
		font-size: 0.88rem;
		line-height: 1.6;
		resize: vertical;
	}

	textarea:focus {
		outline: none;
	}

	.preview-panel {
		max-height: calc(68vh + 2.6rem);
		overflow-y: auto;
	}

	.doc-preview {
		padding: 1.5rem 1.75rem 2rem;
		min-height: 24rem;
	}

	.hint {
		color: var(--text-dim);
		font-size: 0.9rem;
	}

	/* The rendered document arrives as raw HTML via {@html}, so these rules
	   target it globally rather than through Svelte's scoped selectors. */
	.doc-preview :global(h1),
	.doc-preview :global(h2),
	.doc-preview :global(h3),
	.doc-preview :global(h4) {
		line-height: 1.25;
		letter-spacing: -0.01em;
		margin: 1.6em 0 0.5em;
	}

	.doc-preview :global(h1:first-child),
	.doc-preview :global(h2:first-child),
	.doc-preview :global(h3:first-child) {
		margin-top: 0;
	}

	.doc-preview :global(h1) {
		font-size: 1.7rem;
	}
	.doc-preview :global(h2) {
		font-size: 1.35rem;
	}
	.doc-preview :global(h3) {
		font-size: 1.1rem;
	}

	.doc-preview :global(p),
	.doc-preview :global(ul),
	.doc-preview :global(ol),
	.doc-preview :global(blockquote),
	.doc-preview :global(table),
	.doc-preview :global(pre) {
		margin: 0 0 1em;
		line-height: 1.65;
	}

	.doc-preview :global(ul),
	.doc-preview :global(ol) {
		padding-left: 1.3em;
	}

	.doc-preview :global(li) {
		margin: 0.25em 0;
	}

	.doc-preview :global(a) {
		color: var(--accent);
	}

	.doc-preview :global(code) {
		font-family: var(--font-mono);
		font-size: 0.87em;
		background: var(--border);
		padding: 0.15em 0.35em;
		border-radius: 4px;
	}

	.doc-preview :global(pre) {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 1em 1.1em;
		overflow-x: auto;
	}

	.doc-preview :global(pre code) {
		background: none;
		padding: 0;
		font-size: 0.85em;
	}

	.doc-preview :global(blockquote) {
		margin-left: 0;
		padding-left: 1em;
		border-left: 3px solid var(--border-strong);
		color: var(--text-dim);
	}

	.doc-preview :global(hr) {
		border: none;
		border-top: 1px solid var(--border-strong);
		margin: 1.75em 0;
	}

	.doc-preview :global(table) {
		border-collapse: collapse;
		width: 100%;
		font-size: 0.9em;
	}

	.doc-preview :global(th),
	.doc-preview :global(td) {
		border: 1px solid var(--border);
		padding: 0.45em 0.7em;
		text-align: left;
	}

	.doc-preview :global(th) {
		background: var(--border);
	}

	.doc-preview :global(img) {
		max-width: 100%;
		border-radius: 6px;
	}

	@media print {
		/* The page header/footer belong to +layout.svelte, a different
		   component's CSS scope — only a fully :global() selector reaches
		   them from here, unlike the plain-class rules below, which already
		   carry this component's own scope and so only ever match its own
		   markup. !important is needed too: the layout's own unconditional
		   `display: flex` rule has equal specificity and, depending on link
		   order, can otherwise win the cascade over this print-only rule. */
		:global(header),
		:global(footer) {
			display: none !important;
		}
		.back,
		.intro,
		.toolbar,
		.editor-panel,
		.panel-header {
			display: none;
		}
		.page {
			max-width: none;
			padding: 0;
		}
		.split {
			display: block;
		}
		.panel {
			border: none;
			box-shadow: none;
			border-radius: 0;
		}
		.preview-panel {
			max-height: none;
			overflow: visible;
		}
		.doc-preview {
			padding: 0;
			color: #000;
		}
	}
</style>
