export type MetadataField = { label: string; value: string };

export type ParsedMetadata = {
	isJpeg: boolean;
	fields: MetadataField[];
	gps?: { lat: number; lon: number };
	metadataBytes: number;
};

export type StripResult = { blob: Blob; removedBytes: number };

const TYPE_SIZES: Record<number, number> = {
	1: 1,
	2: 1,
	3: 2,
	4: 4,
	5: 8,
	6: 1,
	7: 1,
	8: 2,
	9: 4,
	10: 8,
	11: 4,
	12: 8
};

const TAG_NAMES_IFD0: Record<number, string> = {
	0x010f: 'Make',
	0x0110: 'Model',
	0x0112: 'Orientation',
	0x0131: 'Software',
	0x0132: 'Date modified'
};

const TAG_NAMES_EXIF: Record<number, string> = {
	0x9003: 'Date taken',
	0x829a: 'Exposure time',
	0x829d: 'Aperture',
	0x8827: 'ISO',
	0x920a: 'Focal length',
	0xa434: 'Lens'
};

const ORIENTATION_LABELS: Record<number, string> = {
	1: 'Normal',
	2: 'Flipped horizontally',
	3: 'Rotated 180°',
	4: 'Flipped vertically',
	5: 'Rotated 90° CW + flipped',
	6: 'Rotated 90° CW',
	7: 'Rotated 90° CCW + flipped',
	8: 'Rotated 90° CCW'
};

type IfdEntry = { tag: number; type: number; count: number; rawOffset: number };

function readAscii(view: DataView, offset: number, length: number): string {
	let str = '';
	for (let i = 0; i < length; i++) str += String.fromCharCode(view.getUint8(offset + i));
	return str;
}

function readIFD(view: DataView, tiffStart: number, ifdOffset: number, littleEndian: boolean) {
	const entries: IfdEntry[] = [];
	const base = tiffStart + ifdOffset;
	if (base + 2 > view.byteLength) return { entries };
	const numEntries = view.getUint16(base, littleEndian);
	for (let i = 0; i < numEntries; i++) {
		const entryOffset = base + 2 + i * 12;
		if (entryOffset + 12 > view.byteLength) break;
		entries.push({
			tag: view.getUint16(entryOffset, littleEndian),
			type: view.getUint16(entryOffset + 2, littleEndian),
			count: view.getUint32(entryOffset + 4, littleEndian),
			rawOffset: entryOffset + 8
		});
	}
	return { entries };
}

function readValues(
	view: DataView,
	tiffStart: number,
	entry: IfdEntry,
	littleEndian: boolean
): number[] | string {
	const size = (TYPE_SIZES[entry.type] ?? 1) * entry.count;
	const offset =
		size <= 4 ? entry.rawOffset : tiffStart + view.getUint32(entry.rawOffset, littleEndian);
	if (offset + size > view.byteLength || entry.count === 0) return entry.type === 2 ? '' : [];

	if (entry.type === 2) {
		let str = '';
		for (let i = 0; i < entry.count; i++) {
			const code = view.getUint8(offset + i);
			if (code === 0) break;
			str += String.fromCharCode(code);
		}
		return str;
	}

	const values: number[] = [];
	for (let i = 0; i < entry.count; i++) {
		switch (entry.type) {
			case 1:
			case 6:
				values.push(view.getUint8(offset + i));
				break;
			case 3:
				values.push(view.getUint16(offset + i * 2, littleEndian));
				break;
			case 4:
				values.push(view.getUint32(offset + i * 4, littleEndian));
				break;
			case 8:
				values.push(view.getInt16(offset + i * 2, littleEndian));
				break;
			case 9:
				values.push(view.getInt32(offset + i * 4, littleEndian));
				break;
			case 5: {
				const num = view.getUint32(offset + i * 8, littleEndian);
				const den = view.getUint32(offset + i * 8 + 4, littleEndian);
				values.push(den === 0 ? 0 : num / den);
				break;
			}
			case 10: {
				const num = view.getInt32(offset + i * 8, littleEndian);
				const den = view.getInt32(offset + i * 8 + 4, littleEndian);
				values.push(den === 0 ? 0 : num / den);
				break;
			}
			default:
				values.push(0);
		}
	}
	return values;
}

function formatValue(tag: number, values: number[] | string): string {
	if (typeof values === 'string') {
		const str = values.trim();
		if ((tag === 0x9003 || tag === 0x0132) && /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
			return str.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
		}
		return str;
	}
	if (values.length === 0) return '';
	switch (tag) {
		case 0x0112:
			return ORIENTATION_LABELS[values[0]] ?? `Value ${values[0]}`;
		case 0x829a: {
			const seconds = values[0];
			return seconds >= 1 ? `${seconds}s` : `1/${Math.round(1 / seconds)}s`;
		}
		case 0x829d:
			return `f/${values[0].toFixed(1)}`;
		case 0x920a:
			return `${values[0].toFixed(1)}mm`;
		case 0x8827:
			return `ISO ${values[0]}`;
		default:
			return values.join(', ');
	}
}

function addField(
	fields: MetadataField[],
	tagNames: Record<number, string>,
	entry: IfdEntry,
	view: DataView,
	tiffStart: number,
	littleEndian: boolean
) {
	const name = tagNames[entry.tag];
	if (!name) return;
	const formatted = formatValue(entry.tag, readValues(view, tiffStart, entry, littleEndian));
	if (formatted) fields.push({ label: name, value: formatted });
}

function gpsToDecimal(dms: number[] | undefined, ref: string | undefined): number | undefined {
	if (!dms || dms.length < 3 || !ref) return undefined;
	const degrees = dms[0] + dms[1] / 60 + dms[2] / 3600;
	return ref === 'S' || ref === 'W' ? -degrees : degrees;
}

function parseExifBlock(
	view: DataView,
	tiffStart: number,
	fields: MetadataField[],
	setGps: (gps: { lat: number; lon: number }) => void
) {
	if (tiffStart + 8 > view.byteLength) return;
	const byteOrderMark = readAscii(view, tiffStart, 2);
	if (byteOrderMark !== 'II' && byteOrderMark !== 'MM') return;
	const littleEndian = byteOrderMark === 'II';
	if (view.getUint16(tiffStart + 2, littleEndian) !== 42) return;
	const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian);

	let exifIfdOffset: number | undefined;
	let gpsIfdOffset: number | undefined;

	const ifd0 = readIFD(view, tiffStart, ifd0Offset, littleEndian);
	for (const entry of ifd0.entries) {
		if (entry.tag === 0x8769) {
			exifIfdOffset = (readValues(view, tiffStart, entry, littleEndian) as number[])[0];
			continue;
		}
		if (entry.tag === 0x8825) {
			gpsIfdOffset = (readValues(view, tiffStart, entry, littleEndian) as number[])[0];
			continue;
		}
		addField(fields, TAG_NAMES_IFD0, entry, view, tiffStart, littleEndian);
	}

	if (exifIfdOffset !== undefined) {
		const exifIfd = readIFD(view, tiffStart, exifIfdOffset, littleEndian);
		for (const entry of exifIfd.entries) {
			addField(fields, TAG_NAMES_EXIF, entry, view, tiffStart, littleEndian);
		}
	}

	if (gpsIfdOffset !== undefined) {
		const gpsIfd = readIFD(view, tiffStart, gpsIfdOffset, littleEndian);
		const raw: Record<number, number[] | string> = {};
		for (const entry of gpsIfd.entries)
			raw[entry.tag] = readValues(view, tiffStart, entry, littleEndian);
		const lat = gpsToDecimal(raw[2] as number[] | undefined, raw[1] as string | undefined);
		const lon = gpsToDecimal(raw[4] as number[] | undefined, raw[3] as string | undefined);
		if (lat !== undefined && lon !== undefined && Number.isFinite(lat) && Number.isFinite(lon)) {
			setGps({ lat, lon });
		}
	}
}

/** Reads the EXIF/GPS metadata embedded in a JPEG without touching pixel data. */
export function parseJpegMetadata(buffer: ArrayBuffer): ParsedMetadata {
	const view = new DataView(buffer);
	if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) {
		return { isJpeg: false, fields: [], metadataBytes: 0 };
	}

	const fields: MetadataField[] = [];
	let gps: { lat: number; lon: number } | undefined;
	let metadataBytes = 0;
	let offset = 2;

	while (offset + 4 <= view.byteLength) {
		if (view.getUint8(offset) !== 0xff) break;
		const marker = view.getUint8(offset + 1);
		if (marker === 0xd9 || marker === 0xda) break;
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			offset += 2;
			continue;
		}
		const length = view.getUint16(offset + 2);
		const isMetadataSegment = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
		if (isMetadataSegment) metadataBytes += 2 + length;

		if (marker === 0xe1 && readAscii(view, offset + 4, 4) === 'Exif') {
			parseExifBlock(view, offset + 4 + 6, fields, (g) => (gps = g));
		}
		offset += 2 + length;
	}

	if (gps) {
		fields.unshift({
			label: 'GPS location',
			value: `${gps.lat.toFixed(6)}, ${gps.lon.toFixed(6)}`
		});
	}

	return { isJpeg: true, fields, gps, metadataBytes };
}

/**
 * Removes every APPn/COM segment (EXIF, GPS, XMP, thumbnails, comments) from a JPEG
 * by rewriting the segment structure directly — the compressed pixel data is copied
 * through untouched, so there is no quality loss, unlike re-encoding through a canvas.
 */
export async function stripJpegMetadata(file: File): Promise<StripResult> {
	const buffer = await file.arrayBuffer();
	const view = new DataView(buffer);
	if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) {
		throw new Error('Not a JPEG file.');
	}

	const chunks: Uint8Array[] = [new Uint8Array(buffer, 0, 2)];
	let offset = 2;
	let removedBytes = 0;

	while (offset < view.byteLength) {
		if (view.getUint8(offset) !== 0xff) throw new Error('Malformed JPEG data.');
		const marker = view.getUint8(offset + 1);

		if (marker === 0xd9) {
			chunks.push(new Uint8Array(buffer, offset, 2));
			break;
		}
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			chunks.push(new Uint8Array(buffer, offset, 2));
			offset += 2;
			continue;
		}

		const length = view.getUint16(offset + 2);

		if (marker === 0xda) {
			// Scan header, then every remaining byte verbatim — no more markers to inspect.
			chunks.push(new Uint8Array(buffer, offset, 2 + length));
			chunks.push(new Uint8Array(buffer, offset + 2 + length));
			break;
		}

		const isMetadataSegment = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
		if (isMetadataSegment) {
			removedBytes += 2 + length;
		} else {
			chunks.push(new Uint8Array(buffer, offset, 2 + length));
		}
		offset += 2 + length;
	}

	const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const out = new Uint8Array(totalLength);
	let pos = 0;
	for (const chunk of chunks) {
		out.set(chunk, pos);
		pos += chunk.length;
	}

	return { blob: new Blob([out], { type: 'image/jpeg' }), removedBytes };
}
