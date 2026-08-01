export type AppMeta = {
	slug: string;
	name: string;
	tagline: string;
	description: string;
	tag: string;
	/** Inline SVG markup, authored in-repo — safe to render with {@html}. */
	icon: string;
};

export const apps: AppMeta[] = [
	{
		slug: 'darkroom',
		name: 'Darkroom',
		tagline: 'Compress, clean, frame, and export any image.',
		description:
			'One shared queue, five things to do with it: shrink and convert, strip hidden EXIF/GPS metadata, pull a color palette, mount a screenshot with a background and shadow, or package a full favicon set. Everything renders on your device, nothing is ever uploaded.',
		tag: 'Images',
		icon: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="4" y="4" width="24" height="24" rx="5" stroke="currentColor" stroke-width="2"/>
			<path d="M8 19.5 13 14.5 17 18.5 20.5 15 24 18.5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
			<circle cx="13.5" cy="11.5" r="1.8" stroke="currentColor" stroke-width="1.6"/>
			<path d="M9 24.5h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
			<circle cx="18" cy="24.5" r="1.6" fill="currentColor"/>
		</svg>`
	},
	{
		slug: 'sift',
		name: 'Sift',
		tagline: 'Format, validate, and diff JSON.',
		description:
			'Paste JSON to pretty-print, validate, and explore it as a collapsible tree with precise error locations — or switch to Diff to compare two versions structurally, key by key. No server round-trip.',
		tag: 'Dev',
		icon: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="4" y="4" width="24" height="24" rx="5" stroke="currentColor" stroke-width="2"/>
			<path d="M13 9c-1.8 0-2.6.9-2.6 2.6v2c0 1-.4 1.4-1.4 1.4.9 0 1.4.4 1.4 1.4v2c0 1.7.8 2.6 2.6 2.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
			<path d="M19 9c1.8 0 2.6.9 2.6 2.6v2c0 1 .4 1.4 1.4 1.4-.9 0-1.4.4-1.4 1.4v2c0 1.7-.8 2.6-2.6 2.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>`
	},
	{
		slug: 'beacon',
		name: 'Beacon',
		tagline: 'Turn text into a QR code, no server involved.',
		description:
			'Type a URL or any text and Beacon builds a scannable QR code for it — a hand-rolled encoder with real Reed–Solomon error correction, pick your error-correction level and colors, then export PNG or SVG.',
		tag: 'Utility',
		icon: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="4" y="4" width="24" height="24" rx="5" stroke="currentColor" stroke-width="2"/>
			<rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.6"/>
			<rect x="18" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.6"/>
			<rect x="9" y="18" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.6"/>
			<rect x="10.6" y="10.6" width="1.8" height="1.8" fill="currentColor"/>
			<rect x="19.6" y="10.6" width="1.8" height="1.8" fill="currentColor"/>
			<rect x="10.6" y="19.6" width="1.8" height="1.8" fill="currentColor"/>
			<rect x="18" y="18" width="2" height="2" fill="currentColor"/>
			<rect x="21.5" y="18" width="2" height="2" fill="currentColor"/>
			<rect x="18" y="21.5" width="2" height="2" fill="currentColor"/>
			<rect x="21.5" y="21.5" width="2" height="2" fill="currentColor"/>
		</svg>`
	},
	{
		slug: 'folio',
		name: 'Folio',
		tagline: 'Markdown, typeset.',
		description:
			'Write Markdown on one side and watch it typeset live on the other, then export a self-contained HTML file or print straight to PDF. Parsed entirely on your device, no dependency.',
		tag: 'Utility',
		icon: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="4" y="4" width="24" height="24" rx="5" stroke="currentColor" stroke-width="2"/>
			<path d="M12 9h6l3 3v11a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
			<path d="M18 9v3h3" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
			<path d="M13.5 16h5M13.5 19h5M13.5 22h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
		</svg>`
	},
	{
		slug: 'loop',
		name: 'Loop',
		tagline: 'Trim a clip into a GIF, frame by frame.',
		description:
			'Drop in a video, mark the part worth keeping, and Loop renders it to an animated GIF — a hand-rolled encoder with real LZW compression and one shared color palette across every frame, built entirely on your device.',
		tag: 'Media',
		icon: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="4" y="4" width="24" height="24" rx="5" stroke="currentColor" stroke-width="2"/>
			<path d="M11 15v-2a3 3 0 0 1 3-3h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
			<path d="M17.3 8 20 10 17.3 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
			<path d="M21 17v2a3 3 0 0 1-3 3h-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
			<path d="M14.7 20 12 22 14.7 24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>`
	},
	{
		slug: 'delta',
		name: 'Delta',
		tagline: 'Compare two versions of any text, line by line.',
		description:
			'Paste or drop two versions of any text or code and Delta computes a real diff — Myers’ algorithm, not a naive comparison — with word-level highlights on changed lines, split or unified view, and an exportable .patch file. No JSON required, unlike Sift.',
		tag: 'Dev',
		icon: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="4" y="4" width="24" height="24" rx="5" stroke="currentColor" stroke-width="2"/>
			<path d="M16 9.5 22 21.5H10L16 9.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
			<path d="M9 24.5h4M19 24.5h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
		</svg>`
	},
	{
		slug: 'seal',
		name: 'Seal',
		tagline: 'Checksum a file or a string, and verify it.',
		description:
			'Compute MD5, SHA-1, SHA-256, SHA-384, and SHA-512 for pasted text or dropped files, check the result against a hash you were given, and spot exact duplicates across a batch — a hand-rolled MD5 alongside the browser’s own SubtleCrypto, all on your device.',
		tag: 'Security',
		icon: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="4" y="4" width="24" height="24" rx="5" stroke="currentColor" stroke-width="2"/>
			<path d="M13 8.5 11 23.5M21 8.5 19 23.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
			<path d="M9 13.5h15.5M8.5 19.5H24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
		</svg>`
	},
	{
		slug: 'prism',
		name: 'Prism',
		tagline: 'Pick a color, or blur a few into a gradient.',
		description:
			'Pick a color to see it in hex, RGB, HSL, HSV, and OKLCH at once, generate a matching harmony, check its WCAG contrast, and preview it under color vision deficiencies — or switch to Gradient and drag colored orbs into a soft, grainy mesh gradient, exported as a PNG or approximate CSS. Hand-rolled OKLab math and colorblindness matrices, all on your device.',
		tag: 'Color',
		icon: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="4" y="4" width="24" height="24" rx="5" stroke="currentColor" stroke-width="2"/>
			<path d="M16 8 22.5 20H9.5L16 8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
			<path d="M16 20v4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
			<path d="M12.5 24.5h-2M17 24.5h2M21.5 24.5h2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
		</svg>`
	},
	{
		slug: 'splice',
		name: 'Splice',
		tagline: 'Trim and fade an audio clip on the waveform.',
		description:
			'Drop in a clip and drag across the waveform to pick a range, fade either edge, nudge the level, then export a clean WAV. Decoded, rendered, and previewed entirely in your browser — nothing is ever uploaded.',
		tag: 'Media',
		icon: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="4" y="4" width="24" height="24" rx="5" stroke="currentColor" stroke-width="2"/>
			<path d="M8 14v4M12 10.5v11M16 8v16M20 10.5v11M24 14v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
		</svg>`
	},
	{
		slug: 'ease',
		name: 'Ease',
		tagline: 'Shape a cubic-bezier curve, feel it move.',
		description:
			'Drag two handles to shape a cubic-bezier easing curve, watch it play on a live preview track, and copy it as CSS, a JS array, or a standalone easing function — with a curated set of named presets to start from.',
		tag: 'Utility',
		icon: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="4" y="4" width="24" height="24" rx="5" stroke="currentColor" stroke-width="2"/>
			<path d="M8 23c5 0 5-13 16-13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
			<circle cx="8" cy="23" r="1.7" fill="currentColor"/>
			<circle cx="24" cy="10" r="1.7" fill="currentColor"/>
		</svg>`
	},
	{
		slug: 'claim',
		name: 'Claim',
		tagline: 'Decode a JWT, read its claims, verify it.',
		description:
			'Paste a token to see its header and claims decoded, a plain-language expiry status, and a signature check against a secret or public key via the browser’s own Web Crypto — or switch to Encode to build and sign a fresh HS256/384/512 token. Nothing leaves your device.',
		tag: 'Dev',
		icon: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="4" y="4" width="24" height="24" rx="5" stroke="currentColor" stroke-width="2"/>
			<circle cx="13" cy="13" r="3.2" stroke="currentColor" stroke-width="1.8"/>
			<path d="M15.5 15.5 23 23M19.3 19.3l2.1 2.1M22 16.6l2.1 2.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>`
	},
	{
		slug: 'meridian',
		name: 'Meridian',
		tagline: 'See what time it is everywhere at once.',
		description:
			'Add the places that matter, then drag across the day to see every clock update together and where the daylight actually overlaps. Your saved timezones stay in this browser — nothing is ever sent anywhere.',
		tag: 'Utility',
		icon: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="4" y="4" width="24" height="24" rx="5" stroke="currentColor" stroke-width="2"/>
			<circle cx="12.5" cy="17" r="5.5" stroke="currentColor" stroke-width="1.8"/>
			<path d="M12.5 13.5V17l2.5 1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
			<circle cx="21" cy="12.5" r="5.5" stroke="currentColor" stroke-width="1.8"/>
			<path d="M21 9V12.5L18.7 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>`
	},
	{
		slug: 'ward',
		name: 'Ward',
		tagline: 'Generate a password or passphrase you can trust.',
		description:
			'Draws a password or a diceware passphrase straight from your browser’s cryptographic randomness — never Math.random, never sent anywhere, never remembered after you leave the page. Shows the real entropy behind it, not just a green bar.',
		tag: 'Security',
		icon: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="4" y="4" width="24" height="24" rx="5" stroke="currentColor" stroke-width="2"/>
			<path d="M13 15.5v-2.3a3 3 0 0 1 6 0v2.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
			<rect x="10" y="15.5" width="12" height="9" rx="2" stroke="currentColor" stroke-width="1.8"/>
			<circle cx="16" cy="19" r="1.3" fill="currentColor"/>
			<path d="M16 20.1v1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
		</svg>`
	}
];
