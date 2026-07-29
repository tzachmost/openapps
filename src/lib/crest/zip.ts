/**
 * A from-scratch ZIP writer — local file headers, a central directory, and an
 * end-of-central-directory record, per the PKZIP APPNOTE. Every entry uses
 * compression method 0 (store, i.e. no compression): favicon packages are a
 * handful of small PNGs and a couple of text files, so there's nothing worth
 * spending a DEFLATE implementation on, and store keeps this file small and
 * easy to get exactly right. No dependency.
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

	ascii(text: string) {
		for (let i = 0; i < text.length; i++) this.chunks.push(text.charCodeAt(i));
	}

	get length() {
		return this.chunks.length;
	}

	toUint8Array(): Uint8Array<ArrayBuffer> {
		return new Uint8Array(this.chunks);
	}
}

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(data: Uint8Array): number {
	let crc = 0xffffffff;
	for (let i = 0; i < data.length; i++) {
		crc = (CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

// MS-DOS date/time fields ZIP requires per entry — fixed rather than real, since
// nothing reading a favicon package back out cares what it says.
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;

export type ZipEntry = { name: string; data: Uint8Array };

export function buildZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
	const w = new ByteWriter();
	const centralRecords: { offset: number; entry: ZipEntry; crc: number }[] = [];

	for (const entry of entries) {
		const offset = w.length;
		const crc = crc32(entry.data);
		const nameBytes = entry.name;

		w.u32le(0x04034b50);
		w.u16le(20); // version needed
		w.u16le(0); // flags
		w.u16le(0); // compression: store
		w.u16le(DOS_TIME);
		w.u16le(DOS_DATE);
		w.u32le(crc);
		w.u32le(entry.data.length); // compressed size == uncompressed size (store)
		w.u32le(entry.data.length);
		w.u16le(nameBytes.length);
		w.u16le(0); // extra field length
		w.ascii(nameBytes);
		w.bytes(entry.data);

		centralRecords.push({ offset, entry, crc });
	}

	const centralStart = w.length;
	for (const { offset, entry, crc } of centralRecords) {
		w.u32le(0x02014b50);
		w.u16le(20); // version made by
		w.u16le(20); // version needed
		w.u16le(0); // flags
		w.u16le(0); // compression: store
		w.u16le(DOS_TIME);
		w.u16le(DOS_DATE);
		w.u32le(crc);
		w.u32le(entry.data.length);
		w.u32le(entry.data.length);
		w.u16le(entry.name.length);
		w.u16le(0); // extra field length
		w.u16le(0); // comment length
		w.u16le(0); // disk number start
		w.u16le(0); // internal file attributes
		w.u32le(0); // external file attributes
		w.u32le(offset);
		w.ascii(entry.name);
	}
	const centralSize = w.length - centralStart;

	w.u32le(0x06054b50);
	w.u16le(0); // this disk
	w.u16le(0); // disk with central directory
	w.u16le(entries.length);
	w.u16le(entries.length);
	w.u32le(centralSize);
	w.u32le(centralStart);
	w.u16le(0); // comment length

	return w.toUint8Array();
}
