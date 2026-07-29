/**
 * A from-scratch GIF89a encoder — header, logical screen descriptor, one global
 * color table, a NETSCAPE2.0 application extension for looping, and per-frame
 * graphic control + image descriptor + LZW-compressed indexed pixel data.
 * No dependency; every byte is written by hand against the GIF89a spec.
 */

export type IndexedFrame = {
	/** One palette index per pixel, row-major, length === width * height. */
	indices: Uint8Array;
	/** Hundredths of a second this frame is shown before advancing. */
	delayCs: number;
};

export type GifPalette = { r: number; g: number; b: number }[];

class ByteWriter {
	private chunks: number[] = [];

	u8(byte: number) {
		this.chunks.push(byte & 0xff);
	}

	u16le(value: number) {
		this.u8(value & 0xff);
		this.u8((value >> 8) & 0xff);
	}

	bytes(values: ArrayLike<number>) {
		for (let i = 0; i < values.length; i++) this.chunks.push(values[i] & 0xff);
	}

	ascii(text: string) {
		for (let i = 0; i < text.length; i++) this.chunks.push(text.charCodeAt(i));
	}

	toUint8Array(): Uint8Array<ArrayBuffer> {
		return new Uint8Array(this.chunks);
	}
}

/** Smallest power of two `>= n`, expressed as its base-2 exponent (min 1, so tables are at least 2 colors). */
function paletteBits(colorCount: number): number {
	let bits = 1;
	while (1 << bits < colorCount) bits++;
	return bits;
}

function writeColorTable(w: ByteWriter, palette: GifPalette, bits: number) {
	const size = 1 << bits;
	for (let i = 0; i < size; i++) {
		const c = palette[i] ?? { r: 0, g: 0, b: 0 };
		w.u8(c.r);
		w.u8(c.g);
		w.u8(c.b);
	}
}

/**
 * Variable-code-size LZW, GIF-flavored (LSB-first bit packing, a Clear code
 * and an End-of-Information code interleaved with the color codes, dictionary
 * reset at 4096 entries). Returns the code stream split into sub-blocks of at
 * most 255 bytes, each prefixed with its length, terminated by a zero block —
 * the "data sub-blocks" format the GIF spec uses for every LZW-compressed
 * section.
 */
function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
	const clearCode = 1 << minCodeSize;
	const eoiCode = clearCode + 1;
	const maxCode = 4096;

	let bitBuffer = 0;
	let bitCount = 0;
	const out: number[] = [];

	function emit(code: number, codeSize: number) {
		bitBuffer |= code << bitCount;
		bitCount += codeSize;
		while (bitCount >= 8) {
			out.push(bitBuffer & 0xff);
			bitBuffer >>= 8;
			bitCount -= 8;
		}
	}

	function resetDict(): { table: Map<string, number>; nextCode: number; codeSize: number } {
		const table = new Map<string, number>();
		for (let i = 0; i < clearCode; i++) table.set(String(i), i);
		return { table, nextCode: eoiCode + 1, codeSize: minCodeSize + 1 };
	}

	let { table, nextCode, codeSize } = resetDict();
	emit(clearCode, codeSize);

	let prefix = indices.length > 0 ? String(indices[0]) : '';
	for (let i = 1; i < indices.length; i++) {
		const k = indices[i];
		const candidate = prefix + ',' + k;
		if (table.has(candidate)) {
			prefix = candidate;
			continue;
		}
		emit(table.get(prefix)!, codeSize);
		if (nextCode < maxCode) {
			table.set(candidate, nextCode);
			nextCode++;
			// Code size must grow the moment nextCode needs one more bit — before
			// the encoder ever emits a code that wide, per the GIF spec's decoder
			// expectations.
			if (nextCode > 1 << codeSize && codeSize < 12) codeSize++;
		} else {
			emit(clearCode, codeSize);
			({ table, nextCode, codeSize } = resetDict());
		}
		prefix = String(k);
	}
	if (indices.length > 0) emit(table.get(prefix)!, codeSize);
	emit(eoiCode, codeSize);
	if (bitCount > 0) out.push(bitBuffer & 0xff);

	const blocks: number[] = [];
	for (let offset = 0; offset < out.length; offset += 255) {
		const slice = out.slice(offset, offset + 255);
		blocks.push(slice.length, ...slice);
	}
	blocks.push(0);
	return new Uint8Array(blocks);
}

export type EncodeGifOptions = {
	width: number;
	height: number;
	palette: GifPalette;
	frames: IndexedFrame[];
	/** 0 = loop forever (the GIF convention), matching how browsers treat it. */
	loopCount?: number;
};

export function encodeGif(opts: EncodeGifOptions): Uint8Array<ArrayBuffer> {
	const { width, height, palette, frames } = opts;
	const loopCount = opts.loopCount ?? 0;
	const bits = Math.max(1, paletteBits(Math.max(palette.length, 1)));

	const w = new ByteWriter();
	w.ascii('GIF89a');

	// Logical screen descriptor: canvas size, a global color table flag + color
	// resolution + size packed into one byte, background color index, no pixel
	// aspect ratio correction.
	w.u16le(width);
	w.u16le(height);
	const gctFlag = 0x80;
	const colorResolution = (bits - 1) << 4;
	const gctSizeField = bits - 1;
	w.u8(gctFlag | colorResolution | gctSizeField);
	w.u8(0);
	w.u8(0);
	writeColorTable(w, palette, bits);

	// NETSCAPE2.0 application extension — the de facto standard every browser
	// reads for "how many times should this animation loop".
	w.u8(0x21);
	w.u8(0xff);
	w.u8(11);
	w.ascii('NETSCAPE2.0');
	w.u8(3);
	w.u8(1);
	w.u16le(loopCount);
	w.u8(0);

	const minCodeSize = Math.max(2, bits);

	for (const frame of frames) {
		// Graphic control extension: disposal method 1 (leave in place — each
		// frame in this tool is a full replacement anyway), no transparency, the
		// frame's own delay.
		w.u8(0x21);
		w.u8(0xf9);
		w.u8(4);
		w.u8(0x04);
		w.u16le(frame.delayCs);
		w.u8(0);
		w.u8(0);

		// Image descriptor: full-canvas frame, no local color table.
		w.u8(0x2c);
		w.u16le(0);
		w.u16le(0);
		w.u16le(width);
		w.u16le(height);
		w.u8(0);

		w.u8(minCodeSize);
		w.bytes(lzwEncode(frame.indices, minCodeSize));
	}

	w.u8(0x3b);
	return w.toUint8Array();
}
