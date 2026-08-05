import { isContainer, type JsonValue } from './json';
import { diffArrays } from '$lib/delta/diff';

export type DiffStatus = 'unchanged' | 'added' | 'removed' | 'changed';

export type DiffNode = {
	key: string;
	status: DiffStatus;
	before?: JsonValue;
	after?: JsonValue;
	children?: DiffNode[];
};

function isPlainObject(value: unknown): value is Record<string, JsonValue> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Tags an entire subtree as wholly added or removed, recursively, so the tree stays collapsible. */
function markTree(value: JsonValue, status: 'added' | 'removed', key: string): DiffNode {
	const edge = status === 'added' ? { after: value } : { before: value };
	if (isPlainObject(value)) {
		return {
			key,
			status,
			...edge,
			children: Object.keys(value).map((k) => markTree(value[k], status, k))
		};
	}
	if (Array.isArray(value)) {
		return { key, status, ...edge, children: value.map((v, i) => markTree(v, status, String(i))) };
	}
	return { key, status, ...edge };
}

function diffInner(
	before: JsonValue | undefined,
	after: JsonValue | undefined,
	key: string
): DiffNode {
	if (before === undefined) return markTree(after as JsonValue, 'added', key);
	if (after === undefined) return markTree(before as JsonValue, 'removed', key);

	if (isPlainObject(before) && isPlainObject(after)) {
		const keys = Object.keys(before);
		for (const k of Object.keys(after)) if (!keys.includes(k)) keys.push(k);
		const children = keys.map((k) => diffInner(before[k], after[k], k));
		const status: DiffStatus = children.every((c) => c.status === 'unchanged')
			? 'unchanged'
			: 'changed';
		return { key, status, before, after, children };
	}

	if (Array.isArray(before) && Array.isArray(after)) {
		const children = diffArrayChildren(before, after);
		const status: DiffStatus = children.every((c) => c.status === 'unchanged')
			? 'unchanged'
			: 'changed';
		return { key, status, before, after, children };
	}

	return { key, status: before === after ? 'unchanged' : 'changed', before, after };
}

/** Deep structural equality, used to feed Myers' algorithm an "are these two elements
 *  the same" test rather than the reference equality it defaults to — two JSON objects
 *  built separately are never `===` but can still be genuinely identical. Object key
 *  order doesn't affect equality (matches how the object branch above already compares
 *  by key name, not position). */
function deepEqual(a: JsonValue, b: JsonValue): boolean {
	if (a === b) return true;
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
	}
	if (isPlainObject(a) && isPlainObject(b)) {
		const aKeys = Object.keys(a);
		if (aKeys.length !== Object.keys(b).length) return false;
		return aKeys.every((k) => k in b && deepEqual(a[k], b[k]));
	}
	return false;
}

/** Above this length per side, array alignment falls back to plain positional
 *  comparison instead of running Myers' algorithm — same "tell the truth, don't
 *  ever hang the tab" instinct as Delta's own `MAX_LINES` cap, which this array
 *  diff shares its underlying algorithm with. In practice this almost never
 *  triggers: it takes a five-figure array (not just a large document) to reach. */
const MAX_ALIGN_LENGTH = 5000;

/**
 * Aligns two arrays with Myers' shortest-edit-script (the same algorithm Delta
 * uses for lines and words) instead of comparing index N against index N — so
 * inserting or removing an element mid-array reads as exactly that one
 * add/remove, rather than shifting every later index into a false "changed"
 * row the way plain positional comparison would. Runs of unmatched elements
 * that survive alignment are paired up index-wise, shorter run's length (same
 * rule as Delta's `buildRows`: pair what genuinely lines up, leave the rest
 * honest) and recursed into as a real structural diff, so a single modified
 * element still shows exactly what changed inside it instead of a flat
 * whole-value remove+add.
 */
function diffArrayChildren(before: JsonValue[], after: JsonValue[]): DiffNode[] {
	if (before.length > MAX_ALIGN_LENGTH || after.length > MAX_ALIGN_LENGTH) {
		return diffArrayChildrenPositional(before, after);
	}

	const ops = diffArrays(before, after, deepEqual);
	const children: DiffNode[] = [];
	let index = 0;
	let i = 0;

	while (i < ops.length) {
		if (ops[i].type === 'equal') {
			children.push(toPlainTree(ops[i].value, String(index)));
			index++;
			i++;
			continue;
		}

		const deletes: JsonValue[] = [];
		const inserts: JsonValue[] = [];
		while (i < ops.length && ops[i].type !== 'equal') {
			if (ops[i].type === 'delete') deletes.push(ops[i].value);
			else inserts.push(ops[i].value);
			i++;
		}

		const pairCount = Math.min(deletes.length, inserts.length);
		for (let p = 0; p < pairCount; p++) {
			children.push(diffInner(deletes[p], inserts[p], String(index)));
			index++;
		}
		for (let p = pairCount; p < deletes.length; p++) {
			children.push(markTree(deletes[p], 'removed', String(index)));
			index++;
		}
		for (let p = pairCount; p < inserts.length; p++) {
			children.push(markTree(inserts[p], 'added', String(index)));
			index++;
		}
	}

	return children;
}

/** The old index-N-vs-index-N comparison, kept only as the `MAX_ALIGN_LENGTH` fallback. */
function diffArrayChildrenPositional(before: JsonValue[], after: JsonValue[]): DiffNode[] {
	const length = Math.max(before.length, after.length);
	const children: DiffNode[] = [];
	for (let i = 0; i < length; i++) children.push(diffInner(before[i], after[i], String(i)));
	return children;
}

/** Arrays are aligned by content (see `diffArrayChildren`), not by index — an insertion
 *  or removal shows as exactly that, not a cascade of "changed" rows after it. */
export function diffValues(before: JsonValue, after: JsonValue): DiffNode {
	return diffInner(before, after, '');
}

/** Wraps a single value as an all-unchanged tree, so Format mode can reuse the same tree renderer as Diff mode. */
export function toPlainTree(value: JsonValue, key = ''): DiffNode {
	if (isContainer(value)) {
		const entries = Array.isArray(value)
			? value.map((v, i) => toPlainTree(v, String(i)))
			: Object.keys(value).map((k) => toPlainTree(value[k], k));
		return { key, status: 'unchanged', before: value, after: value, children: entries };
	}
	return { key, status: 'unchanged', before: value, after: value };
}

export type DiffSummary = { added: number; removed: number; changed: number };

/** Counts each added/removed subtree as one change, and each changed leaf as one — not every descendant. */
export function summarizeDiff(node: DiffNode): DiffSummary {
	const summary: DiffSummary = { added: 0, removed: 0, changed: 0 };
	const walk = (n: DiffNode) => {
		if (n.status === 'added') summary.added++;
		else if (n.status === 'removed') summary.removed++;
		else if (n.status === 'changed') {
			if (n.children) n.children.forEach(walk);
			else summary.changed++;
		}
	};
	walk(node);
	return summary;
}
