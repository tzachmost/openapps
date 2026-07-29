/**
 * A from-scratch ICO writer. Modern Windows (Vista+) and every browser that
 * still reads `favicon.ico` accept a plain PNG stream as an ICO image entry —
 * no BMP/AND-mask encoding needed — so this is just the ICONDIR + ICONDIRENTRY
 * table wrapped around PNG bytes the canvas already produced. No dependency.
 */

class ByteWriter {
	private chunks: number[] = [];

	u8(byte: number) {
		this.chunks.push(byte & 0xff);
	}

	u16le(value: number) {
		this.u8(value & 0xff);
		this.u8((value >> 8) & 0xff);
	}

	u32le(value: number) {
		this.u16le(value & 0xffff);
		this.u16le((value >>> 16) & 0xffff);
	}

	bytes(values: ArrayLike<number>) {
		for (let i = 0; i < values.length; i++) this.chunks.push(values[i] & 0xff);
	}

	get length() {
		return this.chunks.length;
	}

	toUint8Array(): Uint8Array<ArrayBuffer> {
		return new Uint8Array(this.chunks);
	}
}

export type IcoImage = { size: number; png: Uint8Array };

/** `size` must be 1–256; the ICO directory entry field is a single byte, where 0 means 256. */
export function buildIco(images: IcoImage[]): Uint8Array<ArrayBuffer> {
	const w = new ByteWriter();

	// ICONDIR: reserved, type (1 = icon), image count.
	w.u16le(0);
	w.u16le(1);
	w.u16le(images.length);

	const headerSize = 6 + images.length * 16;
	let offset = headerSize;
	for (const { size, png } of images) {
		// ICONDIRENTRY: width, height, palette color count (0 = no palette,
		// i.e. >=8bpp), reserved, color planes, bits per pixel, byte size, offset.
		w.u8(size >= 256 ? 0 : size);
		w.u8(size >= 256 ? 0 : size);
		w.u8(0);
		w.u8(0);
		w.u16le(1);
		w.u16le(32);
		w.u32le(png.length);
		w.u32le(offset);
		offset += png.length;
	}
	for (const { png } of images) w.bytes(png);

	return w.toUint8Array();
}
