import { diffArrays, type DiffOp } from './diff';

export type LineOptions = { ignoreWhitespace: boolean; ignoreCase: boolean };

/** Line count guard: Myers diff is O(ND) — worst case (near-totally-different
 *  texts) is quadratic in the edit distance, and there's no worker here to
 *  keep the tab responsive, so very large inputs are refused outright rather
 *  than silently hanging the page. */
export const MAX_LINES = 5000;

/** Splits text into lines the way a file's line count actually works: a
 *  trailing `\n` terminates the last line, it doesn't start a new blank one.
 *  Without this chomp, `"a\nb\n".split('\n')` yields a phantom trailing `''`
 *  element that isn't a real line in the source file — harmless for on-screen
 *  rendering, but it corrupts hunk line-counts in the exported unified diff
 *  enough that `patch`/`git apply` reject it (verified against the real
 *  `patch` binary). A text that ends without `\n` splits identically, so the
 *  POSIX "\ No newline at end of file" distinction is simply not tracked —
 *  an acceptable simplification for a paste-in browser diff tool. */
export function splitLines(text: string): string[] {
	if (text === '') return [];
	const chomped = text.endsWith('\n') ? text.slice(0, -1) : text;
	return chomped.split('\n');
}

function normalizeForCompare(line: string, opts: LineOptions): string {
	let s = line;
	if (opts.ignoreWhitespace) s = s.trim().replace(/\s+/g, ' ');
	if (opts.ignoreCase) s = s.toLowerCase();
	return s;
}

export function diffLines(oldText: string, newText: string, opts: LineOptions): DiffOp<string>[] {
	const oldLines = splitLines(oldText);
	const newLines = splitLines(newText);
	const eq = (x: string, y: string) =>
		normalizeForCompare(x, opts) === normalizeForCompare(y, opts);
	return diffArrays(oldLines, newLines, eq);
}

/** Splits a line into whitespace-run and non-whitespace-run tokens, so word
 *  diffing highlights whole words/punctuation clusters rather than individual
 *  characters — readable in the way a real diff tool's inline highlight is. */
export function tokenizeWords(line: string): string[] {
	return line.match(/\s+|\S+/g) ?? [];
}

export type WordSpan = { text: string; changed: boolean };

/** Word-level diff between two changed lines, always exact-match (independent
 *  of the line-level ignoreCase/ignoreWhitespace settings — those only decide
 *  which lines count as "changed" in the first place; once a line is flagged
 *  changed, the inline highlight should show the real, literal difference). */
export function wordDiff(
	oldLine: string,
	newLine: string
): { oldSpans: WordSpan[]; newSpans: WordSpan[] } {
	const ops = diffArrays(tokenizeWords(oldLine), tokenizeWords(newLine));
	const oldSpans: WordSpan[] = [];
	const newSpans: WordSpan[] = [];
	for (const op of ops) {
		if (op.type === 'equal') {
			oldSpans.push({ text: op.value, changed: false });
			newSpans.push({ text: op.value, changed: false });
		} else if (op.type === 'delete') {
			oldSpans.push({ text: op.value, changed: true });
		} else {
			newSpans.push({ text: op.value, changed: true });
		}
	}
	return { oldSpans, newSpans };
}
