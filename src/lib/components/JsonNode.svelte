<script lang="ts">
	import type { DiffNode } from '$lib/sift/diff';
	import type { JsonValue } from '$lib/sift/json';
	import type { SvelteSet } from 'svelte/reactivity';
	import Self from './JsonNode.svelte';

	let {
		node,
		path,
		depth,
		collapsed
	}: {
		node: DiffNode;
		path: string;
		depth: number;
		collapsed: SvelteSet<string>;
	} = $props();

	const isContainer = $derived(!!node.children);
	const isEmpty = $derived(isContainer && node.children!.length === 0);
	const isCollapsed = $derived(collapsed.has(path));
	// Only tint a container row when the whole subtree is one addition/removal — a
	// "changed" container just holds some rows that changed, it isn't a change itself.
	const tinted = $derived(
		node.status !== 'unchanged' && (node.status !== 'changed' || !isContainer)
	);

	function toggle() {
		if (isCollapsed) collapsed.delete(path);
		else collapsed.add(path);
	}

	function childPath(key: string): string {
		return `${path}/${key}`;
	}

	function preview(value: JsonValue | undefined): string {
		if (value === undefined) return '';
		if (value === null) return 'null';
		if (typeof value === 'string') return JSON.stringify(value);
		if (typeof value !== 'object') return String(value);
		const compact = JSON.stringify(value);
		return compact.length > 64 ? `${compact.slice(0, 61)}…` : compact;
	}

	function containerLabel(value: JsonValue | undefined): string {
		if (Array.isArray(value)) return `Array · ${value.length} item${value.length === 1 ? '' : 's'}`;
		if (value && typeof value === 'object') {
			const count = Object.keys(value).length;
			return `Object · ${count} key${count === 1 ? '' : 's'}`;
		}
		return '';
	}

	const displayValue = $derived(node.status === 'removed' ? node.before : node.after);
</script>

<div class="node" style:padding-left="{depth * 1.15}rem">
	<div
		class="row"
		class:added={tinted && node.status === 'added'}
		class:removed={tinted && node.status === 'removed'}
		class:changed={tinted && node.status === 'changed'}
	>
		{#if isContainer && !isEmpty}
			<button
				class="toggle"
				class:open={!isCollapsed}
				onclick={toggle}
				aria-label={isCollapsed ? 'Expand' : 'Collapse'}
				aria-expanded={!isCollapsed}
			>
				▸
			</button>
		{:else}
			<span class="toggle-spacer" aria-hidden="true"></span>
		{/if}

		{#if node.key !== ''}
			<span class="key">{node.key}</span>
			<span class="punct">:</span>
		{/if}

		{#if isContainer}
			<span class="type">{containerLabel(displayValue)}</span>
		{:else if node.status === 'changed'}
			<span class="value before">{preview(node.before)}</span>
			<span class="arrow" aria-hidden="true">→</span>
			<span class="value after">{preview(node.after)}</span>
		{:else}
			<span class="value">{preview(displayValue)}</span>
		{/if}
	</div>

	{#if isContainer && !isEmpty && !isCollapsed}
		{#each node.children! as child (child.key)}
			<Self node={child} path={childPath(child.key)} depth={depth + 1} {collapsed} />
		{/each}
	{/if}
</div>

<style>
	.node {
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}

	.row {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		padding: 0.15rem 0.5rem;
		border-radius: 6px;
		flex-wrap: wrap;
	}

	.row.added {
		background: color-mix(in srgb, var(--diff-add) 14%, transparent);
	}

	.row.removed {
		background: color-mix(in srgb, var(--accent) 12%, transparent);
	}

	.row.changed {
		background: color-mix(in srgb, var(--diff-changed) 16%, transparent);
	}

	.toggle {
		width: 1rem;
		flex-shrink: 0;
		background: none;
		border: none;
		padding: 0;
		color: var(--text-dim);
		cursor: pointer;
		font-size: 0.7rem;
		transform: rotate(0deg);
		transition: transform 0.12s ease;
	}

	.toggle.open {
		transform: rotate(90deg);
	}

	.toggle-spacer {
		width: 1rem;
		flex-shrink: 0;
	}

	.key {
		color: var(--text);
		font-weight: 600;
	}

	.punct {
		color: var(--text-dim);
	}

	.type {
		color: var(--text-dim);
	}

	.value {
		color: var(--text);
		overflow-wrap: anywhere;
	}

	.value.before {
		color: var(--text-dim);
		text-decoration: line-through;
	}

	.value.after {
		color: var(--text);
	}

	.arrow {
		color: var(--text-dim);
	}
</style>
