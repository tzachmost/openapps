export type JsonValue =
	null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type ParseResult =
	| { ok: true; value: JsonValue }
	| { ok: false; message: string; line: number; column: number; excerpt: string };

/**
 * Parses JSON and, on failure, turns the engine's error message into a line/column
 * pointer. V8 (Chrome/Edge/Node) reports "position N" and, on recent versions, also
 * "(line L column C)"; SpiderMonkey (Firefox) reports "line L column C" with no
 * position. Both are handled so the pointer is accurate across browsers.
 */
export function parseJson(text: string): ParseResult {
	try {
		const value = JSON.parse(text) as JsonValue;
		return { ok: true, value };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Invalid JSON.';
		const position = locatePosition(text, message);
		const { line, column } = positionToLineColumn(text, position);
		return {
			ok: false,
			message: cleanMessage(message),
			line,
			column,
			excerpt: excerptAt(text, line)
		};
	}
}

function locatePosition(text: string, message: string): number {
	const positionMatch = message.match(/position (\d+)/i);
	if (positionMatch) return Number(positionMatch[1]);

	const lineColMatch = message.match(/line (\d+) column (\d+)/i);
	if (lineColMatch) {
		const lines = text.split('\n');
		const targetLine = Number(lineColMatch[1]) - 1;
		let offset = 0;
		for (let i = 0; i < targetLine && i < lines.length; i++) offset += lines[i].length + 1;
		return offset + (Number(lineColMatch[2]) - 1);
	}

	return text.length;
}

function positionToLineColumn(text: string, position: number): { line: number; column: number } {
	const clamped = Math.max(0, Math.min(position, text.length));
	const before = text.slice(0, clamped).split('\n');
	return { line: before.length, column: before[before.length - 1].length + 1 };
}

function excerptAt(text: string, line: number): string {
	const raw = text.split('\n')[line - 1] ?? '';
	const trimmed = raw.trim();
	return trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
}

function cleanMessage(message: string): string {
	return message.replace(/^JSON\.parse:\s*/i, '');
}

export function stringifyPretty(value: JsonValue, indent: string): string {
	return JSON.stringify(value, null, indent);
}

export function stringifyMinified(value: JsonValue): string {
	return JSON.stringify(value);
}

export function isContainer(value: JsonValue): value is JsonValue[] | Record<string, JsonValue> {
	return typeof value === 'object' && value !== null;
}

export function measure(value: JsonValue): { keyCount: number; depth: number } {
	let keyCount = 0;
	let depth = 0;
	function walk(current: JsonValue, currentDepth: number) {
		if (currentDepth > depth) depth = currentDepth;
		if (isContainer(current)) {
			const entries = Array.isArray(current) ? current : Object.values(current);
			keyCount += entries.length;
			for (const entry of entries) walk(entry, currentDepth + 1);
		}
	}
	walk(value, 0);
	return { keyCount, depth };
}
