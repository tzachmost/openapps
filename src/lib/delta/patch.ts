import type { DiffOp } from './diff';

type Annotated = { type: ' ' | '-' | '+'; text: string; oldLine?: number; newLine?: number };

function annotate(ops: DiffOp<string>[]): Annotated[] {
	const anns: Annotated[] = [];
	let oldLine = 1;
	let newLine = 1;
	for (const op of ops) {
		if (op.type === 'equal') {
			anns.push({ type: ' ', text: op.value, oldLine, newLine });
			oldLine++;
			newLine++;
		} else if (op.type === 'delete') {
			anns.push({ type: '-', text: op.value, oldLine });
			oldLine++;
		} else {
			anns.push({ type: '+', text: op.value, newLine });
			newLine++;
		}
	}
	return anns;
}

/** Builds a standard unified-diff patch (`diff -u` style) from the raw
 *  line-level edit script — a "replace" is just its delete lines immediately
 *  followed by its insert lines, same as any other unified diff. Context
 *  lines default to 3, matching the conventional default. This targets the
 *  common case, not every corner of GNU diff's hunk-numbering rules (e.g. a
 *  hunk that touches only line 0 of an empty file) — good enough to apply
 *  cleanly with `patch`/`git apply` for real, non-degenerate text.
 *
 *  `oldEndsWithNewline`/`newEndsWithNewline` matter more than they look:
 *  without emitting the standard "\ No newline at end of file" marker for a
 *  file that doesn't end in `\n`, `patch`/`git apply` refuse the last hunk
 *  outright — confirmed by fuzzing against the real `patch` binary, which is
 *  how this bug was actually found (a build/type-check would never catch
 *  it). The marker can only ever be attached to the physically last line of
 *  the whole patch — never mid-hunk — even though "old's last line" and
 *  "new's last line" can, in a rare LCS crossing pattern near end-of-file
 *  (an insert immediately followed by a match immediately followed by a
 *  trailing delete), land on two different, non-adjacent annotations. When
 *  that happens this implementation only marks whichever side's last line
 *  ends up physically last in the hunk and leaves the other side's marker
 *  off — also caught only by fuzzing against the real `patch` binary, since
 *  emitting it in the "obvious" per-side position produced an invalid
 *  mid-hunk marker that `patch` rejected outright. Both this and the
 *  shared-context-line case above are the same underlying gap: real diff
 *  tools bias their tie-breaking specifically to avoid ever producing this
 *  crossing shape; this implementation's plain Myers backtrack doesn't, so
 *  the rare tail case where a file lacks a trailing newline can still lose
 *  its marker. Everything else — the on-screen diff, stats, word-level
 *  highlighting — is unaffected; this only narrows the exported .patch
 *  file's applicability in that one specific, uncommon shape. */
export function buildUnifiedDiff(
	ops: DiffOp<string>[],
	oldFile = 'a',
	newFile = 'b',
	context = 3,
	oldEndsWithNewline = true,
	newEndsWithNewline = true
): string {
	const anns = annotate(ops);
	const changeIdx: number[] = [];
	anns.forEach((a, idx) => {
		if (a.type !== ' ') changeIdx.push(idx);
	});
	if (changeIdx.length === 0) return '';

	let lastOldIdx = -1;
	let lastNewIdx = -1;
	anns.forEach((a, idx) => {
		if (a.oldLine !== undefined) lastOldIdx = idx;
		if (a.newLine !== undefined) lastNewIdx = idx;
	});

	const spans: { start: number; end: number }[] = [];
	let hs = Math.max(0, changeIdx[0] - context);
	let he = Math.min(anns.length - 1, changeIdx[0] + context);
	for (let i = 1; i < changeIdx.length; i++) {
		const s = Math.max(0, changeIdx[i] - context);
		const e = Math.min(anns.length - 1, changeIdx[i] + context);
		if (s <= he + 1) {
			he = Math.max(he, e);
		} else {
			spans.push({ start: hs, end: he });
			hs = s;
			he = e;
		}
	}
	spans.push({ start: hs, end: he });

	const lines: string[] = [`--- ${oldFile}`, `+++ ${newFile}`];
	for (const span of spans) {
		const slice = anns.slice(span.start, span.end + 1);
		const oldStart = slice.find((a) => a.oldLine !== undefined)?.oldLine ?? 0;
		const newStart = slice.find((a) => a.newLine !== undefined)?.newLine ?? 0;
		const oldCount = slice.filter((a) => a.type !== '+').length;
		const newCount = slice.filter((a) => a.type !== '-').length;
		lines.push(
			`@@ -${oldCount === 0 ? 0 : oldStart},${oldCount} +${newCount === 0 ? 0 : newStart},${newCount} @@`
		);
		for (let i = span.start; i <= span.end; i++) {
			const a = anns[i];
			lines.push(`${a.type}${a.text}`);
			const isPhysicalEnd = span === spans[spans.length - 1] && i === span.end;
			if (!isPhysicalEnd) continue;
			const isLastOld = i === lastOldIdx && a.type !== '+';
			const isLastNew = i === lastNewIdx && a.type !== '-';
			if (a.type === ' ') {
				if ((isLastOld && !oldEndsWithNewline) || (isLastNew && !newEndsWithNewline)) {
					lines.push('\\ No newline at end of file');
				}
			} else if (a.type === '-' && isLastOld && !oldEndsWithNewline) {
				lines.push('\\ No newline at end of file');
			} else if (a.type === '+' && isLastNew && !newEndsWithNewline) {
				lines.push('\\ No newline at end of file');
			}
		}
	}
	return lines.join('\n') + '\n';
}

export function endsWithNewline(text: string): boolean {
	return text.length === 0 || text.endsWith('\n');
}
