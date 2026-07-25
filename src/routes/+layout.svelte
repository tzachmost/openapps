<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#0c0b0a" media="(prefers-color-scheme: dark)" />
	<meta name="theme-color" content="#faf8f4" media="(prefers-color-scheme: light)" />
</svelte:head>

<div class="shell">
	<header>
		<a class="wordmark" href={resolve('/')}>
			<span>open apps</span><span class="dot">.</span>
		</a>
		<nav>
			<a class="nav-link" href={resolve('/writing')}>writing</a>
			<a
				class="nav-link"
				href="https://github.com/tzachmost/openapps"
				target="_blank"
				rel="noreferrer"
			>
				source
			</a>
		</nav>
	</header>

	<main>
		{@render children()}
	</main>

	<footer>
		<p>Small, private, browser-only tools — no accounts, no uploads, no tracking.</p>
	</footer>
</div>

<style>
	.shell {
		min-height: 100%;
		display: flex;
		flex-direction: column;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem clamp(1.25rem, 4vw, 3rem);
	}

	.wordmark {
		text-decoration: none;
		font-weight: 600;
		font-size: 1.05rem;
		letter-spacing: -0.01em;
		color: var(--text);
	}

	.wordmark .dot {
		color: var(--accent);
	}

	nav {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.nav-link {
		text-decoration: none;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-dim);
		border: 1px solid var(--border);
		padding: 0.4rem 0.7rem;
		border-radius: 999px;
		transition:
			color 0.15s ease,
			border-color 0.15s ease;
	}

	.nav-link:hover {
		color: var(--text);
		border-color: var(--border-strong);
	}

	main {
		flex: 1;
	}

	footer {
		padding: 2rem clamp(1.25rem, 4vw, 3rem) 3rem;
		text-align: center;
	}

	footer p {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-dim);
	}
</style>
