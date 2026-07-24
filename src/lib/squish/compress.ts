export type OutputFormat = 'auto' | 'image/jpeg' | 'image/webp' | 'image/png';

export type CompressOptions = {
	format: OutputFormat;
	quality: number;
	maxDimension: number | null;
};

export type CompressResult = {
	blob: Blob;
	url: string;
	width: number;
	height: number;
};

const SUPPORTED_AUTO_TYPES = new Set(['image/jpeg', 'image/webp', 'image/png']);

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB'];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function targetDimensions(
	width: number,
	height: number,
	maxDimension: number | null
): { width: number; height: number } {
	if (!maxDimension || (width <= maxDimension && height <= maxDimension)) {
		return { width, height };
	}
	const scale = maxDimension / Math.max(width, height);
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale))
	};
}

export function resolveFormat(sourceType: string, format: OutputFormat): string {
	if (format !== 'auto') return format;
	return SUPPORTED_AUTO_TYPES.has(sourceType) ? sourceType : 'image/png';
}

export function extensionFor(mimeType: string): string {
	switch (mimeType) {
		case 'image/jpeg':
			return 'jpg';
		case 'image/webp':
			return 'webp';
		default:
			return 'png';
	}
}

export async function compressImage(file: File, options: CompressOptions): Promise<CompressResult> {
	const bitmap = await createImageBitmap(file);
	const { width, height } = targetDimensions(bitmap.width, bitmap.height, options.maxDimension);
	const mimeType = resolveFormat(file.type, options.format);

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas is not supported in this browser.');

	if (mimeType === 'image/jpeg') {
		// JPEG has no alpha channel — flatten onto white so transparency doesn't turn black.
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, width, height);
	}
	ctx.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();

	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, mimeType, options.quality)
	);
	if (!blob) throw new Error('This browser could not encode that image format.');

	return { blob, url: URL.createObjectURL(blob), width, height };
}
