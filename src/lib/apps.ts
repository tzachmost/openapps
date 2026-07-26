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
		slug: 'squish',
		name: 'Squish',
		tagline: 'Shrink photos without leaving your browser.',
		description:
			'Drag in a batch of images, pick a format and quality, and Squish resizes and compresses everything on your device. Nothing is ever uploaded.',
		tag: 'Images',
		icon: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="4" y="4" width="24" height="24" rx="5" stroke="currentColor" stroke-width="2"/>
			<path d="M4 21.5 11 14.5 16.5 20 21 15.5 28 22.5" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
			<circle cx="11.5" cy="11.5" r="2.25" stroke="currentColor" stroke-width="2"/>
		</svg>`
	},
	{
		slug: 'bare',
		name: 'Bare',
		tagline: 'See what a photo reveals, then strip it out.',
		description:
			'Every JPEG carries hidden metadata — camera model, timestamps, sometimes an exact GPS location. Bare shows you what is embedded, then removes it byte-for-byte with no re-encoding and no quality loss.',
		tag: 'Privacy',
		icon: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="4" y="4" width="24" height="24" rx="5" stroke="currentColor" stroke-width="2"/>
			<path d="M16 9.5c-2.6 0-4.6 2-4.6 4.5 0 3 4.6 8 4.6 8s4.6-5 4.6-8c0-2.5-2-4.5-4.6-4.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
			<circle cx="16" cy="14" r="1.4" fill="currentColor"/>
			<path d="M7 25 25 9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
		</svg>`
	},
	{
		slug: 'swatch',
		name: 'Swatch',
		tagline: 'Pull a color palette out of any image.',
		description:
			'Drop in a photo and Swatch reads its dominant colors straight off the pixels using median-cut quantization — hex, RGB, and HSL, one click to copy, no AI involved.',
		tag: 'Design',
		icon: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="4" y="4" width="24" height="24" rx="5" stroke="currentColor" stroke-width="2"/>
			<path d="M20.5 9.5 22.5 11.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
			<path d="M19 11 12 18v3h3l7-7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
			<circle cx="11.5" cy="22.5" r="1.5" fill="currentColor"/>
		</svg>`
	},
	{
		slug: 'mat',
		name: 'Mat',
		tagline: 'Give a screenshot room to breathe.',
		description:
			'Mount a screenshot on a background with padding, rounded corners, and a soft shadow — or let Mat build a gradient out of the image’s own colors. Renders to PNG on your device.',
		tag: 'Design',
		icon: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="4" y="4" width="24" height="24" rx="5" stroke="currentColor" stroke-width="2"/>
			<rect x="10" y="10" width="12" height="12" rx="2.5" stroke="currentColor" stroke-width="2"/>
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
		slug: 'folio',
		name: 'Folio',
		tagline: 'Markdown, typeset.',
		description:
			'Write Markdown on one side and watch it typeset live on the other, then export a self-contained HTML file or print straight to PDF. Parsed entirely on your device, no dependency.',
		tag: 'Docs',
		icon: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="4" y="4" width="24" height="24" rx="5" stroke="currentColor" stroke-width="2"/>
			<path d="M12 9h6l3 3v11a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
			<path d="M18 9v3h3" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
			<path d="M13.5 16h5M13.5 19h5M13.5 22h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
		</svg>`
	}
];
