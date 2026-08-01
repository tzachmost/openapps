<script lang="ts">
	import { base } from '$app/paths';
	import type { AppMeta } from '$lib/apps';

	let { app, onclick }: { app: AppMeta; onclick?: () => void } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- built from the apps manifest, not a static route literal -->
<a class="row" href="{base}/apps/{app.slug}" {onclick} title={app.tagline}>
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
		transition:
			transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1),
			background-color 0.1s ease,
			border-color 0.1s ease;
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

	/* Desktop: reads as an app grid (icon + name, tile shape) instead of a row list — there's
	   room to spare, and "a folder of apps" is a more honest shape for what this page actually
	   is than a dense list once the screen is wide enough for it. Mobile keeps the row list
	   (already dense and legible at that width) unchanged below this breakpoint. */
	@media (min-width: 40rem) {
		.row {
			flex-direction: column;
			justify-content: center;
			gap: 0.6rem;
			aspect-ratio: 1;
			padding: 1rem;
			border: 2px solid var(--border);
			border-radius: 4px;
			box-shadow: none;
			transform: translate(0, 0);
			transition:
				background-color 0.1s ease,
				color 0.1s ease,
				border-color 0.12s ease,
				box-shadow 0.15s ease,
				transform 0.15s ease;
		}

		.row:hover,
		.row:focus-visible {
			border-color: var(--accent);
			box-shadow: var(--shadow-hard);
			transform: translate(-3px, -3px);
		}

		.icon {
			width: 3rem;
			height: 3rem;
		}

		.row:hover .icon,
		.row:focus-visible .icon {
			transform: scale(1.12) rotate(-4deg);
		}

		.icon :global(svg) {
			width: 1.75rem;
			height: 1.75rem;
		}

		.body {
			flex-direction: column;
			align-items: center;
			gap: 0.3rem;
			text-align: center;
		}

		h3 {
			font-size: 0.85rem;
		}

		.body p {
			max-width: 100%;
			white-space: normal;
			overflow: visible;
			text-overflow: clip;
			display: -webkit-box;
			-webkit-line-clamp: 2;
			line-clamp: 2;
			-webkit-box-orient: vertical;
			overflow: hidden;
			font-size: 0.72rem;
			max-height: 0;
			opacity: 0;
			transition:
				max-height 0.18s ease,
				opacity 0.18s ease;
		}

		.row:hover .body p,
		.row:focus-visible .body p {
			max-height: 2.6em;
			opacity: 0.85;
		}

		.tag,
		.arrow {
			display: none;
		}
	}
</style>
