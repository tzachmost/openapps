<script lang="ts">
	import { base } from '$app/paths';
	import { posts, formatDate } from '$lib/writing';
</script>

<svelte:head>
	<title>Writing — open apps</title>
	<meta
		name="description"
		content="Occasional notes about the tools here, how they get built, and whatever else seems worth writing down."
	/>
</svelte:head>

<div class="page">
	<header class="intro">
		<h1>Writing</h1>
		<p>Occasional. Only when there's something worth saying.</p>
	</header>

	<ul>
		{#each posts as post (post.slug)}
			<li>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- built from the posts manifest, not a static route literal -->
				<a href="{base}/writing/{post.slug}">
					<p class="date"><time datetime={post.date}>{formatDate(post.date)}</time></p>
					<h2>{post.title}</h2>
					<p class="summary">{post.summary}</p>
				</a>
			</li>
		{/each}
	</ul>
</div>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding: clamp(1.5rem, 5vw, 3rem) clamp(1.25rem, 4vw, 3rem) 4rem;
	}

	.intro h1 {
		font-size: clamp(1.8rem, 4vw, 2.3rem);
		letter-spacing: -0.02em;
	}

	.intro p {
		margin-top: 0.5rem;
		color: var(--text-dim);
	}

	ul {
		list-style: none;
		margin: 2.5rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	a {
		display: block;
		padding: 1.4rem 1.5rem;
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

	a:hover {
		transform: translateY(-2px);
		border-color: var(--border-strong);
	}

	.date {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-dim);
	}

	h2 {
		margin-top: 0.55rem;
		font-size: 1.2rem;
		letter-spacing: -0.015em;
	}

	.summary {
		margin-top: 0.5rem;
		font-size: 0.9rem;
		line-height: 1.55;
		color: var(--text-dim);
	}
</style>
