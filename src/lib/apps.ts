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
	}
];
