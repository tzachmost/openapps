<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		accept,
		multiple = false,
		onFiles,
		children,
		class: className = ''
	}: {
		accept?: string;
		multiple?: boolean;
		onFiles: (files: FileList | File[]) => void;
		children: Snippet;
		class?: string;
	} = $props();

	let dragActive = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragActive = false;
		if (event.dataTransfer?.files?.length) onFiles(event.dataTransfer.files);
	}

	function onPick(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files?.length) onFiles(target.files);
		target.value = '';
	}
</script>

<div
	class="dropzone {className}"
	class:dragging={dragActive}
	ondragover={(event) => {
		event.preventDefault();
		dragActive = true;
	}}
	ondragleave={() => (dragActive = false)}
	ondrop={onDrop}
	onclick={() => fileInput?.click()}
	onkeydown={(event) => {
		if (event.key === 'Enter' || event.key === ' ') fileInput?.click();
	}}
	role="button"
	tabindex="0"
>
	<span class="corner corner-tl" aria-hidden="true"></span>
	<span class="corner corner-tr" aria-hidden="true"></span>
	<span class="corner corner-bl" aria-hidden="true"></span>
	<span class="corner corner-br" aria-hidden="true"></span>
	{@render children()}
	<input
		bind:this={fileInput}
		type="file"
		{accept}
		{multiple}
		class="visually-hidden"
		onchange={onPick}
	/>
</div>

<style>
	.dropzone {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		border: 2px solid var(--border-strong);
		padding: clamp(1.5rem, 4vw, 2rem);
		text-align: center;
		cursor: pointer;
		background: var(--bg-elevated);
		color: var(--text-dim);
		transition:
			border-color 0.12s ease,
			box-shadow 0.12s ease,
			transform 0.12s ease;
	}

	.dropzone:hover,
	.dropzone:focus-visible {
		box-shadow: var(--shadow-hard);
		transform: translate(-2px, -2px);
		outline: none;
	}

	.dropzone.dragging {
		border-color: var(--accent);
		box-shadow: var(--shadow-hard);
		transform: translate(-2px, -2px);
	}

	.dropzone :global(strong) {
		color: var(--text);
	}

	.corner {
		position: absolute;
		width: 0.9rem;
		height: 0.9rem;
		border-color: var(--accent);
		pointer-events: none;
	}

	.corner-tl {
		top: -2px;
		left: -2px;
		border-top: 3px solid var(--accent);
		border-left: 3px solid var(--accent);
	}

	.corner-tr {
		top: -2px;
		right: -2px;
		border-top: 3px solid var(--accent);
		border-right: 3px solid var(--accent);
	}

	.corner-bl {
		bottom: -2px;
		left: -2px;
		border-bottom: 3px solid var(--accent);
		border-left: 3px solid var(--accent);
	}

	.corner-br {
		bottom: -2px;
		right: -2px;
		border-bottom: 3px solid var(--accent);
		border-right: 3px solid var(--accent);
	}
</style>
