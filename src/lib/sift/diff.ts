import { isContainer, type JsonValue } from './json';

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
		const length = Math.max(before.length, after.length);
		const children: DiffNode[] = [];
		for (let i = 0; i < length; i++) children.push(diffInner(before[i], after[i], String(i)));
		const status: DiffStatus = children.every((c) => c.status === 'unchanged')
			? 'unchanged'
			: 'changed';
		return { key, status, before, after, children };
	}

	return { key, status: before === after ? 'unchanged' : 'changed', before, after };
}

/** Comparison is positional for arrays (index N vs. index N) — an insertion shifts every index after it. */
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
