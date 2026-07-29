import type { DiffOp } from './diff';

export type Row =
	| { kind: 'equal'; oldLine: number; newLine: number; text: string }
	| { kind: 'delete'; oldLine: number; text: string }
	| { kind: 'insert'; newLine: number; text: string }
	| { kind: 'replace'; oldLine: number; newLine: number; oldText: string; newText: string };

/** Groups the flat line-level edit script into display rows, pairing up a
 *  run of consecutive deletes with a run of consecutive inserts (index-wise,
 *  up to the shorter run's length) so the UI can offer word-level highlights
 *  on genuinely "changed" lines — the rest of an uneven-length run stays a
 *  plain delete or insert, never invented as a fake pairing. */
export function buildRows(ops: DiffOp<string>[]): Row[] {
	const rows: Row[] = [];
	let oldLine = 1;
	let newLine = 1;
	let i = 0;

	while (i < ops.length) {
		const op = ops[i];
		if (op.type === 'equal') {
			rows.push({ kind: 'equal', oldLine, newLine, text: op.value });
			oldLine++;
			newLine++;
			i++;
			continue;
		}

		const deletes: string[] = [];
		const inserts: string[] = [];
		while (i < ops.length && ops[i].type !== 'equal') {
			if (ops[i].type === 'delete') deletes.push(ops[i].value);
			else inserts.push(ops[i].value);
			i++;
		}

		const pairCount = Math.min(deletes.length, inserts.length);
		for (let p = 0; p < pairCount; p++) {
			rows.push({ kind: 'replace', oldLine, newLine, oldText: deletes[p], newText: inserts[p] });
			oldLine++;
			newLine++;
		}
		for (let p = pairCount; p < deletes.length; p++) {
			rows.push({ kind: 'delete', oldLine, text: deletes[p] });
			oldLine++;
		}
		for (let p = pairCount; p < inserts.length; p++) {
			rows.push({ kind: 'insert', newLine, text: inserts[p] });
			newLine++;
		}
	}

	return rows;
}

export type DiffStats = { added: number; removed: number; changed: number; unchanged: number };

export function summarizeRows(rows: Row[]): DiffStats {
	const stats: DiffStats = { added: 0, removed: 0, changed: 0, unchanged: 0 };
	for (const row of rows) {
		if (row.kind === 'equal') stats.unchanged++;
		else if (row.kind === 'insert') stats.added++;
		else if (row.kind === 'delete') stats.removed++;
		else stats.changed++;
	}
	return stats;
}
