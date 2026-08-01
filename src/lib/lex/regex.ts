// Every function here takes a `pattern`/`flags` string pair and builds its own fresh RegExp
// internally, rather than a shared instance passed in from the page. A JS RegExp is stateful
// (`lastIndex`) whenever `g` or `y` is set, and `.exec`/`.match`/`.replace` all mutate it — sharing
// one instance across independent operations (matching, then replacing, in the same render) would
// make the second operation silently depend on where the first one left off. Building fresh each
// time sidesteps the whole class of bug rather than reasoning about call order.

export type FlagKey = 'g' | 'i' | 'm' | 's' | 'u' | 'y';

export const FLAG_ORDER: FlagKey[] = ['g', 'i', 'm', 's', 'u', 'y'];

export const FLAG_INFO: Record<FlagKey, string> = {
	g: 'Global — find every match, not just the first',
	i: 'Case-insensitive',
	m: 'Multiline — ^ and $ match at line breaks too, not just the start/end of the whole string',
	s: 'Dot-all — . also matches newline characters',
	u: 'Unicode — read the pattern as code points, not raw UTF-16 units',
	y: 'Sticky — only matches starting at the exact current position, never searches ahead'
};

export function buildFlagsString(flags: Record<FlagKey, boolean>): string {
	return FLAG_ORDER.filter((k) => flags[k]).join('');
}

export type CompileResult = { ok: true } | { ok: false; error: string };

/** Validates a pattern/flags pair without holding onto the RegExp it builds. */
export function checkPattern(pattern: string, flags: string): CompileResult {
	try {
		new RegExp(pattern, flags);
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}

export type MatchInfo = {
	index: number;
	match: string;
	groups: Array<string | undefined>;
	named: Record<string, string | undefined> | null;
};

// Honest cap, same pattern as Delta's MAX_LINES / Loop's frame budget — a pathological pattern
// against a huge string (or one that legitimately matches thousands of times) shows a "showing
// the first N" note instead of ever trying to render an unbounded list.
export const MAX_MATCHES = 1000;

export function findMatches(
	pattern: string,
	flags: string,
	text: string
): { matches: MatchInfo[]; truncated: boolean } {
	const re = new RegExp(pattern, flags);
	if (!re.global) {
		// Without `g`, real JS code only ever gets the first match — showing all occurrences here
		// anyway would misrepresent what the pattern actually does when used as written.
		const m = text.match(re);
		return m ? { matches: [toMatchInfo(m)], truncated: false } : { matches: [], truncated: false };
	}
	// `String.prototype.matchAll` (not a hand-rolled `while (re.exec(text))` loop) — it's the
	// platform's own iterator and, critically, it already handles zero-length matches correctly
	// (advancing one code point instead of looping forever), which a hand-rolled loop would need
	// to remember to do itself.
	const matches: MatchInfo[] = [];
	let truncated = false;
	for (const m of text.matchAll(re)) {
		if (matches.length >= MAX_MATCHES) {
			truncated = true;
			break;
		}
		matches.push(toMatchInfo(m));
	}
	return { matches, truncated };
}

function toMatchInfo(m: RegExpMatchArray): MatchInfo {
	return {
		index: m.index ?? 0,
		match: m[0],
		groups: m.slice(1),
		named: m.groups ? { ...m.groups } : null
	};
}

export type Segment = { text: string; matchIndex: number | null };

/** Splits `text` into alternating unmatched/matched runs for highlighting. A zero-length match
 *  (e.g. a lookaround-only pattern like `(?=\d)`) still gets its own empty segment tagged with a
 *  match index, so the renderer can draw a visible marker instead of the match silently vanishing
 *  between two unmatched runs. */
export function buildSegments(text: string, matches: MatchInfo[]): Segment[] {
	const segments: Segment[] = [];
	let cursor = 0;
	matches.forEach((m, i) => {
		if (m.index > cursor) segments.push({ text: text.slice(cursor, m.index), matchIndex: null });
		segments.push({ text: m.match, matchIndex: i });
		cursor = Math.max(cursor, m.index + m.match.length);
	});
	if (cursor < text.length) segments.push({ text: text.slice(cursor), matchIndex: null });
	return segments;
}

/** `String.prototype.replace` already does the right thing for both the global (replace every
 *  match) and non-global (replace only the first) case — no reason to hand-roll either path. */
export function replaceAll(
	pattern: string,
	flags: string,
	text: string,
	replacement: string
): string {
	const re = new RegExp(pattern, flags);
	return text.replace(re, replacement);
}
