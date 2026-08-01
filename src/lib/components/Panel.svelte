<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children,
		class: className = ''
	}: {
		children: Snippet;
		class?: string;
	} = $props();
</script>

<div class="panel {className}">
	{@render children()}
</div>

<style>
	.panel {
		border: 2px solid var(--border-strong);
		background: var(--bg-elevated);
		border-radius: 4px;
		padding: 1.1rem;
	}
</style>
