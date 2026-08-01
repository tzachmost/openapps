import { apps, type AppMeta } from './apps';

export type FileMatch = {
	/** Human label for what was detected, e.g. "JPEG image". */
	category: string;
	apps: AppMeta[];
};

function bySlug(slugs: string[]): AppMeta[] {
	return slugs
		.map((slug) => apps.find((a) => a.slug === slug))
		.filter((a): a is AppMeta => Boolean(a));
}

function extOf(name: string): string {
	const dot = name.lastIndexOf('.');
	return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

const JPEG_EXT = new Set(['jpg', 'jpeg', 'jpe']);
const IMAGE_EXT = new Set([
	'png',
	'webp',
	'gif',
	'bmp',
	'avif',
	'svg',
	'heic',
	'heif',
	'tif',
	'tiff'
]);
const JSON_EXT = new Set(['json']);
const MARKDOWN_EXT = new Set(['md', 'markdown']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac', 'weba']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v']);
const TEXT_EXT = new Set([
	'txt',
	'js',
	'ts',
	'jsx',
	'tsx',
	'css',
	'html',
	'py',
	'yml',
	'yaml',
	'csv',
	'xml',
	'sh',
	'rb',
	'go',
	'rs',
	'java',
	'c',
	'cpp',
	'h',
	'svelte',
	'log'
]);

/**
 * Matches a dropped file to the tools that actually accept it — cross-referenced against each
 * tool's real `accept` attribute (`src/routes/apps/*`), not guessed. Extension-first (matches
 * how the tools' own file inputs mostly work), falling back to the browser-reported MIME type
 * when there's no recognized extension. Order within each match is deliberate: the most
 * specific/most relevant tool for that file first.
 */
export function matchToolsForFile(file: File): FileMatch | null {
	const ext = extOf(file.name);
	const mime = file.type;

	if (JPEG_EXT.has(ext) || mime === 'image/jpeg') {
		return { category: 'JPEG image', apps: bySlug(['bare', 'squish', 'swatch', 'mat', 'crest']) };
	}
	if (IMAGE_EXT.has(ext) || mime.startsWith('image/')) {
		return { category: 'Image', apps: bySlug(['squish', 'swatch', 'mat', 'crest']) };
	}
	if (JSON_EXT.has(ext) || mime === 'application/json') {
		return { category: 'JSON', apps: bySlug(['sift', 'delta']) };
	}
	if (MARKDOWN_EXT.has(ext)) {
		return { category: 'Markdown', apps: bySlug(['folio', 'delta']) };
	}
	if (AUDIO_EXT.has(ext) || mime.startsWith('audio/')) {
		return { category: 'Audio', apps: bySlug(['splice']) };
	}
	if (VIDEO_EXT.has(ext) || mime.startsWith('video/')) {
		return { category: 'Video', apps: bySlug(['loop']) };
	}
	if (TEXT_EXT.has(ext) || mime.startsWith('text/')) {
		return { category: 'Text', apps: bySlug(['delta']) };
	}
	return null;
}
