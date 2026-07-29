/**
 * A from-scratch QR Code (Model 2) encoder — no dependency.
 *
 * Implements the parts of ISO/IEC 18004 needed to go from text to a scannable
 * matrix: mode selection (numeric/alphanumeric/byte, single segment — this
 * does not do the multi-segment optimization real-world encoders use, so a
 * string like "AB12cd" encodes entirely as byte mode rather than splitting
 * into alphanumeric+byte segments; slightly less dense, still fully valid),
 * Reed–Solomon error correction over GF(256), and module placement (finder/
 * timing/alignment patterns, data zigzag, all 8 masks scored and the best
 * picked). Format and version information use the standard 15-bit/18-bit
 * lookup tables rather than re-deriving the BCH codes at runtime — there are
 * only 32 and 34 of them respectively, so a table is both simpler and less
 * risky than a generic BCH implementation.
 */

export type EcLevel = 'L' | 'M' | 'Q' | 'H';

export type QrMatrix = {
	ok: true;
	size: number;
	version: number;
	ecLevel: EcLevel;
	/** modules[row][col] — true = dark */
	modules: boolean[][];
};

const MODE_NUMERIC = 0b0001;
const MODE_ALPHANUMERIC = 0b0010;
const MODE_BYTE = 0b0100;

const ALPHANUMERIC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

type Mode = 'numeric' | 'alphanumeric' | 'byte';

function detectMode(text: string): Mode {
	if (/^[0-9]*$/.test(text)) return 'numeric';
	if (/^[0-9A-Z $%*+\-./:]*$/.test(text)) return 'alphanumeric';
	return 'byte';
}

function charCountBits(version: number, mode: Mode): number {
	const tier = version <= 9 ? 0 : version <= 26 ? 1 : 2;
	if (mode === 'numeric') return [10, 12, 14][tier];
	if (mode === 'alphanumeric') return [9, 11, 13][tier];
	return [8, 16, 16][tier];
}

/** Per-(version, EC level): total data codewords and the block layout used to split them for Reed–Solomon. */
type EcBlockInfo = {
	totalDataCodewords: number;
	ecCodewordsPerBlock: number;
	group1Blocks: number;
	group1Count: number;
	group2Blocks: number;
	group2Count: number;
};

// prettier-ignore
const EC_TABLE: Record<EcLevel, EcBlockInfo[]> = {
	// index 0 unused, versions 1-40 at index 1-40. [total, ecPerBlock, g1blocks, g1count, g2blocks, g2count]
	L: raw([
		[19,7,1,19,0,0],[34,10,1,34,0,0],[55,15,1,55,0,0],[80,20,1,80,0,0],[108,26,1,108,0,0],
		[136,18,2,68,0,0],[156,20,2,78,0,0],[194,24,2,97,0,0],[232,30,2,116,0,0],[274,18,2,68,2,69],
		[324,20,4,81,0,0],[370,24,2,92,2,93],[428,26,4,107,0,0],[461,30,3,115,1,116],[523,22,5,87,1,88],
		[589,24,5,98,1,99],[647,28,1,107,5,108],[721,30,5,120,1,121],[795,28,3,113,4,114],[861,28,3,107,5,108],
		[932,28,4,116,4,117],[1006,28,2,111,7,112],[1094,30,4,121,5,122],[1174,30,6,117,4,118],[1276,26,8,106,4,107],
		[1370,28,10,114,2,115],[1468,30,8,122,4,123],[1531,30,3,117,10,118],[1631,30,7,116,7,117],[1735,30,5,115,10,116],
		[1843,30,13,115,3,116],[1955,30,17,115,0,0],[2071,30,17,115,1,116],[2191,30,13,115,6,116],[2306,30,12,121,7,122],
		[2434,30,6,121,14,122],[2566,30,17,122,4,123],[2702,30,4,122,18,123],[2812,30,20,117,4,118],[2956,30,19,118,6,119]
	]),
	M: raw([
		[16,10,1,16,0,0],[28,16,1,28,0,0],[44,26,1,44,0,0],[64,18,2,32,0,0],[86,24,2,43,0,0],
		[108,16,4,27,0,0],[124,18,4,31,0,0],[154,22,2,38,2,39],[182,22,3,36,2,37],[216,26,4,43,1,44],
		[254,30,1,50,4,51],[290,22,6,36,2,37],[334,22,8,37,1,38],[365,24,4,40,5,41],[415,24,5,41,5,42],
		[453,28,7,45,3,46],[507,28,10,46,1,47],[563,26,9,43,4,44],[627,26,3,44,11,45],[669,26,3,41,13,42],
		[714,26,17,42,0,0],[782,28,17,46,0,0],[860,28,4,47,14,48],[914,28,6,45,14,46],[1000,28,8,47,13,48],
		[1062,28,19,46,4,47],[1128,28,22,45,3,46],[1193,28,3,45,23,46],[1267,28,21,45,7,46],[1373,28,19,47,10,48],
		[1455,28,2,46,29,47],[1541,28,10,46,23,47],[1631,28,14,46,21,47],[1725,28,14,46,23,47],[1812,28,12,47,26,48],
		[1914,28,6,47,34,48],[1992,28,29,46,14,47],[2102,28,13,46,32,47],[2216,28,40,47,7,48],[2334,28,18,47,31,48]
	]),
	Q: raw([
		[13,13,1,13,0,0],[22,22,1,22,0,0],[34,18,2,17,0,0],[48,26,2,24,0,0],[62,18,2,15,2,16],
		[76,24,4,19,0,0],[88,18,2,14,4,15],[110,22,4,18,2,19],[132,20,4,16,4,17],[154,24,6,19,2,20],
		[180,28,4,22,4,23],[206,26,4,20,6,21],[244,24,8,20,4,21],[261,20,11,16,5,17],[295,30,5,24,7,25],
		[325,24,15,19,2,20],[367,28,1,22,15,23],[397,28,17,22,1,23],[445,26,17,21,4,22],[485,30,15,24,5,25],
		[512,28,17,22,6,23],[568,30,7,24,16,25],[614,30,11,24,14,25],[664,30,11,24,16,25],[718,30,7,24,22,25],
		[754,28,28,22,6,23],[808,30,8,23,26,24],[871,30,4,24,31,25],[911,30,1,23,37,24],[985,30,15,24,25,25],
		[1033,30,42,24,1,25],[1115,30,10,24,35,25],[1171,30,29,24,19,25],[1231,30,44,24,7,25],[1286,30,39,24,14,25],
		[1354,30,46,24,10,25],[1426,30,49,24,10,25],[1502,30,48,24,14,25],[1582,30,43,24,22,25],[1666,30,34,24,34,25]
	]),
	H: raw([
		[9,17,1,9,0,0],[16,28,1,16,0,0],[26,22,2,13,0,0],[36,16,4,9,0,0],[46,22,2,11,2,12],
		[60,28,4,15,0,0],[66,26,4,13,1,14],[86,26,4,14,2,15],[100,24,4,12,4,13],[122,28,6,15,2,16],
		[140,24,3,12,8,13],[158,28,7,14,4,15],[180,22,12,11,4,12],[197,24,11,12,5,13],[223,24,11,12,7,13],
		[253,30,3,15,13,16],[283,28,2,14,17,15],[313,28,2,14,19,15],[341,26,9,13,16,14],[385,28,15,15,10,16],
		[406,30,19,16,6,17],[442,24,34,13,0,0],[464,30,16,15,14,16],[514,30,30,16,2,17],[538,30,22,15,13,16],
		[596,30,33,16,4,17],[628,30,12,15,28,16],[661,30,11,15,31,16],[701,30,19,15,26,16],[745,30,23,15,25,16],
		[793,30,23,15,28,16],[845,30,19,15,35,16],[901,30,11,15,46,16],[961,30,59,16,1,17],[986,30,22,15,41,16],
		[1054,30,2,15,64,16],[1096,30,24,15,46,16],[1142,30,42,15,32,16],[1222,30,10,15,67,16],[1276,30,20,15,61,16]
	])
};

function raw(rows: number[][]): EcBlockInfo[] {
	return [
		{
			totalDataCodewords: 0,
			ecCodewordsPerBlock: 0,
			group1Blocks: 0,
			group1Count: 0,
			group2Blocks: 0,
			group2Count: 0
		},
		...rows.map(
			([
				totalDataCodewords,
				ecCodewordsPerBlock,
				group1Blocks,
				group1Count,
				group2Blocks,
				group2Count
			]) => ({
				totalDataCodewords,
				ecCodewordsPerBlock,
				group1Blocks,
				group1Count,
				group2Blocks,
				group2Count
			})
		)
	];
}

// prettier-ignore
const ALIGNMENT_COORDS: number[][] = [
	[],
	[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
	[6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78],
	[6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102],
	[6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122],
	[6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138],
	[6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146], [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154],
	[6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170]
];

// index 0 = L/mask0 .. built as `${level}${mask}` -> 15-char binary string
// prettier-ignore
const FORMAT_STRINGS: Record<string, string> = {
	L0: '111011111000100', L1: '111001011110011', L2: '111110110101010', L3: '111100010011101',
	L4: '110011000101111', L5: '110001100011000', L6: '110110001000001', L7: '110100101110110',
	M0: '101010000010010', M1: '101000100100101', M2: '101111001111100', M3: '101101101001011',
	M4: '100010111111001', M5: '100000011001110', M6: '100111110010111', M7: '100101010100000',
	Q0: '011010101011111', Q1: '011000001101000', Q2: '011111100110001', Q3: '011101000000110',
	Q4: '010010010110100', Q5: '010000110000011', Q6: '010111011011010', Q7: '010101111101101',
	H0: '001011010001001', H1: '001001110111110', H2: '001110011100111', H3: '001100111010000',
	H4: '000011101100010', H5: '000001001010101', H6: '000110100001100', H7: '000100000111011'
};

// index = version (7-40) -> 18-char binary string; versions 1-6 don't carry version info
// prettier-ignore
const VERSION_STRINGS: Record<number, string> = {
	7: '000111110010010100', 8: '001000010110111100', 9: '001001101010011001', 10: '001010010011010011',
	11: '001011101111110110', 12: '001100011101100010', 13: '001101100001000111', 14: '001110011000001101',
	15: '001111100100101000', 16: '010000101101111000', 17: '010001010001011101', 18: '010010101000010111',
	19: '010011010100110010', 20: '010100100110100110', 21: '010101011010000011', 22: '010110100011001001',
	23: '010111011111101100', 24: '011000111011000100', 25: '011001000111100001', 26: '011010111110101011',
	27: '011011000010001110', 28: '011100110000011010', 29: '011101001100111111', 30: '011110110101110101',
	31: '011111001001010000', 32: '100000100111010101', 33: '100001011011110000', 34: '100010100010111010',
	35: '100011011110011111', 36: '100100101100001011', 37: '100101010000101110', 38: '100110101001100100',
	39: '100111010101000001', 40: '101000110001101001'
};

// ---------- Bit buffer ----------

class BitBuffer {
	bits: number[] = [];

	push(value: number, length: number) {
		for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
	}

	get length() {
		return this.bits.length;
	}
}

// ---------- GF(256) arithmetic for Reed-Solomon ----------

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
	let x = 1;
	for (let i = 0; i < 255; i++) {
		GF_EXP[i] = x;
		GF_LOG[x] = i;
		x <<= 1;
		if (x & 0x100) x ^= 0x11d;
	}
	for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
	if (a === 0 || b === 0) return 0;
	return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function generatorPolynomial(degree: number): number[] {
	// Coefficients highest-degree first, built by successively multiplying in (x - a^i) = (x + a^i).
	let poly = [1];
	for (let i = 0; i < degree; i++) {
		const next = new Array(poly.length + 1).fill(0);
		for (let j = 0; j < poly.length; j++) {
			next[j] ^= poly[j];
			next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
		}
		poly = next;
	}
	return poly;
}

function reedSolomonRemainder(dataCodewords: number[], ecCount: number): number[] {
	const generator = generatorPolynomial(ecCount);
	const result = [...dataCodewords, ...new Array(ecCount).fill(0)];
	for (let i = 0; i < dataCodewords.length; i++) {
		const coef = result[i];
		if (coef === 0) continue;
		for (let j = 0; j < generator.length; j++) {
			result[i + j] ^= gfMul(generator[j], coef);
		}
	}
	return result.slice(dataCodewords.length);
}

// ---------- Data encoding ----------

function utf8Bytes(text: string): number[] {
	return Array.from(new TextEncoder().encode(text));
}

function encodeSegment(buffer: BitBuffer, text: string, mode: Mode, version: number) {
	const indicator =
		mode === 'numeric' ? MODE_NUMERIC : mode === 'alphanumeric' ? MODE_ALPHANUMERIC : MODE_BYTE;
	buffer.push(indicator, 4);

	if (mode === 'byte') {
		const bytes = utf8Bytes(text);
		buffer.push(bytes.length, charCountBits(version, mode));
		for (const byte of bytes) buffer.push(byte, 8);
		return;
	}

	buffer.push(text.length, charCountBits(version, mode));

	if (mode === 'numeric') {
		for (let i = 0; i < text.length; i += 3) {
			const group = text.slice(i, i + 3);
			buffer.push(parseInt(group, 10), group.length === 3 ? 10 : group.length === 2 ? 7 : 4);
		}
		return;
	}

	// alphanumeric
	for (let i = 0; i < text.length; i += 2) {
		if (i + 1 < text.length) {
			const value =
				ALPHANUMERIC_CHARS.indexOf(text[i]) * 45 + ALPHANUMERIC_CHARS.indexOf(text[i + 1]);
			buffer.push(value, 11);
		} else {
			buffer.push(ALPHANUMERIC_CHARS.indexOf(text[i]), 6);
		}
	}
}

function payloadBitLength(text: string, mode: Mode, version: number): number {
	const header = 4 + charCountBits(version, mode);
	if (mode === 'numeric') {
		const n = text.length;
		return header + Math.floor(n / 3) * 10 + (n % 3 === 0 ? 0 : n % 3 === 1 ? 4 : 7);
	}
	if (mode === 'alphanumeric') {
		const n = text.length;
		return header + Math.floor(n / 2) * 11 + (n % 2 === 1 ? 6 : 0);
	}
	return header + utf8Bytes(text).length * 8;
}

export type CapacityError = { ok: false; maxBytes: number };

function findVersion(text: string, mode: Mode, ecLevel: EcLevel): number | null {
	for (let version = 1; version <= 40; version++) {
		const capacityBits = EC_TABLE[ecLevel][version].totalDataCodewords * 8;
		if (payloadBitLength(text, mode, version) <= capacityBits) return version;
	}
	return null;
}

function buildCodewords(text: string, mode: Mode, version: number, ecLevel: EcLevel): number[] {
	const info = EC_TABLE[ecLevel][version];
	const capacityBits = info.totalDataCodewords * 8;

	const buffer = new BitBuffer();
	encodeSegment(buffer, text, mode, version);

	const terminatorLength = Math.min(4, capacityBits - buffer.length);
	if (terminatorLength > 0) buffer.push(0, terminatorLength);
	while (buffer.length % 8 !== 0) buffer.push(0, 1);

	const dataCodewords: number[] = [];
	for (let i = 0; i < buffer.length; i += 8) {
		let byte = 0;
		for (let b = 0; b < 8; b++) byte = (byte << 1) | buffer.bits[i + b];
		dataCodewords.push(byte);
	}
	const padBytes = [0xec, 0x11];
	let padIndex = 0;
	while (dataCodewords.length < info.totalDataCodewords) {
		dataCodewords.push(padBytes[padIndex % 2]);
		padIndex++;
	}

	// Split into blocks, compute Reed-Solomon EC codewords per block, then interleave.
	const blocks: number[][] = [];
	let offset = 0;
	for (let i = 0; i < info.group1Blocks; i++) {
		blocks.push(dataCodewords.slice(offset, offset + info.group1Count));
		offset += info.group1Count;
	}
	for (let i = 0; i < info.group2Blocks; i++) {
		blocks.push(dataCodewords.slice(offset, offset + info.group2Count));
		offset += info.group2Count;
	}
	const ecBlocks = blocks.map((block) => reedSolomonRemainder(block, info.ecCodewordsPerBlock));

	const result: number[] = [];
	const maxDataLen = Math.max(...blocks.map((b) => b.length));
	for (let i = 0; i < maxDataLen; i++) {
		for (const block of blocks) if (i < block.length) result.push(block[i]);
	}
	for (let i = 0; i < info.ecCodewordsPerBlock; i++) {
		for (const block of ecBlocks) result.push(block[i]);
	}
	return result;
}

// ---------- Matrix construction ----------

class Matrix {
	size: number;
	dark: boolean[][];
	reserved: boolean[][];

	constructor(size: number) {
		this.size = size;
		this.dark = Array.from({ length: size }, () => new Array(size).fill(false));
		this.reserved = Array.from({ length: size }, () => new Array(size).fill(false));
	}

	set(row: number, col: number, isDark: boolean, isReserved = true) {
		if (row < 0 || row >= this.size || col < 0 || col >= this.size) return;
		this.dark[row][col] = isDark;
		if (isReserved) this.reserved[row][col] = true;
	}
}

function drawFinder(m: Matrix, topRow: number, topCol: number) {
	for (let r = -1; r <= 7; r++) {
		for (let c = -1; c <= 7; c++) {
			const row = topRow + r;
			const col = topCol + c;
			if (row < 0 || row >= m.size || col < 0 || col >= m.size) continue;
			const inFinder = r >= 0 && r <= 6 && c >= 0 && c <= 6;
			const isDark =
				inFinder &&
				(r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
			m.set(row, col, isDark, true);
		}
	}
}

function drawAlignment(m: Matrix, centerRow: number, centerCol: number) {
	for (let r = -2; r <= 2; r++) {
		for (let c = -2; c <= 2; c++) {
			const ring = Math.max(Math.abs(r), Math.abs(c));
			m.set(centerRow + r, centerCol + c, ring !== 1, true);
		}
	}
}

function drawTiming(m: Matrix) {
	for (let i = 8; i <= m.size - 9; i++) {
		const isDark = i % 2 === 0;
		m.set(6, i, isDark, true);
		m.set(i, 6, isDark, true);
	}
}

function formatCoordsA(): [number, number][] {
	const coords: [number, number][] = [];
	for (let i = 0; i <= 5; i++) coords.push([8, i]);
	coords.push([8, 7], [8, 8], [7, 8]);
	for (let i = 5; i >= 0; i--) coords.push([i, 8]);
	return coords;
}

function formatCoordsB(size: number): [number, number][] {
	const coords: [number, number][] = [];
	for (let i = 0; i < 8; i++) coords.push([size - 1 - i, 8]);
	for (let i = 0; i < 7; i++) coords.push([8, size - 7 + i]);
	return coords;
}

function reserveFormatAreas(m: Matrix) {
	for (const [r, c] of formatCoordsA()) m.set(r, c, false, true);
	for (const [r, c] of formatCoordsB(m.size)) m.set(r, c, false, true);
	// The dark module, always on, independent of the format bits.
	m.set(8, m.size - 8, true, true);
}

function drawFormatInfo(m: Matrix, ecLevel: EcLevel, maskId: number) {
	const bits = FORMAT_STRINGS[`${ecLevel}${maskId}`];
	const coordsA = formatCoordsA();
	const coordsB = formatCoordsB(m.size);
	for (let i = 0; i < 15; i++) {
		const isDark = bits[i] === '1';
		const [ar, ac] = coordsA[i];
		m.set(ar, ac, isDark, true);
		const [br, bc] = coordsB[i];
		m.set(br, bc, isDark, true);
	}
}

function reserveVersionAreas(m: Matrix, version: number) {
	if (version < 7) return;
	for (let i = 0; i < 18; i++) {
		const a = m.size - 11 + (i % 3);
		const b = Math.floor(i / 3);
		m.set(a, b, false, true);
		m.set(b, a, false, true);
	}
}

function drawVersionInfo(m: Matrix, version: number) {
	if (version < 7) return;
	const bits = VERSION_STRINGS[version];
	for (let p = 0; p < 18; p++) {
		const i = 17 - p; // string is MSB-first; placement index counts from the LSB
		const isDark = bits[p] === '1';
		const a = m.size - 11 + (i % 3);
		const b = Math.floor(i / 3);
		m.set(a, b, isDark, true);
		m.set(b, a, isDark, true);
	}
}

function placeData(m: Matrix, codewords: number[]): boolean[][] {
	// Which modules carry data (vs. function patterns) — needed so masking only touches data modules.
	const isData = Array.from({ length: m.size }, () => new Array(m.size).fill(false));

	const bits: number[] = [];
	for (const byte of codewords) for (let b = 7; b >= 0; b--) bits.push((byte >> b) & 1);
	let bitIndex = 0;
	const nextBit = () => (bitIndex < bits.length ? bits[bitIndex++] : 0);

	let col = m.size - 1;
	let goingUp = true;
	while (col > 0) {
		if (col === 6) col--; // vertical timing column has no data
		for (let step = 0; step < m.size; step++) {
			const row = goingUp ? m.size - 1 - step : step;
			for (const c of [col, col - 1]) {
				if (m.reserved[row][c]) continue;
				m.dark[row][c] = nextBit() === 1;
				isData[row][c] = true;
			}
		}
		goingUp = !goingUp;
		col -= 2;
	}
	return isData;
}

function applyMask(row: number, col: number, maskId: number): boolean {
	switch (maskId) {
		case 0:
			return (row + col) % 2 === 0;
		case 1:
			return row % 2 === 0;
		case 2:
			return col % 3 === 0;
		case 3:
			return (row + col) % 3 === 0;
		case 4:
			return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
		case 5:
			return ((row * col) % 2) + ((row * col) % 3) === 0;
		case 6:
			return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
		case 7:
			return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
		default:
			return false;
	}
}

function penaltyScore(m: Matrix): number {
	const size = m.size;
	const dark = m.dark;
	let score = 0;

	// Rule 1: runs of 5+ same-color modules in a row/column.
	for (const rowMajor of [true, false]) {
		for (let i = 0; i < size; i++) {
			let runLength = 1;
			let prev: boolean | null = null;
			for (let j = 0; j < size; j++) {
				const value = rowMajor ? dark[i][j] : dark[j][i];
				if (value === prev) {
					runLength++;
				} else {
					if (prev !== null && runLength >= 5) score += 3 + (runLength - 5);
					runLength = 1;
					prev = value;
				}
			}
			if (prev !== null && runLength >= 5) score += 3 + (runLength - 5);
		}
	}

	// Rule 2: 2x2 blocks of the same color.
	for (let r = 0; r < size - 1; r++) {
		for (let c = 0; c < size - 1; c++) {
			const v = dark[r][c];
			if (v === dark[r][c + 1] && v === dark[r + 1][c] && v === dark[r + 1][c + 1]) score += 3;
		}
	}

	// Rule 3: 1:1:3:1:1 finder-like patterns with 4 light modules on either side.
	const pattern = [true, false, true, true, true, false, true];
	const hasPattern = (bits: boolean[], start: number) => {
		for (let i = 0; i < 7; i++) if (bits[start + i] !== pattern[i]) return false;
		return true;
	};
	for (let i = 0; i < size; i++) {
		const rowBits = dark[i];
		const colBits = dark.map((r) => r[i]);
		for (let j = 0; j <= size - 11; j++) {
			const light4Before = rowBits.slice(j, j + 4).every((v) => v === false);
			const light4After = rowBits.slice(j + 7, j + 11).every((v) => v === false);
			if (hasPattern(rowBits, j + 4) && (light4Before || light4After)) score += 40;
			const colLightBefore = colBits.slice(j, j + 4).every((v) => v === false);
			const colLightAfter = colBits.slice(j + 7, j + 11).every((v) => v === false);
			if (hasPattern(colBits, j + 4) && (colLightBefore || colLightAfter)) score += 40;
		}
	}

	// Rule 4: overall dark-module ratio, penalized the further it drifts from 50%.
	let darkCount = 0;
	for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (dark[r][c]) darkCount++;
	const percentDark = (darkCount / (size * size)) * 100;
	const deviation = Math.abs(Math.floor(percentDark / 5) * 5 - 50) / 5;
	score += deviation * 10;

	return score;
}

export function generateQr(
	text: string,
	ecLevel: EcLevel = 'M',
	minVersion = 1
): QrMatrix | CapacityError {
	const mode = detectMode(text);
	let version = findVersion(text, mode, ecLevel);
	if (version === null) {
		let maxBytes = 0;
		for (let v = 40; v >= 1; v--) {
			const capacityBits = EC_TABLE[ecLevel][v].totalDataCodewords * 8;
			const headerBits = 4 + charCountBits(v, mode);
			const perCharBits = mode === 'numeric' ? 10 / 3 : mode === 'alphanumeric' ? 5.5 : 8;
			maxBytes = Math.max(maxBytes, Math.floor((capacityBits - headerBits) / perCharBits));
		}
		return { ok: false, maxBytes };
	}
	version = Math.max(version, minVersion);

	const codewords = buildCodewords(text, mode, version, ecLevel);
	const size = version * 4 + 17;

	const template = new Matrix(size);
	drawFinder(template, 0, 0);
	drawFinder(template, 0, size - 7);
	drawFinder(template, size - 7, 0);
	drawTiming(template);
	const coords = ALIGNMENT_COORDS[version];
	for (const r of coords) {
		for (const c of coords) {
			const isTopLeft = r === coords[0] && c === coords[0];
			const isTopRight = r === coords[0] && c === coords[coords.length - 1];
			const isBottomLeft = r === coords[coords.length - 1] && c === coords[0];
			if (isTopLeft || isTopRight || isBottomLeft) continue;
			drawAlignment(template, r, c);
		}
	}
	reserveFormatAreas(template);
	reserveVersionAreas(template, version);

	let best: { maskId: number; dark: boolean[][]; score: number } | null = null;
	for (let maskId = 0; maskId < 8; maskId++) {
		const candidate = new Matrix(size);
		candidate.dark = template.dark.map((row) => [...row]);
		candidate.reserved = template.reserved.map((row) => [...row]);
		const isData = placeData(candidate, codewords);
		for (let r = 0; r < size; r++) {
			for (let c = 0; c < size; c++) {
				if (isData[r][c] && applyMask(r, c, maskId)) candidate.dark[r][c] = !candidate.dark[r][c];
			}
		}
		drawFormatInfo(candidate, ecLevel, maskId);
		drawVersionInfo(candidate, version);
		const score = penaltyScore(candidate);
		if (!best || score < best.score) best = { maskId, dark: candidate.dark, score };
	}

	return { ok: true, size, version, ecLevel, modules: best!.dark };
}
