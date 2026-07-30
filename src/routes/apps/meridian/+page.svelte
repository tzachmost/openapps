<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { loadSavedZones, saveZones } from '$lib/meridian/storage';
	import {
		daySegments,
		dayDelta,
		detectHomeZone,
		formatClock,
		formatDateLabel,
		homeMidnightInstant,
		instantFromFrac,
		listTimeZones,
		zoneAbbreviation,
		zoneLabel,
		zoneOffsetLabel,
		type Band
	} from '$lib/meridian/tz';

	const TICKS = [0, 6, 12, 18];
	const TICK_LABELS: Record<number, string> = { 0: '12a', 6: '6a', 12: '12p', 18: '6p' };

	let homeZone = $state('');
	let zoneIds = $state<string[]>([]);
	let referenceNow = $state(new Date());
	let following = $state(true);
	let manualFrac = $state(12);
	let use24h = $state(false);
	let dragging = $state(false);
	let query = $state('');
	let searchOpen = $state(false);
	let notice = $state<string | null>(null);
	let trackEl: HTMLDivElement | undefined = $state();
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;

	function clamp(n: number, lo: number, hi: number): number {
		return Math.min(hi, Math.max(lo, n));
	}

	const homeMidnight = $derived(
		homeZone ? homeMidnightInstant(homeZone, referenceNow) : referenceNow
	);
	const liveFrac = $derived(
		homeZone ? clamp((referenceNow.getTime() - homeMidnight.getTime()) / 3_600_000, 0, 24) : 0
	);
	const cursorFrac = $derived(following ? liveFrac : manualFrac);
	const cursorInstant = $derived(
		homeZone ? instantFromFrac(homeMidnight, cursorFrac) : referenceNow
	);

	const rows = $derived.by(() =>
		zoneIds.map((id) => {
			const { city, region } = zoneLabel(id);
			const abbr = zoneAbbreviation(id, cursorInstant);
			return {
				id,
				city,
				region,
				isHome: id === homeZone,
				abbr,
				isLetterAbbr: /^[A-Za-z]+$/.test(abbr),
				offset: zoneOffsetLabel(id, cursorInstant),
				clock: formatClock(id, cursorInstant, use24h),
				date: formatDateLabel(id, cursorInstant),
				delta: homeZone ? dayDelta(id, homeZone, cursorInstant) : 0
			};
		})
	);

	const segments = $derived.by<Band[][]>(() => zoneIds.map((id) => daySegments(id, homeMidnight)));

	const filteredZones = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (q.length === 0) return [];
		return listTimeZones()
			.filter((id) => !zoneIds.includes(id))
			.map((id) => ({ id, ...zoneLabel(id) }))
			.filter(
				(z) =>
					z.city.toLowerCase().includes(q) ||
					z.region.toLowerCase().includes(q) ||
					z.id.toLowerCase().includes(q)
			)
			.slice(0, 8);
	});

	onMount(() => {
		homeZone = detectHomeZone();
		const validIds = new Set(listTimeZones());
		const saved = (loadSavedZones() ?? []).filter((id) => validIds.has(id));
		zoneIds = saved.length > 0 ? saved : [homeZone];
		const timer = setInterval(() => {
			referenceNow = new Date();
		}, 20_000);
		return () => clearInterval(timer);
	});

	$effect(() => {
		if (zoneIds.length > 0) saveZones(zoneIds);
	});

	function flash(message: string) {
		notice = message;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = null), 1600);
	}

	function addZone(id: string) {
		if (zoneIds.includes(id)) return;
		zoneIds = [...zoneIds, id];
		query = '';
		searchOpen = false;
	}

	function removeZone(id: string) {
		zoneIds = zoneIds.filter((z) => z !== id);
	}

	function onSearchInput() {
		searchOpen = query.trim().length > 0;
	}

	function onSearchKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && filteredZones.length > 0) {
			event.preventDefault();
			addZone(filteredZones[0].id);
		} else if (event.key === 'Escape') {
			query = '';
			searchOpen = false;
		}
	}

	function fracFromEvent(event: PointerEvent): number {
		if (!trackEl) return cursorFrac;
		const rect = trackEl.getBoundingClientRect();
		if (rect.width === 0) return cursorFrac;
		const pct = clamp((event.clientX - rect.left) / rect.width, 0, 1);
		return Math.round(pct * 24 * 4) / 4; // snap to 15-minute steps
	}

	function onTrackPointerDown(event: PointerEvent) {
		if (!homeZone) return;
		event.preventDefault();
		following = false;
		manualFrac = fracFromEvent(event);
		dragging = true;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function onTrackPointerMove(event: PointerEvent) {
		if (!dragging) return;
		manualFrac = fracFromEvent(event);
	}

	function endDrag() {
		dragging = false;
	}

	function onTrackKeydown(event: KeyboardEvent) {
		if (event.key === 'Home') {
			event.preventDefault();
			following = true;
			return;
		}
		let dir = 0;
		if (event.key === 'ArrowLeft') dir = -1;
		else if (event.key === 'ArrowRight') dir = 1;
		else return;
		event.preventDefault();
		const base = following ? liveFrac : manualFrac;
		const step = event.shiftKey ? 1 : 0.25;
		following = false;
		manualFrac = clamp(base + dir * step, 0, 24);
	}

	async function copySummary() {
		if (!homeZone || rows.length === 0) return;
		const dateLine = formatDateLabel(homeZone, cursorInstant);
		const lines = rows.map((r) => {
			const deltaText = r.delta ? ` (${r.delta > 0 ? '+' : ''}${r.delta}d)` : '';
			return `${formatClock(r.id, cursorInstant, use24h)}  ${r.city}${deltaText}`;
		});
		try {
			await navigator.clipboard.writeText([dateLine, ...lines].join('\n'));
			flash('Copied');
		} catch {
			flash('Could not copy');
		}
	}
</script>

<svelte:window onpointermove={onTrackPointerMove} onpointerup={endDrag} />

<svelte:head>
	<title>Meridian — see the same moment everywhere</title>
	<meta
		name="description"
		content="Add the timezones that matter, drag across the day to see what time it is everywhere at once, and spot the hours that actually overlap. Nothing leaves your device — your saved zones stay in this browser only."
	/>
</svelte:head>

<div class="page">
	<a class="back" href={resolve('/')}>← all tools</a>

	<header class="intro">
		<h1>Meridian</h1>
		<p>
			Add the places that matter, then drag across the day to see what time it is everywhere at once
			— and where the daylight actually overlaps.
		</p>
	</header>

	{#if homeZone === ''}
		<p class="hint loading">Reading your timezone…</p>
	{:else}
		<div class="toolbar">
			<div class="search">
				<label class="visually-hidden" for="tz-search">Add a timezone</label>
				<input
					id="tz-search"
					type="text"
					placeholder="Add a timezone — try a city name"
					autocomplete="off"
					bind:value={query}
					oninput={onSearchInput}
					onfocus={onSearchInput}
					onblur={() => (searchOpen = false)}
					onkeydown={onSearchKeydown}
				/>
				{#if searchOpen && filteredZones.length > 0}
					<ul class="dropdown" role="listbox">
						{#each filteredZones as z (z.id)}
							<li>
								<button
									type="button"
									onmousedown={(event) => event.preventDefault()}
									onclick={() => addZone(z.id)}
								>
									<span class="city">{z.city}</span>
									{#if z.region}<span class="region">{z.region}</span>{/if}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="toolbar-actions">
				<div class="hour-toggle" role="group" aria-label="Clock format">
					<button class:active={!use24h} onclick={() => (use24h = false)}>12h</button>
					<button class:active={use24h} onclick={() => (use24h = true)}>24h</button>
				</div>
				{#if !following}
					<button class="ghost small" onclick={() => (following = true)}>Jump to now</button>
				{/if}
				<button class="ghost small" onclick={copySummary} disabled={rows.length === 0}>
					Copy times
				</button>
			</div>
		</div>

		{#if rows.length === 0}
			<div class="empty">
				<p>No timezones added yet.</p>
				<button class="ghost small" onclick={() => addZone(homeZone)}>Add my timezone</button>
			</div>
		{:else}
			<div class="board">
				<div class="grid-wrap">
					<div class="ruler-spacer" aria-hidden="true"></div>
					<div class="ruler" aria-hidden="true">
						{#each TICKS as h (h)}
							<span class="tick" style:left="{(h / 24) * 100}%">{TICK_LABELS[h]}</span>
						{/each}
					</div>

					{#each rows as row, i (row.id)}
						<div class="row-head">
							<div class="row-title">
								<span class="city">{row.city}</span>
								{#if row.isHome}<span class="home-badge">home</span>{/if}
							</div>
							<p class="row-sub">
								{#if row.isLetterAbbr}
									<span class="mono">{row.abbr}</span> · {row.offset}
								{:else}
									<span class="mono">{row.offset}</span>
								{/if}
							</p>
							<p class="row-clock">
								{row.clock}
								{#if row.delta !== 0}
									<span class="delta">{row.delta > 0 ? '+' : ''}{row.delta}d</span>
								{/if}
							</p>
							<div class="row-tail">
								<span class="row-date">{row.date}</span>
								<button
									class="remove"
									onclick={() => removeZone(row.id)}
									aria-label="Remove {row.city}"
								>
									✕
								</button>
							</div>
						</div>
						<div class="strip">
							{#each segments[i] as band, cellIndex (cellIndex)}
								<div class="cell band-{band}"></div>
							{/each}
						</div>
					{/each}

					<div
						class="overlay"
						bind:this={trackEl}
						onpointerdown={onTrackPointerDown}
						onkeydown={onTrackKeydown}
						role="slider"
						tabindex="0"
						aria-label="Selected time"
						aria-valuemin="0"
						aria-valuemax="24"
						aria-valuenow={cursorFrac}
						aria-valuetext={rows[0] ? formatClock(rows[0].id, cursorInstant, use24h) : undefined}
					>
						{#if !following}
							<div class="now-marker" style:left="{(liveFrac / 24) * 100}%"></div>
						{/if}
						<div class="cursor" style:left="{(cursorFrac / 24) * 100}%"></div>
					</div>
				</div>
			</div>
			<p class="note">
				Drag anywhere on the strip (or focus it and use the arrow keys) to preview a different time.
				Bands run light-to-dark from daytime to night in each place's own local hours.
			</p>
		{/if}

		<p class="notice" aria-live="polite">{notice ?? ''}</p>
	{/if}
</div>

<style>
	.page {
		max-width: 52rem;
		margin: 0 auto;
		padding: 0 clamp(1.25rem, 4vw, 3rem) 4rem;
	}

	.back {
		display: inline-block;
		margin-bottom: 1.5rem;
		font-size: 0.85rem;
		color: var(--text-dim);
		text-decoration: none;
	}

	.back:hover {
		color: var(--text);
	}

	.intro {
		max-width: 38rem;
	}

	.intro h1 {
		font-size: clamp(1.8rem, 4vw, 2.3rem);
		letter-spacing: -0.02em;
	}

	.intro p {
		margin-top: 0.5rem;
		color: var(--text-dim);
		line-height: 1.55;
	}

	.hint.loading {
		margin-top: 2rem;
		color: var(--text-dim);
		font-size: 0.9rem;
	}

	.toolbar {
		margin-top: 2rem;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.search {
		position: relative;
		flex: 1 1 16rem;
		max-width: 22rem;
	}

	.search input {
		width: 100%;
		font: inherit;
		font-size: 0.85rem;
		padding: 0.55rem 0.85rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--bg-elevated);
		color: var(--text);
	}

	.search input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.dropdown {
		position: absolute;
		z-index: 5;
		top: calc(100% + 0.4rem);
		left: 0;
		right: 0;
		margin: 0;
		padding: 0.35rem;
		list-style: none;
		background: var(--bg-elevated);
		border: 1px solid var(--border-strong);
		border-radius: 12px;
		box-shadow: var(--shadow);
		max-height: 16rem;
		overflow-y: auto;
	}

	.dropdown li + li {
		margin-top: 0.15rem;
	}

	.dropdown button {
		width: 100%;
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font: inherit;
		text-align: left;
		padding: 0.45rem 0.6rem;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--text);
		cursor: pointer;
	}

	.dropdown button:hover {
		background: color-mix(in srgb, var(--accent) 8%, transparent);
	}

	.dropdown .city {
		font-size: 0.85rem;
	}

	.dropdown .region {
		font-size: 0.72rem;
		color: var(--text-dim);
	}

	.toolbar-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.hour-toggle {
		display: inline-flex;
		gap: 0.2rem;
		padding: 0.2rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 999px;
	}

	.hour-toggle button {
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.3rem 0.7rem;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--text-dim);
		cursor: pointer;
	}

	.hour-toggle button.active {
		background: var(--accent);
		color: var(--accent-text);
	}

	button.ghost {
		font: inherit;
		font-size: 0.8rem;
		background: transparent;
		border: 1px solid var(--border);
		color: var(--text);
		border-radius: 999px;
		padding: 0.45rem 0.9rem;
		cursor: pointer;
		transition: border-color 0.15s ease;
	}

	button.ghost:hover:not(:disabled) {
		border-color: var(--border-strong);
	}

	button.ghost.small {
		padding: 0.3rem 0.75rem;
		font-size: 0.75rem;
		white-space: nowrap;
	}

	button.ghost:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.empty {
		margin-top: 2rem;
		padding: 2rem;
		text-align: center;
		border: 1.5px dashed var(--border-strong);
		border-radius: 16px;
		color: var(--text-dim);
	}

	.empty p {
		margin-bottom: 0.75rem;
	}

	.board {
		margin-top: 1.5rem;
		padding: 1.1rem clamp(0.85rem, 3vw, 1.4rem);
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 16px;
	}

	.grid-wrap {
		--head-w: clamp(6.5rem, 22vw, 11rem);
		--gap-x: clamp(0.6rem, 2vw, 1rem);
		position: relative;
		display: grid;
		grid-template-columns: var(--head-w) 1fr;
		column-gap: var(--gap-x);
		row-gap: 0.65rem;
	}

	.ruler-spacer {
		grid-column: 1;
	}

	.ruler {
		grid-column: 2;
		align-self: start;
		position: relative;
		height: 1rem;
	}

	.tick {
		position: absolute;
		transform: translateX(-50%);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-dim);
	}

	.row-head {
		grid-column: 1;
		align-self: center;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.row-title {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
	}

	.row-title .city {
		font-weight: 600;
		font-size: 0.9rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.home-badge {
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--accent);
		border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
		border-radius: 999px;
		padding: 0.1rem 0.4rem;
	}

	.row-sub {
		font-size: 0.72rem;
		color: var(--text-dim);
	}

	.row-sub .mono {
		font-family: var(--font-mono);
	}

	.row-clock {
		font-family: var(--font-mono);
		font-size: 1.15rem;
		font-weight: 600;
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
	}

	.delta {
		font-size: 0.68rem;
		font-weight: 600;
		color: var(--accent);
	}

	.row-tail {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.row-date {
		font-size: 0.72rem;
		color: var(--text-dim);
	}

	.remove {
		font: inherit;
		font-size: 0.7rem;
		line-height: 1;
		padding: 0.2rem 0.35rem;
		border: none;
		background: transparent;
		color: var(--text-dim);
		cursor: pointer;
		border-radius: 6px;
	}

	.remove:hover {
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 8%, transparent);
	}

	.strip {
		grid-column: 2;
		align-self: center;
		display: flex;
		height: 2.3rem;
		border-radius: 8px;
		overflow: hidden;
	}

	.cell {
		flex: 1;
	}

	.band-day {
		background: var(--bg);
	}

	.band-twilight {
		background: color-mix(in srgb, var(--text) 12%, var(--bg));
	}

	.band-night {
		background: color-mix(in srgb, var(--text) 26%, var(--bg));
	}

	.overlay {
		position: absolute;
		top: 0;
		bottom: 0;
		left: calc(var(--head-w) + var(--gap-x));
		right: 0;
		cursor: ew-resize;
		touch-action: none;
	}

	.overlay:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
		border-radius: 8px;
	}

	.now-marker {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 0;
		border-left: 1.5px dashed var(--text-dim);
		opacity: 0.7;
	}

	.cursor {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		margin-left: -1px;
		background: var(--accent);
		border-radius: 2px;
		pointer-events: none;
	}

	.cursor::before,
	.cursor::after {
		content: '';
		position: absolute;
		left: 50%;
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: var(--accent);
		transform: translateX(-50%);
	}

	.cursor::before {
		top: -4px;
	}

	.cursor::after {
		bottom: -4px;
	}

	.note {
		margin-top: 1rem;
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--text-dim);
	}

	.notice {
		min-height: 1.2rem;
		margin-top: 0.6rem;
		text-align: right;
		font-size: 0.78rem;
		color: var(--text-dim);
	}

	@media (max-width: 30rem) {
		.row-sub {
			display: none;
		}

		.row-title {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.1rem;
		}

		.row-title .city {
			white-space: normal;
			overflow: visible;
			text-overflow: clip;
			line-height: 1.15;
		}
	}
</style>
