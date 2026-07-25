<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { formatDate, type PostMeta } from '$lib/writing';

	let { post, children }: { post: PostMeta; children: Snippet } = $props();
</script>

<svelte:head>
	<title>{post.title} — open apps</title>
	<meta name="description" content={post.summary} />
</svelte:head>

<article class="page">
	<a class="back" href={resolve('/writing')}>← writing</a>

	<header>
		<h1>{post.title}</h1>
		<p class="date"><time datetime={post.date}>{formatDate(post.date)}</time></p>
	</header>

	<div class="prose">
		{@render children()}
	</div>

	<footer>
		<a href={resolve('/')}>All tools</a>
		<a href={resolve('/writing')}>More writing</a>
	</footer>
</article>

<style>
	.page {
		/* Narrower than the tool pages: this is a measure for reading, not a workspace. */
		max-width: 36rem;
		margin: 0 auto;
		padding: 0 clamp(1.25rem, 4vw, 3rem) 4rem;
	}

	.back {
		display: inline-block;
		margin-bottom: 2rem;
		font-size: 0.85rem;
		color: var(--text-dim);
		text-decoration: none;
	}

	.back:hover {
		color: var(--text);
	}

	h1 {
		font-size: clamp(1.9rem, 5vw, 2.6rem);
		letter-spacing: -0.025em;
		line-height: 1.1;
	}

	.date {
		margin-top: 0.7rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-dim);
	}

	/* Post bodies are plain markup passed in as children, so the typographic rules
	   have to be :global — they're the only styles the posts themselves rely on. */
	.prose {
		margin-top: 2.5rem;
		font-size: 1.02rem;
		line-height: 1.72;
	}

	.prose :global(p) {
		margin: 0 0 1.3rem;
	}

	.prose :global(h2) {
		margin: 2.6rem 0 1rem;
		font-size: 1.1rem;
		letter-spacing: -0.01em;
	}

	.prose :global(h2::before) {
		content: '';
		display: block;
		width: 1.75rem;
		height: 2px;
		margin-bottom: 1rem;
		background: var(--accent);
		border-radius: 2px;
	}

	.prose :global(em) {
		font-style: italic;
	}

	.prose :global(strong) {
		font-weight: 600;
	}

	.prose :global(code) {
		font-family: var(--font-mono);
		font-size: 0.86em;
		padding: 0.1em 0.35em;
		border-radius: 5px;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
	}

	.prose :global(a) {
		color: var(--text);
		text-decoration-color: var(--accent);
		text-decoration-thickness: 1.5px;
		text-underline-offset: 3px;
	}

	.prose :global(a:hover) {
		color: var(--accent);
	}

	.prose :global(ul) {
		margin: 0 0 1.3rem;
		padding-left: 1.1rem;
	}

	.prose :global(li) {
		margin-bottom: 0.5rem;
	}

	footer {
		display: flex;
		gap: 1.5rem;
		margin-top: 3.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--border);
		font-size: 0.85rem;
	}

	footer a {
		color: var(--text-dim);
		text-decoration: none;
	}

	footer a:hover {
		color: var(--text);
	}
</style>
