import { buildIco } from './ico';
import { renderIconPng, opaqueFallback, type Background, type IconOptions } from './render';

export type CrestSettings = {
	background: Background;
	padding: number;
	siteName: string;
	themeColor: string;
};

export type PackagedFile = { name: string; data: Uint8Array };

export async function buildCrestPackage(
	bitmap: ImageBitmap,
	settings: CrestSettings
): Promise<PackagedFile[]> {
	const opts: IconOptions = { background: settings.background, padding: settings.padding };
	const opaqueOpts = opaqueFallback(opts);

	const [ico16, ico32, ico48, png16, png32, appleTouch, android192, android512] = await Promise.all(
		[
			renderIconPng(bitmap, 16, opts),
			renderIconPng(bitmap, 32, opts),
			renderIconPng(bitmap, 48, opts),
			renderIconPng(bitmap, 16, opts),
			renderIconPng(bitmap, 32, opts),
			renderIconPng(bitmap, 180, opaqueOpts),
			renderIconPng(bitmap, 192, opts),
			renderIconPng(bitmap, 512, opts)
		]
	);

	const name = settings.siteName.trim();
	const manifest = {
		name: name || undefined,
		short_name: name || undefined,
		icons: [
			{ src: 'android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
			{ src: 'android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }
		],
		theme_color: settings.themeColor,
		background_color: settings.themeColor,
		display: 'standalone'
	};

	const encoder = new TextEncoder();
	const favicons = [
		{ size: 16, png: ico16 },
		{ size: 32, png: ico32 },
		{ size: 48, png: ico48 }
	];
	return [
		{ name: 'favicon.ico', data: buildIco(favicons) },
		{ name: 'favicon-16x16.png', data: png16 },
		{ name: 'favicon-32x32.png', data: png32 },
		{ name: 'apple-touch-icon.png', data: appleTouch },
		{ name: 'android-chrome-192x192.png', data: android192 },
		{ name: 'android-chrome-512x512.png', data: android512 },
		{ name: 'site.webmanifest', data: encoder.encode(JSON.stringify(manifest, null, 2)) },
		{ name: 'head-snippet.txt', data: encoder.encode(headSnippet(settings.themeColor)) }
	];
}

export function headSnippet(themeColor: string): string {
	return `<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon-16x16.png" sizes="16x16" type="image/png">
<link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="${themeColor}">`;
}
