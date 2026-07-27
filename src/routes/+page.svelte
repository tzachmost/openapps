<script lang="ts">
	import AppCard from '$lib/components/AppCard.svelte';
	import { apps } from '$lib/apps';
	import { resolve } from '$app/paths';

	const tags = ['All', ...new Set(apps.map((app) => app.tag))];

	let activeTag = $state('All');

	const filtered = $derived(
		activeTag === 'All' ? apps : apps.filter((app) => app.tag === activeTag)
	);
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

<section class="showcase" aria-label="Tools">
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

	<div class="grid">
		{#each filtered as app, i (app.slug)}
			<AppCard {app} wide={activeTag === 'All' ? i % 3 === 0 : true} />
		{/each}
	</div>
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

	.showcase {
		max-width: 64rem;
		margin: 0 auto;
		padding: 0 clamp(1.25rem, 4vw, 3rem);
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1.25rem;
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
