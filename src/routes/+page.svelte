<script lang="ts">
	import AppCard from '$lib/components/AppCard.svelte';
	import { apps } from '$lib/apps';
	import { resolve } from '$app/paths';
	import { matchToolsForFile, type FileMatch } from '$lib/fileRouting';

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

	const isCurated = $derived(activeTag !== 'All' || query.trim() !== '');

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
				<div class="hub-grid">
					{#each hubMatch.apps as app (app.slug)}
						<AppCard {app} />
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
		<input
			class="search"
			type="search"
			placeholder="Search tools…"
			bind:value={query}
			aria-label="Search tools"
		/>
	</div>

	{#if filtered.length === 0}
		<p class="empty">No tools match "{query}".</p>
	{:else}
		<div class="grid">
			{#each filtered as app, i (app.slug)}
				<AppCard {app} wide={isCurated ? true : i % 3 === 0} />
			{/each}
		</div>
	{/if}
</section>

<p class="more">
	More tools, slowly. Occasionally, <a href={resolve('/writing')}>some writing</a>.
</p>

<style>
	.hero {
		max-width: 40rem;
		margin: 0 auto;
		padding: clamp(2.5rem, 8vw, 5.5rem) clamp(1.25rem, 4vw, 3rem) clamp(2rem, 6vw, 3rem);
		text-align: center;
	}

	.hero h1 {
		font-size: clamp(2rem, 5vw, 2.75rem);
		letter-spacing: -0.02em;
		line-height: 1.1;
	}

	.hero p {
		margin-top: 1rem;
		font-size: 1.05rem;
		line-height: 1.6;
		color: var(--text-dim);
	}

	.hub {
		max-width: 40rem;
		margin: 0 auto clamp(2.5rem, 6vw, 3.5rem);
		padding: 0 clamp(1.25rem, 4vw, 3rem);
	}

	.dropzone {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		border: 1.5px dashed var(--border-strong);
		border-radius: 16px;
		padding: clamp(1.5rem, 4vw, 2rem);
		text-align: center;
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			background-color 0.15s ease;
	}

	.dropzone.dragging {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 6%, transparent);
	}

	.dropzone-title {
		font-weight: 600;
		font-size: 1.02rem;
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

	.hub-grid {
		margin-top: 0.9rem;
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
	}

	.hub-reset {
		margin-top: 1rem;
		font: inherit;
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

	@media (max-width: 30rem) {
		.hub-grid {
			grid-template-columns: 1fr;
		}
	}

	.showcase {
		max-width: 64rem;
		margin: 0 auto;
		padding: 0 clamp(1.25rem, 4vw, 3rem);
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}

	.search {
		font: inherit;
		font-size: 0.85rem;
		padding: 0.45rem 0.85rem;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: var(--bg-elevated);
		color: var(--text);
		min-width: 12rem;
	}

	.search:focus {
		outline: none;
		border-color: var(--accent);
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
		gap: 0.5rem;
	}

	.filter {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		background: none;
		color: var(--text-dim);
		border: 1px solid var(--border);
		padding: 0.4rem 0.85rem;
		border-radius: 999px;
		cursor: pointer;
		transition:
			color 0.15s ease,
			border-color 0.15s ease,
			background-color 0.15s ease;
	}

	.filter:hover {
		color: var(--text);
		border-color: var(--border-strong);
	}

	.filter.active {
		color: var(--accent-text);
		background: var(--accent);
		border-color: var(--accent);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
	}

	.grid :global(.card.wide) {
		grid-column: span 3;
	}

	@media (max-width: 48rem) {
		.grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.grid :global(.card.wide) {
			grid-column: span 2;
		}
	}

	@media (max-width: 32rem) {
		.grid {
			grid-template-columns: 1fr;
		}

		.grid :global(.card.wide) {
			grid-column: span 1;
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

	.more a {
		color: var(--text-dim);
		text-decoration-color: var(--accent);
		text-underline-offset: 3px;
	}

	.more a:hover {
		color: var(--text);
	}
</style>
