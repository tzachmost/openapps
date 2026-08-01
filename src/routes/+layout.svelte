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
			<span>open apps</span><span class="dot">.</span><span class="cursor" aria-hidden="true"
			></span>
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
		font-family: var(--font-mono);
		font-weight: 600;
		font-size: 1rem;
		text-transform: uppercase;
		letter-spacing: 0.01em;
		color: var(--text);
	}

	.wordmark .dot {
		color: var(--accent);
	}

	.wordmark .cursor {
		display: inline-block;
		width: 0.55em;
		height: 1em;
		margin-left: 0.15em;
		background: var(--accent);
		vertical-align: -0.15em;
		animation: blink 1.1s steps(1) infinite;
	}

	@keyframes blink {
		0%,
		49% {
			opacity: 1;
		}
		50%,
		100% {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.wordmark .cursor {
			animation: none;
		}
	}

	nav {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.nav-link {
		text-decoration: none;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		color: var(--text-dim);
		border: 2px solid var(--border-strong);
		padding: 0.35rem 0.65rem;
		transition:
			color 0.15s ease,
			background-color 0.15s ease;
	}

	.nav-link:hover {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
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
