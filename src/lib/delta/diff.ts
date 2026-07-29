/**
 * Myers' O(ND) shortest-edit-script diff, generic over arrays of comparable
 * items. Used both for line-level diffing and, on paired changed lines, for
 * word-level diffing — same algorithm, different tokens.
 */
export type DiffOp<T> = { type: 'equal' | 'delete' | 'insert'; value: T };

export function diffArrays<T>(
	a: T[],
	b: T[],
	eq: (x: T, y: T) => boolean = (x, y) => x === y
): DiffOp<T>[] {
	const n = a.length;
	const m = b.length;
	const max = n + m;
	if (max === 0) return [];

	const offset = max;
	const size = 2 * max + 1;
	const v = new Int32Array(size);
	const trace: Int32Array[] = [];

	let found = false;
	for (let d = 0; d <= max && !found; d++) {
		trace.push(v.slice());
		for (let k = -d; k <= d; k += 2) {
			let x: number;
			if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
				x = v[offset + k + 1];
			} else {
				x = v[offset + k - 1] + 1;
			}
			let y = x - k;
			while (x < n && y < m && eq(a[x], b[y])) {
				x++;
				y++;
			}
			v[offset + k] = x;
			if (x >= n && y >= m) {
				found = true;
				break;
			}
		}
	}

	// Backtrack through the recorded frontiers to recover the actual edit script.
	const ops: DiffOp<T>[] = [];
	let x = n;
	let y = m;
	for (let d = trace.length - 1; d >= 0; d--) {
		const vd = trace[d];
		const k = x - y;
		let prevK: number;
		if (k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1])) {
			prevK = k + 1;
		} else {
			prevK = k - 1;
		}
		const prevX = vd[offset + prevK];
		const prevY = prevX - prevK;

		while (x > prevX && y > prevY) {
			x--;
			y--;
			ops.push({ type: 'equal', value: a[x] });
		}

		if (d > 0) {
			if (x === prevX) {
				y--;
				ops.push({ type: 'insert', value: b[y] });
			} else {
				x--;
				ops.push({ type: 'delete', value: a[x] });
			}
		}
		x = prevX;
		y = prevY;
	}

	return ops.reverse();
}
