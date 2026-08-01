<script lang="ts">
	import { resolve } from '$app/paths';
	import AppCard from './AppCard.svelte';
	import { relatedApps } from '$lib/apps';

	let { slug }: { slug: string } = $props();

	const related = $derived(relatedApps(slug));
</script>

<section class="related" aria-label="Related tools">
	<p class="label"># related</p>
	{#if related.length > 0}
		<div class="grid">
			{#each related as app (app.slug)}
				<AppCard {app} />
			{/each}
		</div>
	{:else}
		<a class="fallback" href={resolve('/')}
			>No close relatives here yet &mdash; browse everything &rarr;</a
		>
	{/if}
</section>

<style>
	.related {
		margin-top: 3rem;
		padding-top: 1.5rem;
		border-top: 2px solid var(--border-strong);
	}

	.label {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--accent);
		margin-bottom: 0.6rem;
	}

	.grid {
		border: 2px solid var(--border-strong);
		background: var(--bg-elevated);
	}

	.grid :global(.row:last-child) {
		border-bottom: none;
	}

	.fallback {
		display: inline-block;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--text-dim);
		text-decoration: none;
		transition: color 0.15s ease;
	}

	.fallback:hover {
		color: var(--accent);
	}

	/* Desktop: same row→tile treatment AppCard already gives the landing page's own tag
	   groups, at the same 40rem breakpoint — keeps this footer visually consistent with
	   the hub instead of inventing a second grid convention. */
	@media (min-width: 40rem) {
		.grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
			gap: 0.85rem;
			padding: 1rem;
			border: none;
			background: none;
		}
	}
</style>
