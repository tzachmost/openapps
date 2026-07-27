<script lang="ts">
	import { base } from '$app/paths';
	import type { AppMeta } from '$lib/apps';

	let { app, wide = false }: { app: AppMeta; wide?: boolean } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- built from the apps manifest, not a static route literal -->
<a class="card" class:wide href="{base}/apps/{app.slug}">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- app.icon is authored in-repo, not user input -->
	<div class="icon" aria-hidden="true">{@html app.icon}</div>
	<div class="body">
		<div class="heading">
			<h3>{app.name}</h3>
			<span class="tag">{app.tag}</span>
		</div>
		<p>{wide ? app.description : app.tagline}</p>
	</div>
	<span class="arrow" aria-hidden="true">→</span>
</a>

<style>
	.card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.9rem;
		padding: 1.5rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 16px;
		text-decoration: none;
		color: var(--text);
		box-shadow: var(--shadow);
		transition:
			transform 0.18s ease,
			border-color 0.18s ease;
	}

	.card.wide {
		flex-direction: row;
		align-items: flex-start;
		gap: 1.1rem;
		padding: 1.75rem;
	}

	.card:hover {
		transform: translateY(-2px);
		border-color: var(--border-strong);
	}

	.card:hover .arrow {
		transform: translate(2px, -2px);
	}

	.icon {
		flex-shrink: 0;
		width: 2.75rem;
		height: 2.75rem;
		display: grid;
		place-items: center;
		border-radius: 12px;
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		color: var(--accent);
	}

	.card.wide .icon {
		width: 3.25rem;
		height: 3.25rem;
	}

	.icon :global(svg) {
		width: 1.5rem;
		height: 1.5rem;
	}

	.card.wide .icon :global(svg) {
		width: 1.75rem;
		height: 1.75rem;
	}

	.body {
		flex: 1;
		min-width: 0;
	}

	.heading {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
	}

	h3 {
		font-size: 1.1rem;
		letter-spacing: -0.01em;
	}

	.card.wide h3 {
		font-size: 1.25rem;
	}

	.tag {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-dim);
	}

	p {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.5;
		color: var(--text-dim);
	}

	.card.wide p {
		font-size: 0.95rem;
		max-width: 34rem;
	}

	.arrow {
		color: var(--text-dim);
		transition: transform 0.18s ease;
	}

	.card:not(.wide) .arrow {
		margin-top: auto;
	}
</style>
