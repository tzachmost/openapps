<script lang="ts">
	import AppCard from '$lib/components/AppCard.svelte';
	import { apps } from '$lib/apps';
	import { matchToolsForFile, type FileMatch } from '$lib/fileRouting';
	import { setPendingFile } from '$lib/fileHandoff';

	const tags = ['All', ...new Set(apps.map((app) => app.tag))];

	let activeTag = $state('All');
	let query = $state('');

	const filtered = $derived(
		apps
			.filter((app) => activeTag === 'All' || app.tag === activeTag)
			.filter((app) => {
				const q = query.trim().toLowerCase();
				if (!q) return true;
				return (
					app.name.toLowerCase().includes(q) ||
					app.tagline.toLowerCase().includes(q) ||
					app.description.toLowerCase().includes(q) ||
					app.tag.toLowerCase().includes(q)
				);
			})
	);

	// Grouped by tag, in the order each tag first appears in `apps` — stable, never hand-maintained.
	const grouped = $derived.by(() => {
		const groups = new Map<string, typeof apps>();
		for (const app of filtered) {
			const bucket = groups.get(app.tag);
			if (bucket) bucket.push(app);
			else groups.set(app.tag, [app]);
		}
		return [...groups.entries()];
	});

	// --- file-drop hub: detect a dropped file's type, show only the tools that accept it ---
	let hubFileInput = $state<HTMLInputElement | null>(null);
	let hubDragging = $state(false);
	let hubFile = $state<File | null>(null);
	let hubMatch = $state<FileMatch | null>(null);
	let hubChecked = $state(false);

	function handleFile(file: File) {
		hubFile = file;
		hubMatch = matchToolsForFile(file);
		hubChecked = true;
	}

	function onHubDrop(event: DragEvent) {
		event.preventDefault();
		hubDragging = false;
		const file = event.dataTransfer?.files?.[0];
		if (file) handleFile(file);
	}

	function onHubPick(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (file) handleFile(file);
	}

	function resetHub() {
		hubFile = null;
		hubMatch = null;
		hubChecked = false;
	}
</script>

<svelte:head>
	<title>open apps — small tools that stay in your browser</title>
	<meta
		name="description"
		content="A growing collection of small, private, in-browser tools. No accounts, no uploads, no tracking."
	/>
</svelte:head>

<section class="hero">
	<h1>Small tools. Kept in your browser.</h1>
	<p>
		Everything here runs entirely on your device — no file ever leaves it. One focused tool at a
		time, built to be fast, honest, and a little bit nice to use.
	</p>
</section>

<section class="hub" aria-label="Find a tool for a file">
	<div
		class="dropzone"
		class:dragging={hubDragging}
		ondragover={(e) => {
			e.preventDefault();
			hubDragging = true;
		}}
		ondragleave={() => (hubDragging = false)}
		ondrop={onHubDrop}
		onclick={() => hubFileInput?.click()}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') hubFileInput?.click();
		}}
		role="button"
		tabindex="0"
	>
		<span class="corner corner-tl" aria-hidden="true"></span>
		<span class="corner corner-tr" aria-hidden="true"></span>
		<span class="corner corner-bl" aria-hidden="true"></span>
		<span class="corner corner-br" aria-hidden="true"></span>
		<span class="dropzone-title">Not sure which tool you need?</span>
		<span class="dropzone-hint">
			Drop a file here, or <span class="link">click to choose one</span> — we'll show you what applies.
			Only its name and type are read, never its contents.
		</span>
		<input bind:this={hubFileInput} type="file" onchange={onHubPick} class="visually-hidden" />
	</div>

	{#if hubChecked}
		<div class="hub-result">
			{#if hubMatch}
				<p class="hub-result-heading">
					<strong>{hubFile?.name}</strong> — {hubMatch.category}. These tools work with it:
				</p>
				<div class="hub-listing">
					{#each hubMatch.apps as app (app.slug)}
						<AppCard {app} onclick={() => hubFile && setPendingFile(hubFile)} />
					{/each}
				</div>
			{:else}
				<p class="hub-result-heading">
					Nothing here handles <strong>{hubFile?.name}</strong> yet — none of the current tools accept
					that file type.
				</p>
			{/if}
			<button class="hub-reset" onclick={resetHub}>Try another file</button>
		</div>
	{/if}
</section>

<section class="showcase" aria-label="All tools">
	<div class="controls">
		<label class="prompt-search">
			<span class="prompt-glyph" aria-hidden="true">&gt;</span>
			<input
				type="search"
				placeholder="search tools_"
				bind:value={query}
				aria-label="Search tools"
			/>
		</label>
		<div class="filters" role="group" aria-label="Filter by category">
			{#each tags as tag (tag)}
				<button
					type="button"
					class="filter"
					class:active={tag === activeTag}
					onclick={() => (activeTag = tag)}
				>
					{tag}
				</button>
			{/each}
		</div>
	</div>

	{#if filtered.length === 0}
		<p class="empty">No tools match "{query}".</p>
	{:else}
		<div class="listing">
			<div class="listing-titlebar">
				<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
				<span class="path">~/tools</span>
			</div>
			<div class="listing-body">
				{#each grouped as [tag, toolsInTag] (tag)}
					<div class="group">
						<p class="group-label"># {tag}</p>
						{#each toolsInTag as app (app.slug)}
							<AppCard {app} />
						{/each}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</section>

<p class="more">More tools, slowly.</p>

<style>
	.hero {
		max-width: 40rem;
		margin: 0 auto;
		padding: clamp(2.5rem, 8vw, 5rem) clamp(1.25rem, 4vw, 3rem) clamp(1.75rem, 5vw, 2.5rem);
		text-align: center;
	}

	.hero h1 {
		font-size: clamp(1.6rem, 4.4vw, 2.35rem);
		letter-spacing: 0.01em;
		line-height: 1.25;
	}

	.hero p {
		margin-top: 1rem;
		font-size: 1.02rem;
		line-height: 1.6;
		color: var(--text-dim);
	}

	.hub {
		max-width: 40rem;
		margin: 0 auto clamp(2.5rem, 6vw, 3.5rem);
		padding: 0 clamp(1.25rem, 4vw, 3rem);
	}

	.dropzone {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		border: 2px solid var(--border-strong);
		padding: clamp(1.5rem, 4vw, 2rem);
		text-align: center;
		cursor: pointer;
		background: var(--bg-elevated);
		transition:
			border-color 0.12s ease,
			box-shadow 0.12s ease,
			transform 0.12s ease;
	}

	.dropzone:hover,
	.dropzone:focus-visible {
		box-shadow: var(--shadow-hard);
		transform: translate(-2px, -2px);
	}

	.dropzone.dragging {
		border-color: var(--accent);
		box-shadow: var(--shadow-hard);
		transform: translate(-2px, -2px);
	}

	.corner {
		position: absolute;
		width: 0.9rem;
		height: 0.9rem;
		border-color: var(--accent);
		pointer-events: none;
	}

	.corner-tl {
		top: -2px;
		left: -2px;
		border-top: 3px solid var(--accent);
		border-left: 3px solid var(--accent);
	}

	.corner-tr {
		top: -2px;
		right: -2px;
		border-top: 3px solid var(--accent);
		border-right: 3px solid var(--accent);
	}

	.corner-bl {
		bottom: -2px;
		left: -2px;
		border-bottom: 3px solid var(--accent);
		border-left: 3px solid var(--accent);
	}

	.corner-br {
		bottom: -2px;
		right: -2px;
		border-bottom: 3px solid var(--accent);
		border-right: 3px solid var(--accent);
	}

	.dropzone-title {
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.02em;
		font-weight: 600;
		font-size: 1rem;
	}

	.dropzone-hint {
		font-size: 0.85rem;
		color: var(--text-dim);
		line-height: 1.5;
	}

	.dropzone-hint .link {
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.hub-result {
		margin-top: 1.25rem;
	}

	.hub-result-heading {
		font-size: 0.9rem;
		color: var(--text-dim);
		line-height: 1.5;
	}

	.hub-result-heading strong {
		color: var(--text);
		font-weight: 600;
	}

	.hub-listing {
		margin-top: 0.9rem;
		border: 2px solid var(--border-strong);
		background: var(--bg-elevated);
	}

	.hub-listing :global(.row:last-child) {
		border-bottom: none;
	}

	@media (min-width: 40rem) {
		.hub-listing {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
			gap: 0.75rem;
			padding: 0.75rem;
			border: 2px solid var(--border-strong);
		}
	}

	.hub-reset {
		margin-top: 1rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-dim);
		background: none;
		border: none;
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
		padding: 0;
	}

	.hub-reset:hover {
		color: var(--text);
	}

	.showcase {
		max-width: 52rem;
		margin: 0 auto;
		padding: 0 clamp(1.25rem, 4vw, 3rem);
	}

	/* Room for an actual grid of tiles rather than a column of rows once there's space for it —
	   matches AppCard's own row→tile breakpoint below. */
	@media (min-width: 40rem) {
		.showcase {
			max-width: 54rem;
		}
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}

	.prompt-search {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		min-width: 12rem;
		padding: 0.5rem 0.85rem;
		border: 2px solid var(--border-strong);
		background: var(--bg-elevated);
	}

	.prompt-search:focus-within {
		border-color: var(--accent);
	}

	.prompt-glyph {
		font-family: var(--font-mono);
		color: var(--accent);
		font-weight: 700;
	}

	.prompt-search input {
		flex: 1;
		min-width: 0;
		font: inherit;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		background: none;
		border: none;
		color: var(--text);
	}

	.prompt-search input:focus {
		outline: none;
	}

	.prompt-search input::placeholder {
		color: var(--text-dim);
	}

	.empty {
		padding: 2rem 0;
		text-align: center;
		color: var(--text-dim);
		font-size: 0.9rem;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.filter {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		background: var(--bg-elevated);
		color: var(--text-dim);
		border: 2px solid var(--border-strong);
		padding: 0.4rem 0.7rem;
		cursor: pointer;
		transition:
			color 0.12s ease,
			background-color 0.12s ease;
	}

	.filter:hover {
		color: var(--text);
	}

	.filter.active {
		color: var(--accent-text);
		background: var(--accent);
		border-color: var(--accent);
	}

	.listing {
		border: 2px solid var(--border-strong);
		background: var(--bg-elevated);
		box-shadow: var(--shadow-hard);
	}

	.listing-titlebar {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.55rem 0.9rem;
		border-bottom: 2px solid var(--border-strong);
		background: var(--bg);
	}

	.dots {
		display: inline-flex;
		gap: 0.3rem;
	}

	.dots i {
		display: block;
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: var(--border-strong);
		font-style: normal;
	}

	.path {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-dim);
	}

	.group-label {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--accent);
		padding: 0.7rem 1.1rem 0.35rem;
	}

	.listing-body :global(.row:last-child) {
		border-bottom: none;
	}

	/* Desktop: each tag group becomes a row of app tiles instead of a stack of list rows — see
	   AppCard's own row→tile breakpoint (same 40rem threshold), which already gives each tile
	   a complete border on all sides, so nothing needs restoring here. */
	@media (min-width: 40rem) {
		.group {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
			gap: 0.85rem;
			padding: 0.5rem 1rem 1.25rem;
		}

		.group-label {
			grid-column: 1 / -1;
			padding: 0.7rem 0 0.15rem;
		}
	}

	.more {
		max-width: 40rem;
		margin: 2rem auto 0;
		padding: 0 clamp(1.25rem, 4vw, 3rem) clamp(3rem, 8vw, 5rem);
		text-align: center;
		font-size: 0.85rem;
		color: var(--text-dim);
	}
</style>
