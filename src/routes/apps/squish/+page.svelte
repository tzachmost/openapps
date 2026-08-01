<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	const target = `${resolve('/apps/darkroom')}?mode=compress`;

	onMount(() => {
		goto(target, { replaceState: true });
	});
</script>

<svelte:head>
	<title>Squish is now Darkroom</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<p class="redirect-notice">
	Squish is now the Compress mode in <a href={target}>Darkroom</a> — redirecting…
</p>

<style>
	.redirect-notice {
		max-width: 40rem;
		margin: 4rem auto;
		padding: 0 clamp(1.25rem, 4vw, 3rem);
		text-align: center;
		color: var(--text-dim);
	}

	.redirect-notice a {
		color: var(--accent);
	}
</style>
