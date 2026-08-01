<script lang="ts" generics="T extends string">
	type Option = { value: T; label: string };

	let {
		options,
		value = $bindable(),
		compact = false,
		label
	}: {
		options: Option[];
		value: T;
		compact?: boolean;
		label: string;
	} = $props();
</script>

<div class="segmented" class:compact role="group" aria-label={label}>
	{#each options as opt (opt.value)}
		<button type="button" class:active={value === opt.value} onclick={() => (value = opt.value)}>
			{opt.label}
		</button>
	{/each}
</div>

<style>
	.segmented {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.segmented button {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		padding: 0.5rem 1rem;
		border: 2px solid var(--border-strong);
		border-radius: 3px;
		background: var(--bg-elevated);
		color: var(--text-dim);
		cursor: pointer;
		transform: scale(1);
		transition:
			color 0.12s ease,
			background-color 0.12s ease,
			border-color 0.12s ease;
	}

	.segmented button:hover:not(.active) {
		color: var(--text);
		border-color: var(--text-dim);
	}

	.segmented button.active {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
		animation: pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes pop {
		from {
			transform: scale(0.88);
		}
		to {
			transform: scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.segmented button.active {
			animation: none;
		}
	}

	.segmented.compact button {
		font-size: 0.7rem;
		padding: 0.35rem 0.65rem;
	}
</style>
