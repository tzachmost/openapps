<script lang="ts">
	import { base } from '$app/paths';
	import type { AppMeta } from '$lib/apps';

	let { app }: { app: AppMeta } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- built from the apps manifest, not a static route literal -->
<a class="row" href="{base}/apps/{app.slug}">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- app.icon is authored in-repo, not user input -->
	<div class="icon" aria-hidden="true">{@html app.icon}</div>
	<div class="body">
		<h3>{app.name}</h3>
		<p>{app.tagline}</p>
	</div>
	<span class="tag">{app.tag}</span>
	<span class="arrow" aria-hidden="true">&gt;</span>
</a>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.85rem 1.1rem;
		text-decoration: none;
		color: var(--text);
		border-bottom: 1px solid var(--border);
		transition:
			background-color 0.1s ease,
			color 0.1s ease;
	}

	.row:hover,
	.row:focus-visible {
		background: var(--accent);
		color: var(--accent-text);
		outline: none;
	}

	.icon {
		flex-shrink: 0;
		width: 2.25rem;
		height: 2.25rem;
		display: grid;
		place-items: center;
		border-radius: 6px;
		border: 1.5px solid var(--border-strong);
		background: var(--bg);
		color: var(--accent);
	}

	.row:hover .icon,
	.row:focus-visible .icon {
		background: var(--accent-text);
		border-color: var(--accent-text);
	}

	.icon :global(svg) {
		width: 1.35rem;
		height: 1.35rem;
	}

	.body {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
	}

	h3 {
		font-size: 0.95rem;
		flex-shrink: 0;
	}

	.body p {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.row:hover .body p,
	.row:focus-visible .body p {
		color: inherit;
		opacity: 0.85;
	}

	.tag {
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-dim);
	}

	.row:hover .tag,
	.row:focus-visible .tag {
		color: inherit;
		opacity: 0.85;
	}

	.arrow {
		flex-shrink: 0;
		font-family: var(--font-mono);
		color: var(--text-dim);
	}

	.row:hover .arrow,
	.row:focus-visible .arrow {
		color: inherit;
	}

	@media (max-width: 34rem) {
		.body {
			flex-direction: column;
			gap: 0.15rem;
		}

		.body p {
			white-space: normal;
		}

		.tag {
			display: none;
		}
	}
</style>
