<script lang="ts">
	import ToolHeader from '$lib/components/ToolHeader.svelte';
	import RelatedTools from '$lib/components/RelatedTools.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import Button from '$lib/components/Button.svelte';
	import { CATEGORIES, categoryById, type Unit } from '$lib/convert/units';
	import { smartFormat, parseNumber } from '$lib/convert/format';

	let categoryId = $state(CATEGORIES[0].id);
	const category = $derived(categoryById(categoryId));

	let baseValue = $state(CATEGORIES[0].defaultBase);

	// The one field currently being typed into keeps showing its literal raw string —
	// every other row is a pure `$derived`-style read of `baseValue`, reformatted live.
	// Without this split, reformatting the active field on every keystroke (e.g. "12."
	// snapping back to "12") would fight whatever the user is mid-typing.
	let activeUnitId = $state<string | null>(null);
	let activeDraft = $state('');

	// Reset to a sensible starting value whenever the category itself changes (including
	// the initial mount, harmlessly — `defaultBase` already matches the initial `baseValue`).
	$effect(() => {
		baseValue = categoryById(categoryId).defaultBase;
		activeUnitId = null;
		activeDraft = '';
	});

	function displayFor(unit: Unit): string {
		if (activeUnitId === unit.id) return activeDraft;
		return smartFormat(unit.fromBase(baseValue));
	}

	function onRowInput(unit: Unit, raw: string) {
		activeUnitId = unit.id;
		activeDraft = raw;
		const n = parseNumber(raw);
		if (n !== null) baseValue = unit.toBase(n);
	}

	function onRowFocus(unit: Unit, e: FocusEvent) {
		activeUnitId = unit.id;
		activeDraft = smartFormat(unit.fromBase(baseValue));
		(e.currentTarget as HTMLInputElement).select();
	}

	function onRowBlur() {
		activeUnitId = null;
	}

	const activeInvalid = $derived(
		activeUnitId !== null && activeDraft.trim() !== '' && parseNumber(activeDraft) === null
	);

	let copiedId = $state<string | null>(null);
	async function copyRow(unit: Unit) {
		try {
			await navigator.clipboard.writeText(displayFor(unit));
			copiedId = unit.id;
			setTimeout(() => {
				if (copiedId === unit.id) copiedId = null;
			}, 1200);
		} catch {
			// Clipboard access can be denied by the browser; the value stays selectable either way.
		}
	}
</script>

<svelte:head>
	<title>Convert — unit converter</title>
	<meta
		name="description"
		content="Type a value in any unit and see it converted live across length, weight, temperature, area, volume, speed, time, and data storage. Nothing leaves your device."
	/>
</svelte:head>

<div class="page">
	<ToolHeader title="Convert">
		Type into any field and every other unit in the category updates live — no separate "from"/"to"
		pickers to fight with. Exact standard factors throughout, decimal and binary data prefixes kept
		honestly separate. Nothing is saved or sent anywhere.
	</ToolHeader>

	<div class="category-row">
		<Segmented
			compact
			label="Category"
			bind:value={categoryId}
			options={CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
		/>
	</div>

	<Panel class="rows-panel">
		{#each category.units as unit, i (category.id + unit.id)}
			{#if unit.group && unit.group !== category.units[i - 1]?.group}
				<p class="group-label">{unit.group}</p>
			{/if}
			<div class="row" class:active={activeUnitId === unit.id}>
				<label class="row-label" for={`u-${unit.id}`}>
					<span class="unit-name">{unit.label}</span>
					<span class="unit-symbol">{unit.symbol}</span>
				</label>
				<input
					id={`u-${unit.id}`}
					class="row-input"
					class:invalid={activeUnitId === unit.id && activeInvalid}
					type="text"
					inputmode={category.allowNegative ? 'text' : 'decimal'}
					autocomplete="off"
					spellcheck="false"
					value={displayFor(unit)}
					oninput={(e) => onRowInput(unit, (e.currentTarget as HTMLInputElement).value)}
					onfocus={(e) => onRowFocus(unit, e)}
					onblur={onRowBlur}
				/>
				<Button variant="ghost" size="small" onclick={() => copyRow(unit)}>
					{copiedId === unit.id ? 'Copied!' : 'Copy'}
				</Button>
			</div>
		{/each}
	</Panel>

	{#if category.id === 'data'}
		<p class="note">
			A kilobyte and a kibibyte aren't the same thing, even though "KB" gets used for both in the
			wild — decimal prefixes are powers of 1000 (what storage manufacturers and the SI system use),
			binary prefixes are powers of 1024 (what your OS often shows for file sizes). Kept as separate
			rows on purpose rather than picking one convention and hiding the other.
		</p>
	{/if}

	<RelatedTools slug="convert" />
</div>

<style>
	.page {
		max-width: 42rem;
		margin: 0 auto;
		padding: 0 clamp(1.25rem, 4vw, 3rem) 4rem;
	}

	.category-row {
		margin-top: 1.5rem;
	}

	:global(.rows-panel) {
		margin-top: 1.5rem;
		display: flex;
		flex-direction: column;
	}

	.group-label {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dim);
		margin: 1rem 0 0.4rem;
	}

	.group-label:first-child {
		margin-top: 0;
	}

	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 9rem auto;
		align-items: center;
		gap: 0.75rem;
		padding: 0.55rem 0;
		border-bottom: 1px solid var(--border);
	}

	.row:last-child {
		border-bottom: none;
	}

	.row-label {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.unit-name {
		font-size: 0.88rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.unit-symbol {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-dim);
	}

	.row-input {
		width: 100%;
		font-family: var(--font-mono);
		font-size: 0.92rem;
		text-align: right;
		padding: 0.45rem 0.6rem;
		border: 2px solid var(--border-strong);
		border-radius: 3px;
		background: var(--bg);
		color: var(--text);
	}

	.row.active .row-input {
		border-color: var(--accent);
	}

	.row-input.invalid {
		border-color: color-mix(in srgb, var(--accent) 60%, var(--text-dim));
	}

	.row-input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.note {
		margin-top: 1.25rem;
		font-size: 0.8rem;
		color: var(--text-dim);
		line-height: 1.5;
	}

	@media (max-width: 26rem) {
		.row {
			grid-template-columns: 1fr auto;
			row-gap: 0.4rem;
		}

		.row-label {
			grid-column: 1 / -1;
			flex-direction: row;
			align-items: baseline;
			gap: 0.4rem;
		}
	}
</style>
