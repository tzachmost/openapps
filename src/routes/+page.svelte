<script lang="ts">
	import AppCard from '$lib/components/AppCard.svelte';
	import { apps } from '$lib/apps';
	import { resolve } from '$app/paths';
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

<section class="grid" aria-label="Tools">
	{#each apps as app (app.slug)}
		<AppCard {app} />
	{/each}
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

	.grid {
		max-width: 40rem;
		margin: 0 auto;
		padding: 0 clamp(1.25rem, 4vw, 3rem);
		display: grid;
		gap: 1rem;
	}

	.more {
		max-width: 40rem;
		margin: 1.5rem auto 0;
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
