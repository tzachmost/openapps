<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import ToolHeader from '$lib/components/ToolHeader.svelte';
	import Button from '$lib/components/Button.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import Segmented from '$lib/components/Segmented.svelte';
	import Dropzone from '$lib/components/Dropzone.svelte';
	import { takePendingFile } from '$lib/fileHandoff';
	import { formatBytes } from '$lib/format';
	import {
		compressImage,
		extensionFor,
		resolveFormat,
		type OutputFormat
	} from '$lib/squish/compress';
	import { parseJpegMetadata, stripJpegMetadata, type MetadataField } from '$lib/bare/exif';
	import { samplePixels, buildPalette, type RGB, type PaletteColor } from '$lib/swatch/palette';
	import {
		AUTO_PRESET_ID,
		BACKGROUND_PRESETS,
		DEFAULT_OPTIONS,
		NONE_PRESET_ID,
		RATIOS,
		TRANSPARENT_BACKGROUND,
		backgroundFromPixels,
		backgroundToCss,
		computeLayout,
		renderMat,
		type Background as MatBackground,
		type MatOptions
	} from '$lib/mat/render';
	import {
		renderIcon,
		renderIconPng,
		opaqueFallback,
		type Background as CrestBackground
	} from '$lib/crest/render';
	import { buildCrestPackage, headSnippet } from '$lib/crest/package';
	import { buildZip } from '$lib/crest/zip';

	type Mode = 'compress' | 'metadata' | 'palette' | 'frame' | 'favicon';

	const MODES: { value: Mode; label: string }[] = [
		{ value: 'compress', label: 'Compress' },
		{ value: 'metadata', label: 'Metadata' },
		{ value: 'palette', label: 'Palette' },
		{ value: 'frame', label: 'Frame' },
		{ value: 'favicon', label: 'Favicon' }
	];

	// One shared queue drives every mode below — drop a batch in once, then switch between
	// what to do with it, instead of five separate tools each asking for its own drop.
	type ImageItem = {
		id: string;
		file: File;
		previewUrl: string;
	};

	let items = $state<ImageItem[]>([]);
	let mode = $state<Mode>('compress');

	// Reading the URL's query string is only meaningful once hydrated on a real visit — during
	// prerendering there's no request to read one from, so this has to happen after mount, not
	// at component init (a static build has no "the" query string to bake in).
	onMount(() => {
		const requested = page.url.searchParams.get('mode');
		if (MODES.some((m) => m.value === requested)) mode = requested as Mode;
	});

	function findItem(id: string): ImageItem | undefined {
		return items.find((entry) => entry.id === id);
	}

	// ---------------------------------------------------------------------------
	// Compress (from Squish) — explicit action, never auto-runs: the step that
	// actually produces a converted/resized artifact needs a conscious click.
	// ---------------------------------------------------------------------------
	type CompressState = {
		status: 'pending' | 'processing' | 'done' | 'error';
		outputUrl?: string;
		outputSize?: number;
		outputName?: string;
		width?: number;
		height?: number;
		errorMessage?: string;
	};

	const MAX_DIMENSION_OPTIONS = [
		{ label: 'Original size', value: 0 },
		{ label: 'Fit within 2560px', value: 2560 },
		{ label: 'Fit within 1920px', value: 1920 },
		{ label: 'Fit within 1280px', value: 1280 },
		{ label: 'Fit within 800px', value: 800 }
	];

	const FORMAT_CHOICES: { value: OutputFormat; label: string }[] = [
		{ value: 'auto', label: 'Auto' },
		{ value: 'image/jpeg', label: 'JPEG' },
		{ value: 'image/webp', label: 'WebP' },
		{ value: 'image/png', label: 'PNG' }
	];

	let compressState = $state<Record<string, CompressState>>({});
	let format = $state<OutputFormat>('auto');
	let quality = $state(0.8);
	let maxDimension = $state(0);

	const qualityMatters = $derived(format !== 'image/png');
	const doneItems = $derived(items.filter((item) => compressState[item.id]?.status === 'done'));
	const totalOriginal = $derived(items.reduce((sum, item) => sum + item.file.size, 0));
	const totalOutput = $derived(
		doneItems.reduce((sum, item) => sum + (compressState[item.id]?.outputSize ?? 0), 0)
	);
	const totalSavedPct = $derived(
		totalOriginal > 0 && doneItems.length > 0
			? Math.round((1 - totalOutput / totalOriginal) * 100)
			: null
	);
	const representativeItem = $derived<ImageItem | null>(
		items.length === 0 ? null : items.reduce((a, b) => (b.file.size > a.file.size ? b : a))
	);
	const autoResolvedLabel = $derived(
		representativeItem
			? `Auto (stays ${extensionFor(resolveFormat(representativeItem.file.type, 'auto')).toUpperCase()})`
			: 'Auto'
	);

	async function runWithLimit<T>(list: T[], limit: number, task: (item: T) => Promise<void>) {
		let cursor = 0;
		async function worker() {
			while (cursor < list.length) {
				const item = list[cursor++];
				await task(item);
			}
		}
		await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
	}

	async function processCompressItem(id: string) {
		const item = findItem(id);
		if (!item) return;
		compressState[id] = { ...compressState[id], status: 'processing' };
		try {
			const result = await compressImage(item.file, { format, quality, maxDimension: maxDimension || null });
			const prev = compressState[id];
			if (prev?.outputUrl) URL.revokeObjectURL(prev.outputUrl);
			const mimeType = resolveFormat(item.file.type, format);
			const baseName = item.file.name.replace(/\.[^.]+$/, '');
			compressState[id] = {
				status: 'done',
				outputUrl: result.url,
				outputSize: result.blob.size,
				outputName: `${baseName}-squished.${extensionFor(mimeType)}`,
				width: result.width,
				height: result.height
			};
		} catch (error) {
			compressState[id] = {
				status: 'error',
				errorMessage: error instanceof Error ? error.message : 'Could not process this image.'
			};
		}
	}

	function compressAll() {
		if (items.length === 0) return;
		runWithLimit(
			items.map((item) => item.id),
			3,
			processCompressItem
		);
	}

	let estimates = $state<Partial<Record<OutputFormat, number | null>>>({});
	let estimating = $state(false);
	let estimateTimer: ReturnType<typeof setTimeout> | undefined;
	let estimateRunId = 0;

	async function runEstimate() {
		const item = representativeItem;
		if (!item) {
			estimates = {};
			return;
		}
		const runId = ++estimateRunId;
		estimating = true;
		const results = await Promise.all(
			FORMAT_CHOICES.map(async ({ value }) => {
				try {
					const result = await compressImage(item.file, { format: value, quality, maxDimension: maxDimension || null });
					URL.revokeObjectURL(result.url);
					return [value, result.blob.size] as const;
				} catch {
					return [value, null] as const;
				}
			})
		);
		if (runId !== estimateRunId) return;
		estimates = Object.fromEntries(results);
		estimating = false;
	}

	function scheduleEstimate() {
		if (estimateTimer) clearTimeout(estimateTimer);
		estimateTimer = setTimeout(runEstimate, 200);
	}

	$effect(() => {
		void representativeItem;
		void quality;
		void maxDimension;
		if (mode === 'compress') scheduleEstimate();
	});

	function downloadCompressItem(item: ImageItem) {
		const c = compressState[item.id];
		if (!c?.outputUrl || !c.outputName) return;
		const anchor = document.createElement('a');
		anchor.href = c.outputUrl;
		anchor.download = c.outputName;
		anchor.click();
	}

	async function downloadAllCompressed() {
		for (const item of doneItems) {
			downloadCompressItem(item);
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
	}

	// ---------------------------------------------------------------------------
	// Metadata (from Bare) — reads automatically on drop, JPEG only; other files
	// show as unsupported in this mode rather than being filtered from the queue.
	// ---------------------------------------------------------------------------
	type MetaState = {
		status: 'reading' | 'ready' | 'unsupported' | 'error';
		fields: MetadataField[];
		gps?: { lat: number; lon: number };
		metadataBytes: number;
		showFields: boolean;
		stripStatus: 'idle' | 'working' | 'done' | 'error';
		strippedUrl?: string;
		strippedSize?: number;
		errorMessage?: string;
	};

	let metaState = $state<Record<string, MetaState>>({});

	const metaReadyItems = $derived(items.filter((item) => metaState[item.id]?.status === 'ready'));
	const metaDirtyItems = $derived(
		metaReadyItems.filter((item) => (metaState[item.id]?.metadataBytes ?? 0) > 0)
	);
	const metaStrippedCount = $derived(
		items.filter((item) => metaState[item.id]?.stripStatus === 'done').length
	);
	const totalMetadataBytes = $derived(
		metaReadyItems.reduce((sum, item) => sum + (metaState[item.id]?.metadataBytes ?? 0), 0)
	);

	function mapUrl(gps: { lat: number; lon: number }): string {
		const zoomed = `16/${gps.lat}/${gps.lon}`;
		return `https://www.openstreetmap.org/?mlat=${gps.lat}&mlon=${gps.lon}#map=${zoomed}`;
	}

	async function readMetaItem(id: string) {
		const item = findItem(id);
		if (!item) return;
		const isJpeg = item.file.type === 'image/jpeg' || /\.jpe?g$/i.test(item.file.name);
		if (!isJpeg) {
			metaState[id] = {
				status: 'unsupported',
				fields: [],
				metadataBytes: 0,
				showFields: false,
				stripStatus: 'idle'
			};
			return;
		}
		try {
			const buffer = await item.file.arrayBuffer();
			const parsed = parseJpegMetadata(buffer);
			metaState[id] = {
				status: 'ready',
				fields: parsed.fields,
				gps: parsed.gps,
				metadataBytes: parsed.metadataBytes,
				showFields: false,
				stripStatus: 'idle'
			};
		} catch (error) {
			metaState[id] = {
				status: 'error',
				fields: [],
				metadataBytes: 0,
				showFields: false,
				stripStatus: 'idle',
				errorMessage: error instanceof Error ? error.message : 'Could not read this file.'
			};
		}
	}

	async function stripMetaItem(id: string) {
		const item = findItem(id);
		const current = metaState[id];
		if (!item || !current) return;
		metaState[id] = { ...current, stripStatus: 'working' };
		try {
			const result = await stripJpegMetadata(item.file);
			const prev = metaState[id];
			if (prev?.strippedUrl) URL.revokeObjectURL(prev.strippedUrl);
			metaState[id] = {
				...prev,
				stripStatus: 'done',
				strippedUrl: URL.createObjectURL(result.blob),
				strippedSize: result.blob.size
			};
		} catch (error) {
			metaState[id] = {
				...metaState[id],
				stripStatus: 'error',
				errorMessage: error instanceof Error ? error.message : 'Could not strip this file.'
			};
		}
	}

	async function stripAllMeta() {
		for (const item of metaDirtyItems) {
			if (metaState[item.id]?.stripStatus === 'idle') await stripMetaItem(item.id);
		}
	}

	function downloadStripped(item: ImageItem) {
		const m = metaState[item.id];
		if (!m?.strippedUrl) return;
		const baseName = item.file.name.replace(/\.[^.]+$/, '');
		const anchor = document.createElement('a');
		anchor.href = m.strippedUrl;
		anchor.download = `${baseName}-bare.jpg`;
		anchor.click();
	}

	async function downloadAllStripped() {
		for (const item of items) {
			if (metaState[item.id]?.stripStatus === 'done') {
				downloadStripped(item);
				await new Promise((r) => setTimeout(r, 200));
			}
		}
	}

	// ---------------------------------------------------------------------------
	// Palette (from Swatch) — reads automatically on drop; colors are recomputed
	// from raw pixels + colorCount on demand rather than cached, so changing the
	// color count never needs a write-back into item state.
	// ---------------------------------------------------------------------------
	type PaletteState = {
		status: 'reading' | 'ready' | 'error';
		pixels?: RGB[];
		errorMessage?: string;
	};

	let paletteState = $state<Record<string, PaletteState>>({});
	let colorCount = $state(6);
	let copiedKey = $state<string | null>(null);

	const paletteItems = $derived(
		items.map((item) => {
			const p = paletteState[item.id];
			const colors: PaletteColor[] = p?.status === 'ready' && p.pixels ? buildPalette(p.pixels, colorCount) : [];
			return { item, state: p, colors };
		})
	);

	async function readPaletteItem(id: string) {
		const item = findItem(id);
		if (!item) return;
		try {
			const bitmap = await createImageBitmap(item.file);
			const pixels = samplePixels(bitmap);
			bitmap.close();
			if (pixels.length === 0) {
				paletteState[id] = { status: 'error', errorMessage: 'This image has no visible pixels to sample.' };
				return;
			}
			paletteState[id] = { status: 'ready', pixels };
		} catch (error) {
			paletteState[id] = {
				status: 'error',
				errorMessage: error instanceof Error ? error.message : 'Could not read this image.'
			};
		}
	}

	async function copyText(text: string, key: string) {
		try {
			await navigator.clipboard.writeText(text);
			copiedKey = key;
			setTimeout(() => {
				if (copiedKey === key) copiedKey = null;
			}, 1200);
		} catch {
			// Clipboard access can be denied by the browser; the text stays selectable either way.
		}
	}

	function cssVariables(colors: PaletteColor[]): string {
		const lines = colors.map((color, i) => `\t--swatch-${i + 1}: ${color.hex};`);
		return `:root {\n${lines.join('\n')}\n}`;
	}

	// ---------------------------------------------------------------------------
	// Frame & Favicon (from Mat & Crest) — both operate on a single "active" item
	// rather than the whole queue, since they're a canvas/bitmap pipeline, not a
	// batch one. An item picker appears whenever there's more than one to choose
	// from; settings persist across whichever image is currently active.
	// ---------------------------------------------------------------------------
	let activeId = $state<string | null>(null);
	const activeItem = $derived(items.find((item) => item.id === activeId) ?? items[0] ?? null);

	let activeBitmap = $state<ImageBitmap | null>(null);
	let bitmapError = $state<string | null>(null);

	$effect(() => {
		const item = activeItem;
		if (!item || (mode !== 'frame' && mode !== 'favicon')) return;
		let cancelled = false;
		createImageBitmap(item.file)
			.then((bitmap) => {
				if (cancelled) {
					bitmap.close();
					return;
				}
				activeBitmap?.close();
				activeBitmap = bitmap;
				bitmapError = null;
				matAutoBackground = backgroundFromPixels(samplePixels(bitmap));
			})
			.catch((error) => {
				if (cancelled) return;
				bitmapError = error instanceof Error ? error.message : 'Could not read this image.';
			});
		return () => {
			cancelled = true;
		};
	});

	// --- Frame (Mat) settings ---
	const MAX_EXPORT_EDGE = 8192;
	const MAX_PREVIEW_EDGE = 1600;
	const DEFAULT_PRESET_ID = 'ember';

	let matCanvasEl: HTMLCanvasElement | undefined = $state();
	let matPresetId = $state(DEFAULT_PRESET_ID);
	let matAutoBackground = $state<MatBackground | null>(null);
	let matOpts = $state<MatOptions>({ ...DEFAULT_OPTIONS });
	let matExportScale = $state(2);
	let matNotice = $state<string | null>(null);
	let matNoticeTimer: ReturnType<typeof setTimeout> | undefined;

	const matActiveBackground = $derived.by((): MatBackground => {
		if (matPresetId === NONE_PRESET_ID) return TRANSPARENT_BACKGROUND;
		if (matPresetId === AUTO_PRESET_ID) return matAutoBackground ?? TRANSPARENT_BACKGROUND;
		return (
			BACKGROUND_PRESETS.find((preset) => preset.id === matPresetId)?.background ??
			DEFAULT_OPTIONS.background
		);
	});
	const matSettings = $derived<MatOptions>({ ...matOpts, background: matActiveBackground });
	const matLayout = $derived(
		activeBitmap ? computeLayout(activeBitmap.width, activeBitmap.height, matSettings) : null
	);
	const matScaleOptions = $derived(
		[1, 2, 3].filter(
			(scale) =>
				!matLayout ||
				(matLayout.width * scale <= MAX_EXPORT_EDGE && matLayout.height * scale <= MAX_EXPORT_EDGE)
		)
	);
	const matExportWidth = $derived(matLayout ? Math.round(matLayout.width * matExportScale) : 0);
	const matExportHeight = $derived(matLayout ? Math.round(matLayout.height * matExportScale) : 0);

	$effect(() => {
		if (!matScaleOptions.includes(matExportScale)) {
			matExportScale = matScaleOptions[matScaleOptions.length - 1] ?? 1;
		}
	});

	$effect(() => {
		if (mode !== 'frame' || !matCanvasEl || !activeBitmap || !matLayout) return;
		const scale = Math.min(2, MAX_PREVIEW_EDGE / Math.max(matLayout.width, matLayout.height));
		try {
			renderMat(matCanvasEl, activeBitmap, matSettings, scale);
		} catch (error) {
			bitmapError = error instanceof Error ? error.message : 'Could not draw this image.';
		}
	});

	function flashMat(message: string) {
		matNotice = message;
		clearTimeout(matNoticeTimer);
		matNoticeTimer = setTimeout(() => (matNotice = null), 1600);
	}

	function resetMat() {
		matOpts = { ...DEFAULT_OPTIONS };
		matPresetId = DEFAULT_PRESET_ID;
		flashMat('Settings reset');
	}

	async function matToBlob(): Promise<Blob | null> {
		if (!activeBitmap) return null;
		const canvas = document.createElement('canvas');
		renderMat(canvas, activeBitmap, matSettings, matExportScale);
		return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
	}

	async function downloadMat() {
		const blob = await matToBlob();
		if (!blob || !activeItem) return;
		const baseName = activeItem.file.name.replace(/\.[^.]+$/, '') || 'screenshot';
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${baseName}-mat.png`;
		link.click();
		URL.revokeObjectURL(url);
	}

	async function copyMatToClipboard() {
		const blob = await matToBlob();
		if (!blob) return;
		try {
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
			flashMat('Copied to clipboard');
		} catch {
			flashMat('Clipboard blocked — use Download');
		}
	}

	// --- Favicon (Crest) settings ---
	const PREVIEW_SIZE = 240;
	const CREST_FILES = [
		'favicon.ico',
		'favicon-16x16.png',
		'favicon-32x32.png',
		'apple-touch-icon.png',
		'android-chrome-192x192.png',
		'android-chrome-512x512.png',
		'site.webmanifest',
		'head-snippet.txt'
	];

	let crestCanvasEl: HTMLCanvasElement | undefined = $state();
	let crestBackgroundKind = $state<'transparent' | 'solid'>('transparent');
	let crestBackgroundColor = $state('#ffffff');
	let crestPadding = $state(12);
	let crestSiteName = $state('');
	let crestTabUrl = $state<string | null>(null);
	let crestIosUrl = $state<string | null>(null);
	let crestAndroidUrl = $state<string | null>(null);
	let crestNotice = $state<string | null>(null);
	let crestNoticeTimer: ReturnType<typeof setTimeout> | undefined;
	let crestBuilding = $state(false);

	const crestBackground = $derived<CrestBackground>(
		crestBackgroundKind === 'solid' ? { kind: 'solid', color: crestBackgroundColor } : { kind: 'transparent' }
	);
	const crestOpts = $derived({ background: crestBackground, padding: crestPadding / 100 });
	const crestThemeColor = $derived(crestBackgroundKind === 'solid' ? crestBackgroundColor : '#ffffff');

	$effect(() => {
		if (mode !== 'favicon' || !crestCanvasEl || !activeBitmap) return;
		renderIcon(crestCanvasEl, activeBitmap, PREVIEW_SIZE, crestOpts);
	});

	$effect(() => {
		if (mode !== 'favicon' || !activeBitmap) {
			return;
		}
		const current = activeBitmap;
		const currentOpts = crestOpts;
		let cancelled = false;
		(async () => {
			const [tab, ios, android] = await Promise.all([
				renderIconPng(current, 32, currentOpts),
				renderIconPng(current, 180, opaqueFallback(currentOpts)),
				renderIconPng(current, 192, currentOpts)
			]);
			if (cancelled) return;
			setCrestPreviewUrl('tab', tab);
			setCrestPreviewUrl('ios', ios);
			setCrestPreviewUrl('android', android);
		})();
		return () => {
			cancelled = true;
		};
	});

	function setCrestPreviewUrl(which: 'tab' | 'ios' | 'android', bytes: Uint8Array<ArrayBuffer>) {
		const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
		if (which === 'tab') {
			if (crestTabUrl) URL.revokeObjectURL(crestTabUrl);
			crestTabUrl = url;
		} else if (which === 'ios') {
			if (crestIosUrl) URL.revokeObjectURL(crestIosUrl);
			crestIosUrl = url;
		} else {
			if (crestAndroidUrl) URL.revokeObjectURL(crestAndroidUrl);
			crestAndroidUrl = url;
		}
	}

	function flashCrest(message: string) {
		crestNotice = message;
		clearTimeout(crestNoticeTimer);
		crestNoticeTimer = setTimeout(() => (crestNotice = null), 1600);
	}

	async function downloadCrestZip() {
		if (!activeBitmap || !activeItem) return;
		crestBuilding = true;
		try {
			const files = await buildCrestPackage(activeBitmap, {
				background: crestBackground,
				padding: crestPadding / 100,
				siteName: crestSiteName,
				themeColor: crestThemeColor
			});
			const zip = buildZip(files);
			const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
			const baseName = activeItem.file.name.replace(/\.[^.]+$/, '') || 'site';
			const a = document.createElement('a');
			a.href = url;
			a.download = `${baseName}-icons.zip`;
			a.click();
			URL.revokeObjectURL(url);
		} finally {
			crestBuilding = false;
		}
	}

	async function copyCrestSnippet() {
		try {
			await navigator.clipboard.writeText(headSnippet(crestThemeColor));
			flashCrest('Copied!');
		} catch {
			flashCrest('Clipboard blocked');
		}
	}

	// ---------------------------------------------------------------------------
	// Shared queue plumbing
	// ---------------------------------------------------------------------------
	function addFiles(fileList: FileList | File[]) {
		const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
		const newItems: ImageItem[] = files.map((file) => ({
			id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
			file,
			previewUrl: URL.createObjectURL(file)
		}));
		items = [...items, ...newItems];
		compressState = { ...compressState, ...Object.fromEntries(newItems.map((i) => [i.id, { status: 'pending' as const }])) };
		if (!activeId && newItems.length > 0) activeId = newItems[0].id;
		for (const item of newItems) {
			readMetaItem(item.id);
			readPaletteItem(item.id);
		}
	}

	function revokeItemUrls(id: string) {
		const c = compressState[id];
		if (c?.outputUrl) URL.revokeObjectURL(c.outputUrl);
		const m = metaState[id];
		if (m?.strippedUrl) URL.revokeObjectURL(m.strippedUrl);
	}

	function removeItem(id: string) {
		const item = findItem(id);
		if (item) URL.revokeObjectURL(item.previewUrl);
		revokeItemUrls(id);
		items = items.filter((entry) => entry.id !== id);
		delete compressState[id];
		delete metaState[id];
		delete paletteState[id];
		if (activeId === id) {
			activeBitmap?.close();
			activeBitmap = null;
			activeId = items[0]?.id ?? null;
		}
	}

	function clearAll() {
		for (const item of items) URL.revokeObjectURL(item.previewUrl);
		for (const item of items) revokeItemUrls(item.id);
		items = [];
		compressState = {};
		metaState = {};
		paletteState = {};
		activeBitmap?.close();
		activeBitmap = null;
		activeId = null;
	}

	function onPaste(event: ClipboardEvent) {
		const files = Array.from(event.clipboardData?.files ?? []);
		if (files.length) addFiles(files);
	}

	// Landing page's file-drop hub hands off a file here instead of asking for a second drop.
	const handoffFile = takePendingFile();
	if (handoffFile) addFiles([handoffFile]);
</script>

<svelte:window onpaste={onPaste} />

<svelte:head>
	<title>Darkroom — compress, clean, frame, and export images</title>
	<meta
		name="description"
		content="Drop in a batch of images and Darkroom handles what comes next — compress and convert, strip hidden EXIF/GPS metadata, pull a color palette, mount a screenshot with a background, or package a full favicon set. Everything renders on your device."
	/>
</svelte:head>

<div class="page">
	<ToolHeader title="Darkroom">
		One shared queue, five things to do with it: shrink and convert, strip hidden metadata, pull a
		color palette, mount a screenshot, or package a favicon set. Drop images in once, then switch
		modes — nothing is ever uploaded.
	</ToolHeader>

	<Dropzone accept="image/*" multiple onFiles={addFiles}>
		<p>
			<strong>Drop images here</strong> or click to browse — you can also paste from the clipboard.
		</p>
	</Dropzone>

	{#if items.length > 0}
		<div class="mode-row">
			<Segmented label="Mode" bind:value={mode} options={MODES} />
		</div>

		{#if mode === 'compress'}
			<section class="controls" aria-label="Compression settings">
				<label>
					<span>Format</span>
					<select bind:value={format}>
						<option value="auto">Keep original</option>
						<option value="image/jpeg">JPEG</option>
						<option value="image/webp">WebP</option>
						<option value="image/png">PNG</option>
					</select>
				</label>
				<label class:disabled={!qualityMatters}>
					<span>Quality — {Math.round(quality * 100)}%</span>
					<input type="range" min="0.4" max="1" step="0.05" bind:value={quality} disabled={!qualityMatters} />
				</label>
				<label>
					<span>Max dimension</span>
					<select bind:value={maxDimension}>
						{#each MAX_DIMENSION_OPTIONS as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>
			</section>

			<Panel class="estimate-panel">
				<p class="estimate-label">
					Estimated at this quality{#if items.length > 1}, for the largest file ({representativeItem
							?.file.name}){/if} — a suggestion, pick whichever fits:
				</p>
				<div class="estimate-rows">
					{#each FORMAT_CHOICES as choice (choice.value)}
						{@const size = estimates[choice.value]}
						{@const pct =
							size != null && representativeItem
								? Math.round((1 - size / representativeItem.file.size) * 100)
								: null}
						<button
							type="button"
							class="estimate-row"
							class:active={format === choice.value}
							onclick={() => (format = choice.value)}
						>
							<span class="estimate-name">{choice.value === 'auto' ? autoResolvedLabel : choice.label}</span>
							<span class="estimate-size">
								{#if estimating && size == null}
									…
								{:else if size != null}
									{formatBytes(size)}
									{#if pct !== null && pct > 0}
										<span class="saved">−{pct}%</span>
									{:else if pct !== null && pct < 0}
										<span class="grown">+{-pct}% larger</span>
									{/if}
								{:else}
									—
								{/if}
							</span>
						</button>
					{/each}
				</div>
			</Panel>

			<section class="results">
				<div class="results-header">
					<p>
						{items.length} image{items.length === 1 ? '' : 's'}
						{#if totalSavedPct !== null}
							· {formatBytes(totalOriginal)} → {formatBytes(totalOutput)}
							{#if totalSavedPct > 0}
								<span class="saved">−{totalSavedPct}%</span>
							{:else if totalSavedPct < 0}
								<span class="grown">+{-totalSavedPct}% larger</span>
							{/if}
						{/if}
					</p>
					<div class="actions">
						<Button variant="primary" size="small" onclick={compressAll}>
							Compress {items.length} image{items.length === 1 ? '' : 's'}
						</Button>
						{#if doneItems.length > 1}
							<Button variant="ghost" size="small" onclick={downloadAllCompressed}>Download all</Button>
						{/if}
						<Button variant="ghost" size="small" onclick={clearAll}>Clear</Button>
					</div>
				</div>

				<ul>
					{#each items as item (item.id)}
						{@const c = compressState[item.id]}
						<li>
							<img src={item.previewUrl} alt="" />
							<div class="meta">
								<p class="name">{item.file.name}</p>
								{#if c?.status === 'pending' || !c}
									<p class="status">Ready — {formatBytes(item.file.size)}</p>
								{:else if c.status === 'processing'}
									<p class="status">Compressing…</p>
								{:else if c.status === 'error'}
									<p class="status error">{c.errorMessage}</p>
								{:else if c.status === 'done' && c.outputSize !== undefined}
									<p class="status">
										{formatBytes(item.file.size)} → {formatBytes(c.outputSize)}
										{#if c.outputSize < item.file.size}
											<span class="saved">−{Math.round((1 - c.outputSize / item.file.size) * 100)}%</span>
										{:else if c.outputSize > item.file.size}
											<span class="grown">+{Math.round((c.outputSize / item.file.size - 1) * 100)}% larger</span>
										{/if}
										· {c.width}×{c.height}
									</p>
								{/if}
							</div>
							<div class="row-actions">
								<Button variant="ghost" size="small" disabled={c?.status !== 'done'} onclick={() => downloadCompressItem(item)}>
									Download
								</Button>
								<button class="icon-button" aria-label="Remove" onclick={() => removeItem(item.id)}>×</button>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{:else if mode === 'metadata'}
			<section class="results">
				<div class="results-header">
					<p>
						{items.length} photo{items.length === 1 ? '' : 's'}
						{#if totalMetadataBytes > 0}
							· <span class="saved">{formatBytes(totalMetadataBytes)} of metadata found</span>
						{/if}
					</p>
					<div class="actions">
						{#if metaDirtyItems.length > 1 && metaStrippedCount < metaDirtyItems.length}
							<Button variant="ghost" size="small" onclick={stripAllMeta}>Strip all</Button>
						{/if}
						{#if metaStrippedCount > 1}
							<Button variant="ghost" size="small" onclick={downloadAllStripped}>Download all stripped</Button>
						{/if}
						<Button variant="ghost" size="small" onclick={clearAll}>Clear</Button>
					</div>
				</div>

				<ul>
					{#each items as item (item.id)}
						{@const m = metaState[item.id]}
						<li>
							<div class="row">
								<img src={item.previewUrl} alt="" />
								<div class="meta">
									<p class="name">{item.file.name}</p>
									{#if !m || m.status === 'reading'}
										<p class="status">Reading…</p>
									{:else if m.status === 'unsupported'}
										<p class="status">Darkroom only reads JPEG metadata right now.</p>
									{:else if m.status === 'error'}
										<p class="status error">{m.errorMessage}</p>
									{:else if m.status === 'ready'}
										<p class="status">
											{#if m.fields.length > 0}
												<button class="link" onclick={() => (metaState[item.id].showFields = !m.showFields)}>
													{m.showFields ? 'Hide' : 'Show'}
													{m.fields.length} field{m.fields.length === 1 ? '' : 's'}
												</button>
											{:else if m.metadataBytes > 0}
												No camera or location data — just {formatBytes(m.metadataBytes)} of container housekeeping
												(e.g. a JFIF marker).
											{:else}
												No metadata found — already clean.
											{/if}
										</p>
									{/if}
								</div>
								<div class="row-actions">
									{#if m?.status === 'ready' && m.metadataBytes > 0}
										{#if m.stripStatus === 'done' && m.strippedUrl}
											<Button variant="ghost" size="small" onclick={() => downloadStripped(item)}>Download clean</Button>
										{:else}
											<Button
												variant="ghost"
												size="small"
												disabled={m.stripStatus === 'working'}
												onclick={() => stripMetaItem(item.id)}
											>
												{m.stripStatus === 'working' ? 'Stripping…' : 'Remove metadata'}
											</Button>
										{/if}
									{/if}
									<button class="icon-button" aria-label="Remove" onclick={() => removeItem(item.id)}>×</button>
								</div>
							</div>

							{#if m?.gps}
								<div class="gps-banner">
									<span>
										GPS location embedded: <strong>{m.gps.lat.toFixed(5)}, {m.gps.lon.toFixed(5)}</strong>
									</span>
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL, not an app route -->
									<a href={mapUrl(m.gps)} target="_blank" rel="noreferrer">View on map ↗</a>
								</div>
							{/if}

							{#if m?.showFields && m.fields.length > 0}
								<table class="fields">
									<tbody>
										{#each m.fields as field (field.label)}
											<tr>
												<th>{field.label}</th>
												<td>{field.value}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							{/if}

							{#if m?.stripStatus === 'done' && m.strippedSize !== undefined}
								<p class="strip-result">
									Clean copy ready — {formatBytes(m.strippedSize)}, {formatBytes(m.metadataBytes)} of metadata removed,
									pixels untouched.
								</p>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{:else if mode === 'palette'}
			<section class="controls" aria-label="Palette settings">
				<label>
					<span>Colors — {colorCount}</span>
					<input type="range" min="3" max="10" step="1" bind:value={colorCount} />
				</label>
			</section>

			<section class="results">
				<div class="results-header">
					<p>{items.length} image{items.length === 1 ? '' : 's'}</p>
					<Button variant="ghost" onclick={clearAll}>Clear</Button>
				</div>

				<ul>
					{#each paletteItems as { item, state: p, colors } (item.id)}
						<li>
							<div class="row">
								<img src={item.previewUrl} alt="" />
								<div class="meta">
									<p class="name">{item.file.name}</p>
									{#if !p || p.status === 'reading'}
										<p class="status">Reading…</p>
									{:else if p.status === 'error'}
										<p class="status error">{p.errorMessage}</p>
									{:else}
										<p class="status">{colors.length} colors</p>
									{/if}
								</div>
								<div class="row-actions">
									{#if p?.status === 'ready'}
										<Button variant="ghost" size="small" onclick={() => copyText(cssVariables(colors), `css:${item.id}`)}>
											{copiedKey === `css:${item.id}` ? 'Copied!' : 'Copy as CSS'}
										</Button>
									{/if}
									<button class="icon-button" aria-label="Remove" onclick={() => removeItem(item.id)}>×</button>
								</div>
							</div>

							{#if p?.status === 'ready'}
								<div class="palette">
									{#each colors as color (color.hex)}
										{@const key = `hex:${item.id}:${color.hex}`}
										<button
											class="swatch"
											style:background={color.hex}
											style:color={color.textColor === 'light' ? '#fff' : '#000'}
											onclick={() => copyText(color.hex, key)}
										>
											<span class="pct">{Math.round(color.population * 100)}%</span>
											<span class="hex">{copiedKey === key ? 'Copied!' : color.hex}</span>
											<span class="rgb">rgb({color.rgb.r}, {color.rgb.g}, {color.rgb.b})</span>
										</button>
									{/each}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{:else if mode === 'frame' || mode === 'favicon'}
			{#if items.length > 1}
				<div class="item-picker" role="listbox" aria-label="Choose an image">
					{#each items as item (item.id)}
						<button
							type="button"
							class="picker-thumb"
							class:active={activeItem?.id === item.id}
							role="option"
							aria-selected={activeItem?.id === item.id}
							onclick={() => (activeId = item.id)}
						>
							<img src={item.previewUrl} alt={item.file.name} />
						</button>
					{/each}
				</div>
			{/if}

			{#if bitmapError}
				<p class="error">{bitmapError}</p>
			{:else if !activeBitmap}
				<p class="status">Loading…</p>
			{:else if mode === 'frame'}
				<div class="workspace">
					<div class="stage">
						<canvas bind:this={matCanvasEl} aria-label="Preview of the mounted screenshot"></canvas>
					</div>

					<div class="panel" aria-label="Frame settings">
						<div class="panel-head">
							<p class="file">{activeItem?.file.name}</p>
							<Button variant="ghost" size="small" onclick={resetMat}>Reset</Button>
						</div>

						<fieldset>
							<legend>Background</legend>
							<div class="swatches">
								{#each BACKGROUND_PRESETS as preset (preset.id)}
									<label class="swatch-opt" class:selected={matPresetId === preset.id} title={preset.label}>
										<input type="radio" bind:group={matPresetId} value={preset.id} />
										<span class="chip" style:background={backgroundToCss(preset.background)}></span>
										<span class="swatch-label">{preset.label}</span>
									</label>
								{/each}
								<label class="swatch-opt" class:selected={matPresetId === AUTO_PRESET_ID} title="Derived from the image">
									<input type="radio" bind:group={matPresetId} value={AUTO_PRESET_ID} />
									<span class="chip" style:background={matAutoBackground ? backgroundToCss(matAutoBackground) : 'transparent'}></span>
									<span class="swatch-label">Image</span>
								</label>
								<label class="swatch-opt" class:selected={matPresetId === NONE_PRESET_ID} title="Transparent">
									<input type="radio" bind:group={matPresetId} value={NONE_PRESET_ID} />
									<span class="chip checker"></span>
									<span class="swatch-label">None</span>
								</label>
							</div>
							{#if matPresetId === AUTO_PRESET_ID}
								<p class="note">Built from the most saturated color Darkroom found in the image.</p>
							{/if}
						</fieldset>

						<fieldset class="sliders">
							<legend>Mount</legend>
							<label>
								<span>Padding <em>{matOpts.padding}%</em></span>
								<input type="range" min="0" max="26" step="1" bind:value={matOpts.padding} />
							</label>
							<label>
								<span>Corners <em>{matOpts.radius}</em></span>
								<input type="range" min="0" max="100" step="1" bind:value={matOpts.radius} />
							</label>
							<label>
								<span>Shadow <em>{matOpts.shadow}</em></span>
								<input type="range" min="0" max="100" step="1" bind:value={matOpts.shadow} />
							</label>
						</fieldset>

						<fieldset>
							<legend>Shape</legend>
							<Segmented
								compact
								label="Shape"
								bind:value={matOpts.ratio}
								options={RATIOS.map((ratio) => ({ value: ratio.id, label: ratio.label }))}
							/>
							<p class="note">Frame only ever adds background to reach a shape — it never crops.</p>
						</fieldset>

						<fieldset>
							<legend>Extras</legend>
							<label class="toggle">
								<input type="checkbox" bind:checked={matOpts.frame} />
								<span>Window bar</span>
							</label>
							{#if matOpts.frame}
								<div class="nested">
									<input class="text-input" type="text" placeholder="Title (optional)" maxlength="80" bind:value={matOpts.title} />
									<Segmented
										compact
										label="Frame theme"
										bind:value={matOpts.frameTheme}
										options={[
											{ value: 'light', label: 'Light' },
											{ value: 'dark', label: 'Dark' }
										]}
									/>
								</div>
							{/if}
							<label class="toggle" class:disabled={matPresetId === NONE_PRESET_ID}>
								<input type="checkbox" bind:checked={matOpts.grain} disabled={matPresetId === NONE_PRESET_ID} />
								<span>Grain</span>
							</label>
						</fieldset>
					</div>
				</div>

				<div class="export">
					<div class="export-meta">
						<p>
							{activeBitmap.width} × {activeBitmap.height}
							{#if activeItem}<span class="dim"> · {formatBytes(activeItem.file.size)}</span>{/if}
						</p>
						<p class="dim">Exports at {matExportWidth} × {matExportHeight}</p>
					</div>
					<div class="export-actions">
						<div class="segmented compact">
							{#each matScaleOptions as scale (scale)}
								<label class:selected={matExportScale === scale}>
									<input type="radio" bind:group={matExportScale} value={scale} />
									{scale}×
								</label>
							{/each}
						</div>
						<Button variant="ghost" onclick={copyMatToClipboard}>Copy</Button>
						<Button variant="primary" onclick={downloadMat}>Download PNG</Button>
					</div>
				</div>
				<p class="notice" aria-live="polite">{matNotice ?? ''}</p>
			{:else}
				<div class="workspace">
					<div class="stage">
						<canvas bind:this={crestCanvasEl} aria-label="Preview of the cropped icon"></canvas>
					</div>

					<div class="panel" aria-label="Favicon settings">
						<div class="panel-head">
							<p class="file">{activeItem?.file.name}</p>
						</div>

						<fieldset>
							<legend>Background</legend>
							<Segmented
								compact
								label="Background"
								bind:value={crestBackgroundKind}
								options={[
									{ value: 'transparent', label: 'Transparent' },
									{ value: 'solid', label: 'Solid color' }
								]}
							/>
							{#if crestBackgroundKind === 'solid'}
								<label class="color-field">
									<input type="color" bind:value={crestBackgroundColor} />
									<span>Fill</span>
								</label>
							{:else}
								<p class="note">
									The Apple touch icon gets filled with white regardless — iOS renders transparency as solid black, so
									leaving it transparent there would just look broken.
								</p>
							{/if}
						</fieldset>

						<fieldset class="sliders">
							<legend>Mount</legend>
							<label>
								<span>Padding <em>{crestPadding}%</em></span>
								<input type="range" min="0" max="30" step="1" bind:value={crestPadding} />
							</label>
						</fieldset>

						<label class="field">
							<span>Site name <em class="optional">optional</em></span>
							<input type="text" bind:value={crestSiteName} placeholder="My Site" maxlength="60" />
						</label>
					</div>
				</div>

				<section class="preview-row" aria-label="Where these icons show up">
					<h2>Where it lands</h2>
					<div class="mockups">
						<div class="mockup">
							<div class="browser-chrome">
								<div class="browser-tab">
									{#if crestTabUrl}<img src={crestTabUrl} alt="" width="14" height="14" />{/if}
									<span>{crestSiteName.trim() || 'yoursite.com'}</span>
								</div>
							</div>
							<p class="mockup-label">Browser tab</p>
						</div>
						<div class="mockup">
							<div class="squircle-icon" style:background={crestBackgroundKind === 'solid' ? crestBackgroundColor : '#ffffff'}>
								{#if crestIosUrl}<img src={crestIosUrl} alt="" />{/if}
							</div>
							<p class="mockup-label">Home screen (iOS)</p>
						</div>
						<div class="mockup">
							<div class="circle-icon checker">
								{#if crestAndroidUrl}<img src={crestAndroidUrl} alt="" />{/if}
							</div>
							<p class="mockup-label">Adaptive icon (Android)</p>
						</div>
					</div>
					<p class="note">
						Android's adaptive-icon mask is the strictest of the three — anything outside that circle gets clipped by
						the OS. More padding keeps a mark safe there.
					</p>
				</section>

				<div class="export">
					<div class="file-list">
						<p class="meta">This ZIP contains:</p>
						<ul>
							{#each CREST_FILES as name (name)}
								<li>{name}</li>
							{/each}
						</ul>
					</div>
					<div class="export-actions">
						<Button variant="ghost" onclick={copyCrestSnippet}>{crestNotice ?? 'Copy <head> snippet'}</Button>
						<Button variant="primary" onclick={downloadCrestZip} disabled={crestBuilding}>
							{crestBuilding ? 'Building…' : 'Download ZIP'}
						</Button>
					</div>
				</div>
			{/if}
		{/if}
	{/if}
</div>

<style>
	.page {
		max-width: 62rem;
		margin: 0 auto;
		padding: 0 clamp(1.25rem, 4vw, 3rem) 4rem;
	}

	.mode-row {
		margin: 1.75rem 0 1.5rem;
	}

	.controls {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 1rem;
		margin-bottom: 1.25rem;
		padding: 1.1rem;
		background: var(--bg-elevated);
		border: 2px solid var(--border-strong);
		border-radius: 4px;
	}

	.controls label {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: var(--text-dim);
	}

	.controls label.disabled {
		opacity: 0.45;
	}

	select,
	input[type='range'] {
		accent-color: var(--accent);
	}

	select {
		font: inherit;
		font-size: 0.9rem;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.45rem 0.6rem;
	}

	:global(.estimate-panel) {
		margin-bottom: 1.25rem;
	}

	.estimate-label {
		font-size: 0.82rem;
		color: var(--text-dim);
	}

	.estimate-rows {
		margin-top: 0.75rem;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 0.5rem;
	}

	.estimate-row {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		align-items: flex-start;
		font: inherit;
		text-align: left;
		padding: 0.6rem 0.75rem;
		border: 2px solid var(--border);
		border-radius: 4px;
		background: var(--bg);
		color: var(--text);
		cursor: pointer;
		transition: border-color 0.12s ease;
	}

	.estimate-row:hover {
		border-color: var(--border-strong);
	}

	.estimate-row.active {
		border-color: var(--accent);
	}

	.estimate-name {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-dim);
	}

	.estimate-row.active .estimate-name {
		color: var(--accent);
	}

	.estimate-size {
		font-size: 0.88rem;
	}

	.results-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.results-header p {
		font-size: 0.9rem;
		color: var(--text-dim);
	}

	.saved {
		color: var(--accent);
		font-weight: 600;
	}

	.grown {
		color: var(--text-dim);
		font-weight: 600;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	button.link {
		font: inherit;
		font-size: 0.8rem;
		background: none;
		border: none;
		padding: 0;
		color: var(--text-dim);
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}

	button.link:hover {
		color: var(--text);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	li {
		padding: 0.75rem;
		background: var(--bg-elevated);
		border: 2px solid var(--border);
		border-radius: 4px;
	}

	li:has(> img) {
		display: flex;
		align-items: center;
		gap: 0.9rem;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.9rem;
	}

	li img,
	.row img {
		width: 3rem;
		height: 3rem;
		object-fit: cover;
		border-radius: 4px;
		flex-shrink: 0;
		background: var(--bg);
	}

	.meta {
		flex: 1;
		min-width: 0;
	}

	.name {
		font-size: 0.9rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.status {
		margin-top: 0.15rem;
		font-size: 0.8rem;
		color: var(--text-dim);
	}

	.status.error,
	.error {
		color: var(--accent);
	}

	.error {
		margin-top: 1rem;
		font-size: 0.85rem;
	}

	.row-actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.icon-button {
		width: 1.8rem;
		height: 1.8rem;
		display: grid;
		place-items: center;
		border-radius: 50%;
		border: 1px solid transparent;
		background: transparent;
		color: var(--text-dim);
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
	}

	.icon-button:hover {
		color: var(--text);
		border-color: var(--border);
	}

	.gps-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.7rem;
		padding: 0.55rem 0.8rem;
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
		border-radius: 4px;
		font-size: 0.8rem;
	}

	.gps-banner strong {
		font-family: var(--font-mono);
		font-weight: 600;
	}

	.gps-banner a {
		color: var(--accent);
		font-weight: 600;
		text-decoration: none;
		white-space: nowrap;
	}

	.gps-banner a:hover {
		text-decoration: underline;
	}

	.fields {
		width: 100%;
		margin-top: 0.7rem;
		border-collapse: collapse;
		font-size: 0.8rem;
	}

	.fields th,
	.fields td {
		text-align: left;
		padding: 0.35rem 0.6rem 0.35rem 0;
		border-top: 1px solid var(--border);
		font-weight: 400;
	}

	.fields th {
		color: var(--text-dim);
		white-space: nowrap;
		width: 1%;
	}

	.strip-result {
		margin-top: 0.6rem;
		font-size: 0.8rem;
		color: var(--text-dim);
	}

	.palette {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.swatch {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.15rem;
		padding: 0.6rem 0.65rem;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		text-align: left;
		font: inherit;
	}

	.pct {
		font-size: 0.7rem;
		opacity: 0.75;
	}

	.hex {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.rgb {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		opacity: 0.75;
	}

	.item-picker {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1.25rem;
	}

	.picker-thumb {
		width: 3.5rem;
		height: 3.5rem;
		padding: 0;
		border: 2px solid var(--border);
		border-radius: 4px;
		background: var(--bg-elevated);
		cursor: pointer;
		overflow: hidden;
		transition: border-color 0.12s ease;
	}

	.picker-thumb:hover {
		border-color: var(--border-strong);
	}

	.picker-thumb.active {
		border-color: var(--accent);
	}

	.picker-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.workspace {
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

	.note {
		margin-top: 0.55rem;
		font-size: 0.75rem;
		line-height: 1.4;
		color: var(--text-dim);
	}

	.swatches {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.45rem;
	}

	.swatch-opt {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		cursor: pointer;
	}

	.swatch-opt input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.chip {
		width: 100%;
		aspect-ratio: 1;
		border-radius: 4px;
		border: 1px solid var(--border-strong);
		transition: transform 0.15s ease;
	}

	.swatch-opt:hover .chip {
		transform: translateY(-1px);
	}

	.swatch-opt.selected .chip {
		box-shadow:
			0 0 0 2px var(--bg-elevated),
			0 0 0 4px var(--accent);
	}

	.chip.checker {
		background-color: var(--bg);
		background-image:
			linear-gradient(45deg, var(--border-strong) 25%, transparent 25%),
			linear-gradient(-45deg, var(--border-strong) 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, var(--border-strong) 75%),
			linear-gradient(-45deg, transparent 75%, var(--border-strong) 75%);
		background-size: 10px 10px;
		background-position:
			0 0,
			0 5px,
			5px -5px,
			-5px 0;
	}

	.swatch-label {
		font-size: 0.62rem;
		color: var(--text-dim);
		letter-spacing: 0.01em;
	}

	.swatch-opt.selected .swatch-label {
		color: var(--text);
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
	}

	.segmented {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.segmented label {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		padding: 0.35rem 0.65rem;
		border: 2px solid var(--border-strong);
		border-radius: 3px;
		background: var(--bg-elevated);
		cursor: pointer;
		color: var(--text-dim);
		transition:
			border-color 0.12s ease,
			color 0.12s ease,
			background-color 0.12s ease;
	}

	.segmented label:hover {
		color: var(--text);
	}

	.segmented label.selected {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
	}

	.segmented input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.segmented label:focus-within {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.segmented.compact label {
		padding: 0.3rem 0.55rem;
	}

	.toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.82rem;
		cursor: pointer;
	}

	.toggle + .toggle,
	.nested + .toggle {
		margin-top: 0.6rem;
	}

	.toggle.disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.toggle input {
		accent-color: var(--accent);
	}

	.nested {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.6rem;
		padding-left: 0.9rem;
		border-left: 2px solid var(--border);
	}

	.text-input {
		font: inherit;
		font-size: 0.8rem;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg);
		color: var(--text);
	}

	.text-input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
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

	.export {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 1rem;
		margin-top: 1rem;
		padding: 1rem 1.1rem;
		background: var(--bg-elevated);
		border: 2px solid var(--border-strong);
		border-radius: 4px;
	}

	.export-meta p {
		font-size: 0.85rem;
		font-family: var(--font-mono);
	}

	.export-meta .dim {
		color: var(--text-dim);
		font-size: 0.75rem;
	}

	.export-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.notice {
		min-height: 1.2rem;
		margin-top: 0.6rem;
		text-align: right;
		font-size: 0.78rem;
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
		padding: 0;
		border: 0;
		background: none;
	}
</style>
