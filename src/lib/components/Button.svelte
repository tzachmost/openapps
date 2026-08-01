<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & {
		variant?: 'primary' | 'ghost';
		size?: 'default' | 'small';
		children: Snippet;
	};

	let { variant = 'ghost', size = 'default', children, ...rest }: Props = $props();
</script>

<button class="btn {variant}" class:small={size === 'small'} {...rest}>
	{@render children()}
</button>

<style>
	.btn {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		padding: 0.55rem 1.1rem;
		border: 2px solid var(--border-strong);
		border-radius: 3px;
		background: var(--bg-elevated);
		color: var(--text);
		cursor: pointer;
		box-shadow: none;
		transform: translate(0, 0) scale(1);
		transition:
			transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1),
			box-shadow 0.18s ease,
			background-color 0.12s ease,
			border-color 0.12s ease,
			opacity 0.12s ease;
	}

	.btn.small {
		padding: 0.4rem 0.75rem;
		font-size: 0.72rem;
	}

	.btn:hover:not(:disabled) {
		transform: translate(-2px, -2px) scale(1.03);
		box-shadow: var(--shadow-hard);
	}

	.btn:active:not(:disabled) {
		transform: translate(1px, 1px) scale(0.97);
		box-shadow: none;
		transition-duration: 0.06s;
	}

	.btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
	}
</style>
