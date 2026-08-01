<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<a class="back" href={resolve('/')}>&larr; all tools</a>

<header class="intro">
	<h1>{title}</h1>
	<p>{@render children()}</p>
</header>

<style>
	.back {
		display: inline-block;
		margin-bottom: 1.5rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-dim);
		text-decoration: none;
		transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.back:hover {
		color: var(--accent);
		transform: translateX(-3px);
	}

	.intro h1 {
		font-size: clamp(1.8rem, 4vw, 2.3rem);
		letter-spacing: 0.01em;
	}

	.intro p {
		margin-top: 0.5rem;
		max-width: 40rem;
		color: var(--text-dim);
		line-height: 1.5;
	}

	.intro :global(code) {
		font-family: var(--font-mono);
		font-size: 0.85em;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 3px;
		padding: 0.05em 0.35em;
	}
</style>
