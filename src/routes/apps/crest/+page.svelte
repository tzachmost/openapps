<script lang="ts">
	import ToolHeader from '$lib/components/ToolHeader.svelte';
	import Button from '$lib/components/Button.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import { takePendingFile } from '$lib/fileHandoff';
	import { renderIcon, renderIconPng, opaqueFallback, type Background } from '$lib/crest/render';
	import { buildCrestPackage, headSnippet } from '$lib/crest/package';
	import { buildZip } from '$lib/crest/zip';

	const PREVIEW_SIZE = 240;
	const FILES = [
		'favicon.ico',
		'favicon-16x16.png',
		'favicon-32x32.png',
		'apple-touch-icon.png',
		'android-chrome-192x192.png',
		'android-chrome-512x512.png',
		'site.webmanifest',
		'head-snippet.txt'
	];

	let bitmap = $state<ImageBitmap | null>(null);
	let sourceName = $state('site');
	let dragActive = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();
	let canvasEl: HTMLCanvasElement | undefined = $state();
	let errorMessage = $state<string | null>(null);

	let backgroundKind = $state<'transparent' | 'solid'>('transparent');
	let backgroundColor = $state('#ffffff');
	let padding = $state(12);
	let siteName = $state('');

	let tabUrl = $state<string | null>(null);
	let iosUrl = $state<string | null>(null);
	let androidUrl = $state<string | null>(null);

	let notice = $state<string | null>(null);
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;
	let building = $state(false);

	const background = $derived<Background>(
		backgroundKind === 'solid' ? { kind: 'solid', color: backgroundColor } : { kind: 'transparent' }
	);
	const opts = $derived({ background, padding: padding / 100 });
	// The manifest/meta theme color rides on the same choice as the icon
	// background rather than a fourth control — when there's no background,
	// white is the same honest fallback used for the iOS icon itself.
	const themeColor = $derived(backgroundKind === 'solid' ? backgroundColor : '#ffffff');

	$effect(() => {
		if (!canvasEl || !bitmap) return;
		renderIcon(canvasEl, bitmap, PREVIEW_SIZE, opts);
	});

	$effect(() => {
		if (!bitmap) {
			tabUrl = iosUrl = androidUrl = null;
			return;
		}
		const current = bitmap;
		const currentOpts = opts;
		let cancelled = false;
		(async () => {
			const [tab, ios, android] = await Promise.all([
				renderIconPng(current, 32, currentOpts),
				renderIconPng(current, 180, opaqueFallback(currentOpts)),
				renderIconPng(current, 192, currentOpts)
			]);
			if (cancelled) return;
			setPreviewUrl('tab', tab);
			setPreviewUrl('ios', ios);
			setPreviewUrl('android', android);
		})();
		return () => {
			cancelled = true;
		};
	});

	function setPreviewUrl(which: 'tab' | 'ios' | 'android', bytes: Uint8Array<ArrayBuffer>) {
		const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
		if (which === 'tab') {
			if (tabUrl) URL.revokeObjectURL(tabUrl);
			tabUrl = url;
		} else if (which === 'ios') {
			if (iosUrl) URL.revokeObjectURL(iosUrl);
			iosUrl = url;
		} else {
			if (androidUrl) URL.revokeObjectURL(androidUrl);
			androidUrl = url;
		}
	}

	function flash(message: string) {
		notice = message;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = null), 1600);
	}

	async function loadFile(file: File) {
		if (!file.type.startsWith('image/')) {
			errorMessage = 'That file is not an image.';
			return;
		}
		try {
			const next = await createImageBitmap(file);
			bitmap?.close();
			bitmap = next;
			sourceName = file.name.replace(/\.[^.]+$/, '') || 'site';
			errorMessage = null;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Could not read this image.';
		}
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragActive = false;
		const file = event.dataTransfer?.files?.[0];
		if (file) loadFile(file);
	}

	function onFilePick(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) loadFile(file);
		target.value = '';
	}

	function onPaste(event: ClipboardEvent) {
		const file = event.clipboardData?.files?.[0];
		if (file) loadFile(file);
	}

	function clearImage() {
		bitmap?.close();
		bitmap = null;
	}

	async function downloadZip() {
		if (!bitmap) return;
		building = true;
		try {
			const files = await buildCrestPackage(bitmap, {
				background,
				padding: padding / 100,
				siteName,
				themeColor
			});
			const zip = buildZip(files);
			const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
			const a = document.createElement('a');
			a.href = url;
			a.download = `${sourceName}-icons.zip`;
			a.click();
			URL.revokeObjectURL(url);
		} finally {
			building = false;
		}
	}

	async function copySnippet() {
		try {
			await navigator.clipboard.writeText(headSnippet(themeColor));
			flash('Copied!');
		} catch {
			flash('Clipboard blocked');
		}
	}

	// Landing page's file-drop hub hands off a file here instead of asking for a second drop.
	const handoffFile = takePendingFile();
	if (handoffFile) loadFile(handoffFile);
</script>

<svelte:window onpaste={onPaste} />

<svelte:head>
	<title>Crest — build a favicon set</title>
	<meta
		name="description"
		content="Drop in a logo and Crest packages every favicon size a modern site needs — ICO, PNGs, a web manifest, and the head tags — into one ZIP. Built entirely on your device."
	/>
</svelte:head>

<div class="page">
	<ToolHeader title="Crest">
		One image in, a full favicon set out. Drop in a logo or mark and Crest crops it square,
		composites it over a background you choose, and packages every size a site actually needs —
		ICO, PNGs, a web manifest, the <code>&lt;head&gt;</code> tags — into one ZIP.
	</ToolHeader>

	{#if !bitmap}
		<div
			class="dropzone"
			class:active={dragActive}
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
			<p><strong>Drop a logo or mark here</strong> or click to browse.</p>
			<p class="hint">Square images work best — anything else gets center-cropped.</p>
			<input
				bind:this={fileInput}
				type="file"
				accept="image/*"
				class="visually-hidden"
				onchange={onFilePick}
			/>
		</div>
		{#if errorMessage}
			<p class="error">{errorMessage}</p>
		{/if}
	{:else}
		<div class="workspace">
			<div
				class="stage"
				class:active={dragActive}
				ondragover={(event) => {
					event.preventDefault();
					dragActive = true;
				}}
				ondragleave={() => (dragActive = false)}
				ondrop={onDrop}
				role="presentation"
			>
				<canvas bind:this={canvasEl} aria-label="Preview of the cropped icon"></canvas>
			</div>

			<div class="panel" aria-label="Settings">
				<div class="panel-head">
					<p class="file">{sourceName}</p>
					<Button variant="ghost" size="small" onclick={clearImage}>New image</Button>
				</div>

				<fieldset>
					<legend>Background</legend>
					<Segmented
						compact
						label="Background"
						bind:value={backgroundKind}
						options={[
							{ value: 'transparent', label: 'Transparent' },
							{ value: 'solid', label: 'Solid color' }
						]}
					/>
					{#if backgroundKind === 'solid'}
						<label class="color-field">
							<input type="color" bind:value={backgroundColor} />
							<span>Fill</span>
						</label>
					{:else}
						<p class="note">
							The Apple touch icon gets filled with white regardless — iOS renders transparency as
							solid black, so leaving it transparent there would just look broken.
						</p>
					{/if}
				</fieldset>

				<fieldset class="sliders">
					<legend>Mount</legend>
					<label>
						<span>Padding <em>{padding}%</em></span>
						<input type="range" min="0" max="30" step="1" bind:value={padding} />
					</label>
				</fieldset>

				<label class="field">
					<span>Site name <em class="optional">optional</em></span>
					<input type="text" bind:value={siteName} placeholder="My Site" maxlength="60" />
				</label>
			</div>
		</div>

		<section class="preview-row" aria-label="Where these icons show up">
			<h2>Where it lands</h2>
			<div class="mockups">
				<div class="mockup">
					<div class="browser-chrome">
						<div class="browser-tab">
							{#if tabUrl}
								<img src={tabUrl} alt="" width="14" height="14" />
							{/if}
							<span>{siteName.trim() || 'yoursite.com'}</span>
						</div>
					</div>
					<p class="mockup-label">Browser tab</p>
				</div>

				<div class="mockup">
					<div
						class="squircle-icon"
						style:background={backgroundKind === 'solid' ? backgroundColor : '#ffffff'}
					>
						{#if iosUrl}
							<img src={iosUrl} alt="" />
						{/if}
					</div>
					<p class="mockup-label">Home screen (iOS)</p>
				</div>

				<div class="mockup">
					<div class="circle-icon checker">
						{#if androidUrl}
							<img src={androidUrl} alt="" />
						{/if}
					</div>
					<p class="mockup-label">Adaptive icon (Android)</p>
				</div>
			</div>
			<p class="note">
				Android's adaptive-icon mask is the strictest of the three — anything outside that circle
				gets clipped by the OS. More padding keeps a mark safe there.
			</p>
		</section>

		<div class="export">
			<div class="file-list">
				<p class="meta">This ZIP contains:</p>
				<ul>
					{#each FILES as name (name)}
						<li>{name}</li>
					{/each}
				</ul>
			</div>
			<div class="export-actions">
				<Button variant="ghost" onclick={copySnippet}>{notice ?? 'Copy <head> snippet'}</Button>
				<Button variant="primary" onclick={downloadZip} disabled={building}>
					{building ? 'Building…' : 'Download ZIP'}
				</Button>
			</div>
		</div>
	{/if}
</div>

<style>
	.page {
		max-width: 62rem;
		margin: 0 auto;
		padding: 0 clamp(1.25rem, 4vw, 3rem) 4rem;
	}

	.error {
		margin-top: 1rem;
		color: var(--accent);
		font-size: 0.85rem;
	}

	.dropzone {
		margin-top: 2rem;
		border: 1.5px dashed var(--border-strong);
		border-radius: 16px;
		padding: clamp(2.5rem, 9vw, 5rem) 1.5rem;
		text-align: center;
		cursor: pointer;
		color: var(--text-dim);
		transition:
			border-color 0.15s ease,
			background 0.15s ease;
	}

	.dropzone:hover,
	.dropzone.active {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 6%, transparent);
	}

	.dropzone strong {
		color: var(--text);
	}

	.hint {
		margin-top: 0.4rem;
		font-size: 0.85rem;
	}

	.workspace {
		margin-top: 2rem;
		display: grid;
		gap: 1rem;
		grid-template-columns: minmax(0, 1fr) 19rem;
		align-items: stretch;
	}

	@media (max-width: 56rem) {
		.workspace {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.stage {
		display: grid;
		place-items: center;
		min-height: 18rem;
		padding: clamp(1rem, 3vw, 2rem);
		border: 2px solid var(--border-strong);
		border-radius: 4px;
		background: var(--bg-elevated);
		transition: border-color 0.15s ease;
	}

	.stage.active {
		border-color: var(--accent);
	}

	canvas {
		display: block;
		max-width: 100%;
		max-height: 56vh;
		width: auto;
		height: auto;
		border-radius: 4px;
		background-color: var(--bg);
		background-image:
			linear-gradient(45deg, var(--border) 25%, transparent 25%),
			linear-gradient(-45deg, var(--border) 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, var(--border) 75%),
			linear-gradient(-45deg, transparent 75%, var(--border) 75%);
		background-size: 16px 16px;
		background-position:
			0 0,
			0 8px,
			8px -8px,
			-8px 0;
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
		padding: 1.1rem;
		background: var(--bg-elevated);
		border: 2px solid var(--border-strong);
		border-radius: 4px;
	}

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.file {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-dim);
		overflow-wrap: anywhere;
	}

	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		padding: 0;
		margin-bottom: 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dim);
	}

	.color-field {
		margin-top: 0.75rem;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.75rem;
		color: var(--text-dim);
		cursor: pointer;
	}

	.color-field input[type='color'] {
		width: 2.6rem;
		height: 2.6rem;
		padding: 0;
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		background: none;
		cursor: pointer;
	}

	.sliders {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	.sliders label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.78rem;
		color: var(--text-dim);
	}

	.sliders em {
		font-style: normal;
		font-family: var(--font-mono);
		color: var(--text);
	}

	.sliders label span {
		display: flex;
		justify-content: space-between;
	}

	input[type='range'] {
		width: 100%;
		accent-color: var(--accent);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.78rem;
		color: var(--text-dim);
	}

	.field .optional {
		font-style: normal;
		font-family: var(--font-mono);
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.field input[type='text'] {
		font: inherit;
		font-size: 0.85rem;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
		color: var(--text);
	}

	.field input[type='text']:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.note {
		margin-top: 0;
		font-size: 0.75rem;
		line-height: 1.45;
		color: var(--text-dim);
	}

	.preview-row {
		margin-top: 2.5rem;
	}

	.preview-row h2 {
		font-size: 1.05rem;
		letter-spacing: -0.01em;
	}

	.mockups {
		margin-top: 1.25rem;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.25rem;
	}

	@media (max-width: 42rem) {
		.mockups {
			grid-template-columns: 1fr;
		}
	}

	.mockup {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 1.5rem 1rem;
		background: var(--bg-elevated);
		border: 2px solid var(--border-strong);
		border-radius: 4px;
	}

	.mockup-label {
		font-size: 0.78rem;
		color: var(--text-dim);
	}

	.browser-chrome {
		width: 100%;
		padding: 0.6rem 0.7rem 0.4rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 10px 10px 4px 4px;
	}

	.browser-tab {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		max-width: 100%;
		padding: 0.4rem 0.7rem;
		background: var(--bg-elevated);
		border-radius: 8px 8px 0 0;
		font-size: 0.72rem;
		color: var(--text-dim);
	}

	.browser-tab img {
		flex-shrink: 0;
		border-radius: 2px;
	}

	.browser-tab span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.squircle-icon,
	.circle-icon {
		width: 4.5rem;
		height: 4.5rem;
		overflow: hidden;
		box-shadow: var(--shadow);
	}

	.squircle-icon {
		border-radius: 22%;
	}

	.circle-icon {
		border-radius: 50%;
	}

	.circle-icon.checker {
		background-color: var(--bg);
		background-image:
			linear-gradient(45deg, var(--border) 25%, transparent 25%),
			linear-gradient(-45deg, var(--border) 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, var(--border) 75%),
			linear-gradient(-45deg, transparent 75%, var(--border) 75%);
		background-size: 12px 12px;
		background-position:
			0 0,
			0 6px,
			6px -6px,
			-6px 0;
	}

	.squircle-icon img,
	.circle-icon img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.export {
		margin-top: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 1rem;
		padding: 1rem 1.1rem;
		background: var(--bg-elevated);
		border: 2px solid var(--border-strong);
		border-radius: 4px;
	}

	.file-list .meta {
		font-size: 0.8rem;
		font-family: var(--font-mono);
		color: var(--text-dim);
	}

	.file-list ul {
		margin: 0.4rem 0 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.9rem;
	}

	.file-list li {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-dim);
	}

	.export-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

</style>
