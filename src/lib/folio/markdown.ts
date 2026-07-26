/**
 * A hand-rolled, dependency-free Markdown → HTML renderer.
 *
 * This is a pragmatic subset of CommonMark + a few common GFM extensions
 * (tables, strikethrough, autolinked bare URLs) — not a full, spec-compliant
 * implementation. Notably out of scope: setext headings (`Title\n===`),
 * reference-style links (`[text][ref]`), nested blockquotes beyond one
 * level of recursion depth in practice, and raw HTML passthrough (any `<...>`
 * in the source is treated as literal text and escaped, never executed —
 * deliberate, since this runs entirely client-side over pasted content).
 * The emphasis scanner is a simple delimiter-matching pass rather than
 * CommonMark's full delimiter-run algorithm, so combined bold+italic via
 * triple markers (`***both***`) doesn't resolve correctly — write `**bold
 * *italic*text***`-style nesting explicitly, or just use one or the other.
 * Covers everything a typical README/doc/note actually uses.
 */

type Inline =
	| { type: 'text'; value: string }
	| { type: 'strong'; children: Inline[] }
	| { type: 'em'; children: Inline[] }
	| { type: 'strike'; children: Inline[] }
	| { type: 'code'; value: string }
	| { type: 'link'; href: string; title?: string; children: Inline[] }
	| { type: 'image'; src: string; alt: string; title?: string }
	| { type: 'break' };

type Align = 'left' | 'center' | 'right' | null;

type Block =
	| { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
	| { type: 'paragraph'; children: Inline[] }
	| { type: 'code'; lang: string; value: string }
	| { type: 'quote'; children: Block[] }
	| { type: 'list'; ordered: boolean; start: number; tight: boolean; items: Block[][] }
	| { type: 'hr' }
	| { type: 'table'; align: Align[]; header: Inline[][]; rows: Inline[][][] };

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------

const RE_BLANK = /^\s*$/;
const RE_HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const RE_ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const RE_FENCE = /^( {0,3})(`{3,}|~{3,})[ \t]*(\S*)[ \t]*$/;
const RE_QUOTE = /^ {0,3}>[ \t]?(.*)$/;
const RE_BULLET = /^( {0,3})([-*+])(?: {1,4}| \t)(.*)$/;
const RE_ORDERED = /^( {0,3})(\d{1,9})([.)])(?: {1,4}| \t)(.*)$/;
const RE_TABLE_DELIM = /^ {0,3}\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function parseBlocks(lines: string[]): Block[] {
	const blocks: Block[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (RE_BLANK.test(line)) {
			i++;
			continue;
		}

		const fence = RE_FENCE.exec(line);
		if (fence) {
			const [, indent, marker, lang] = fence;
			const fenceChar = marker[0];
			const fenceLen = marker.length;
			const closeRe = new RegExp(`^ {0,3}${fenceChar}{${fenceLen},}[ \\t]*$`);
			const body: string[] = [];
			let j = i + 1;
			for (; j < lines.length; j++) {
				if (closeRe.test(lines[j])) {
					j++;
					break;
				}
				body.push(stripIndent(lines[j], indent.length));
			}
			blocks.push({ type: 'code', lang, value: body.join('\n') });
			i = j;
			continue;
		}

		const atx = RE_ATX.exec(line);
		if (atx) {
			const level = atx[1].length as 1 | 2 | 3 | 4 | 5 | 6;
			const text = (atx[2] ?? '').replace(/[ \t]+#+[ \t]*$/, '');
			blocks.push({ type: 'heading', level, children: parseInline(text) });
			i++;
			continue;
		}

		if (RE_HR.test(line)) {
			blocks.push({ type: 'hr' });
			i++;
			continue;
		}

		const quote = RE_QUOTE.exec(line);
		if (quote) {
			const body: string[] = [];
			let j = i;
			for (; j < lines.length; j++) {
				const m = RE_QUOTE.exec(lines[j]);
				if (!m) break;
				body.push(m[1]);
			}
			blocks.push({ type: 'quote', children: parseBlocks(body) });
			i = j;
			continue;
		}

		if (isTableStart(lines, i)) {
			const { block, next } = parseTable(lines, i);
			blocks.push(block);
			i = next;
			continue;
		}

		if (RE_BULLET.test(line) || RE_ORDERED.test(line)) {
			const { block, next } = parseList(lines, i);
			blocks.push(block);
			i = next;
			continue;
		}

		// Paragraph: consume until a blank line or the start of another block type.
		const body: string[] = [];
		let j = i;
		for (; j < lines.length; j++) {
			const l = lines[j];
			if (RE_BLANK.test(l)) break;
			if (
				j > i &&
				(RE_ATX.test(l) ||
					RE_HR.test(l) ||
					RE_FENCE.test(l) ||
					RE_QUOTE.test(l) ||
					RE_BULLET.test(l) ||
					RE_ORDERED.test(l) ||
					isTableStart(lines, j))
			) {
				break;
			}
			body.push(l);
		}
		blocks.push({ type: 'paragraph', children: parseInline(joinParagraphLines(body)) });
		i = j;
	}

	return blocks;
}

function stripIndent(line: string, max: number): string {
	let n = 0;
	while (n < max && n < line.length && line[n] === ' ') n++;
	return line.slice(n);
}

function joinParagraphLines(lines: string[]): string {
	let out = '';
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const isLast = i === lines.length - 1;
		const hardBreak = !isLast && (/ {2,}$/.test(line) || /\\$/.test(line));
		out += line.replace(/ {2,}$/, '').replace(/\\$/, '');
		if (!isLast) out += hardBreak ? '\n<br>\n' : ' ';
	}
	return out;
}

function isTableStart(lines: string[], i: number): boolean {
	const header = lines[i];
	const delim = lines[i + 1];
	if (delim === undefined) return false;
	if (!header.includes('|') && !RE_TABLE_DELIM.test(delim)) return false;
	return RE_TABLE_DELIM.test(delim);
}

function splitTableRow(line: string): string[] {
	let trimmed = line.trim();
	if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
	if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) trimmed = trimmed.slice(0, -1);
	const cells: string[] = [];
	let current = '';
	for (let i = 0; i < trimmed.length; i++) {
		if (trimmed[i] === '\\' && trimmed[i + 1] === '|') {
			current += '|';
			i++;
			continue;
		}
		if (trimmed[i] === '|') {
			cells.push(current.trim());
			current = '';
			continue;
		}
		current += trimmed[i];
	}
	cells.push(current.trim());
	return cells;
}

function parseTable(lines: string[], start: number): { block: Block; next: number } {
	const header = splitTableRow(lines[start]).map((c) => parseInline(c));
	const delimCells = splitTableRow(lines[start + 1]);
	const align: Align[] = delimCells.map((c) => {
		const left = c.startsWith(':');
		const right = c.endsWith(':');
		if (left && right) return 'center';
		if (right) return 'right';
		if (left) return 'left';
		return null;
	});

	const rows: Inline[][][] = [];
	let i = start + 2;
	for (; i < lines.length; i++) {
		if (RE_BLANK.test(lines[i]) || !lines[i].includes('|')) break;
		rows.push(splitTableRow(lines[i]).map((c) => parseInline(c)));
	}

	return { block: { type: 'table', align, header, rows }, next: i };
}

function parseList(lines: string[], start: number): { block: Block; next: number } {
	const first = lines[start];
	const ordered = RE_ORDERED.test(first);
	const re = ordered ? RE_ORDERED : RE_BULLET;
	const firstMatch = re.exec(first)!;
	const baseIndent = firstMatch[1].length;
	const startNum = ordered ? parseInt((firstMatch as RegExpExecArray)[2], 10) : 1;

	const items: Block[][] = [];
	let sawBlankBetweenItems = false;
	let i = start;

	while (i < lines.length) {
		const m = re.exec(lines[i]);
		if (!m || m[1].length !== baseIndent) break;

		// m[0] is the whole matched line up to and including the marker's
		// trailing space(s); its length already accounts for the leading
		// indent, so it doubles as the column where the item's content starts.
		const contentCol = m[0].length - m[m.length - 1].length;
		const itemLines: string[] = [m[m.length - 1]];
		let j = i + 1;
		let trailingBlanks = 0;

		for (; j < lines.length; j++) {
			const line = lines[j];
			if (RE_BLANK.test(line)) {
				trailingBlanks++;
				itemLines.push('');
				continue;
			}
			const indentLen = line.length - line.trimStart().length;
			if (indentLen >= contentCol) {
				trailingBlanks = 0;
				itemLines.push(stripIndent(line, contentCol));
				continue;
			}
			// Under-indented and not a continuation: either a new item at the
			// same list level, or content outside the list — either way, this
			// item (and the scan for the next one, if any) stops here.
			break;
		}
		// Trim trailing blank lines collected inside the item.
		while (itemLines.length && RE_BLANK.test(itemLines[itemLines.length - 1])) {
			itemLines.pop();
			if (trailingBlanks > 0) {
				sawBlankBetweenItems = true;
				trailingBlanks--;
			}
		}

		items.push(parseBlocks(itemLines));
		i = j;
	}

	const tight = !sawBlankBetweenItems && items.every((blocks) => blocks.length <= 1);

	return { block: { type: 'list', ordered, start: startNum, tight, items }, next: i };
}

// ---------------------------------------------------------------------------
// Inline parsing
// ---------------------------------------------------------------------------

function parseInline(text: string): Inline[] {
	const nodes: Inline[] = [];
	let buffer = '';

	const flush = () => {
		if (buffer) {
			nodes.push({ type: 'text', value: buffer });
			buffer = '';
		}
	};

	let i = 0;
	while (i < text.length) {
		const ch = text[i];
		const rest = text.slice(i);

		if (rest.startsWith('<br>')) {
			flush();
			nodes.push({ type: 'break' });
			i += 4;
			continue;
		}

		if (ch === '\\' && /[!-/:-@[-`{-~]/.test(text[i + 1] ?? '')) {
			buffer += text[i + 1];
			i += 2;
			continue;
		}

		if (ch === '`') {
			const run = /^`+/.exec(rest)![0];
			const n = run.length;
			const closeRe = new RegExp('`{' + n + '}(?!`)');
			const search = text.slice(i + n);
			const m = closeRe.exec(search);
			if (m) {
				flush();
				let content = search.slice(0, m.index);
				if (content.startsWith(' ') && content.endsWith(' ') && content.trim() !== '') {
					content = content.slice(1, -1);
				}
				nodes.push({ type: 'code', value: content });
				i += n + m.index + n;
				continue;
			}
			buffer += run;
			i += n;
			continue;
		}

		if (rest.startsWith('![') || ch === '[') {
			const isImage = rest.startsWith('![');
			const labelStart = i + (isImage ? 2 : 1);
			const label = findBalanced(text, labelStart, '[', ']');
			if (label) {
				const afterLabel = label.end;
				const dest = parseLinkDestination(text, afterLabel);
				if (dest) {
					flush();
					if (isImage) {
						nodes.push({
							type: 'image',
							src: dest.href,
							alt: label.content,
							title: dest.title
						});
					} else {
						nodes.push({
							type: 'link',
							href: dest.href,
							title: dest.title,
							children: parseInline(label.content)
						});
					}
					i = dest.end;
					continue;
				}
			}
			buffer += isImage ? '![' : '[';
			i += isImage ? 2 : 1;
			continue;
		}

		if (ch === '<') {
			const m = /^<((?:https?:\/\/|mailto:)?[^\s<>]+@[^\s<>]+|https?:\/\/[^\s<>]+)>/.exec(rest);
			if (m) {
				flush();
				const raw = m[1];
				const href = raw.includes('@') && !raw.startsWith('mailto:') ? `mailto:${raw}` : raw;
				nodes.push({ type: 'link', href, children: [{ type: 'text', value: raw }] });
				i += m[0].length;
				continue;
			}
		}

		if (/^https?:\/\//.test(rest)) {
			const m = /^https?:\/\/[^\s<>()]+[^\s<>().,!?;:'"]/.exec(rest);
			if (m) {
				flush();
				nodes.push({ type: 'link', href: m[0], children: [{ type: 'text', value: m[0] }] });
				i += m[0].length;
				continue;
			}
		}

		if (rest.startsWith('**') || rest.startsWith('__')) {
			const delim = rest.slice(0, 2);
			const close = text.indexOf(delim, i + 2);
			if (close !== -1 && close > i + 2) {
				flush();
				nodes.push({ type: 'strong', children: parseInline(text.slice(i + 2, close)) });
				i = close + 2;
				continue;
			}
		}

		if (rest.startsWith('~~')) {
			const close = text.indexOf('~~', i + 2);
			if (close !== -1 && close > i + 2) {
				flush();
				nodes.push({ type: 'strike', children: parseInline(text.slice(i + 2, close)) });
				i = close + 2;
				continue;
			}
		}

		if ((ch === '*' || ch === '_') && text[i + 1] !== ch) {
			const close = findEmClose(text, i + 1, ch);
			if (close !== -1 && close > i + 1) {
				flush();
				nodes.push({ type: 'em', children: parseInline(text.slice(i + 1, close)) });
				i = close + 1;
				continue;
			}
		}

		buffer += ch;
		i++;
	}

	flush();
	return mergeText(nodes);
}

function findEmClose(text: string, from: number, delim: string): number {
	for (let i = from; i < text.length; i++) {
		if (text[i] === delim && text[i - 1] !== ' ') {
			// Avoid grabbing the closer of a `**strong**` pair as an `*em*` close.
			if (text[i + 1] === delim && text[i - 1] === delim) continue;
			return i;
		}
	}
	return -1;
}

function findBalanced(
	text: string,
	from: number,
	open: string,
	close: string
): { content: string; end: number } | null {
	let depth = 1;
	let i = from;
	while (i < text.length) {
		if (text[i] === '\\') {
			i += 2;
			continue;
		}
		if (text[i] === open) depth++;
		else if (text[i] === close) {
			depth--;
			if (depth === 0) return { content: text.slice(from, i), end: i + 1 };
		}
		i++;
	}
	return null;
}

function parseLinkDestination(
	text: string,
	from: number
): { href: string; title?: string; end: number } | null {
	if (text[from] !== '(') return null;
	let i = from + 1;
	while (text[i] === ' ') i++;

	let href: string;
	if (text[i] === '<') {
		const end = text.indexOf('>', i + 1);
		if (end === -1) return null;
		href = text.slice(i + 1, end);
		i = end + 1;
	} else {
		const start = i;
		let depth = 0;
		while (i < text.length) {
			if (text[i] === '(') depth++;
			else if (text[i] === ')') {
				if (depth === 0) break;
				depth--;
			} else if (/\s/.test(text[i])) break;
			i++;
		}
		href = text.slice(start, i);
	}

	while (text[i] === ' ') i++;

	let title: string | undefined;
	if (text[i] === '"' || text[i] === "'") {
		const quote = text[i];
		const end = text.indexOf(quote, i + 1);
		if (end === -1) return null;
		title = text.slice(i + 1, end);
		i = end + 1;
		while (text[i] === ' ') i++;
	}

	if (text[i] !== ')') return null;
	return { href, title, end: i + 1 };
}

function mergeText(nodes: Inline[]): Inline[] {
	const out: Inline[] = [];
	for (const node of nodes) {
		const prev = out[out.length - 1];
		if (node.type === 'text' && prev?.type === 'text') {
			prev.value += node.value;
		} else {
			out.push(node);
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function isSafeUrl(url: string): boolean {
	return !/^\s*(javascript|data|vbscript):/i.test(url);
}

function renderInline(nodes: Inline[]): string {
	return nodes
		.map((node): string => {
			switch (node.type) {
				case 'text':
					return escapeHtml(node.value);
				case 'strong':
					return `<strong>${renderInline(node.children)}</strong>`;
				case 'em':
					return `<em>${renderInline(node.children)}</em>`;
				case 'strike':
					return `<del>${renderInline(node.children)}</del>`;
				case 'code':
					return `<code>${escapeHtml(node.value)}</code>`;
				case 'break':
					return '<br>';
				case 'link': {
					const href = isSafeUrl(node.href) ? escapeHtml(node.href) : '#';
					const title = node.title ? ` title="${escapeHtml(node.title)}"` : '';
					return `<a href="${href}"${title}>${renderInline(node.children)}</a>`;
				}
				case 'image': {
					const src = isSafeUrl(node.src) ? escapeHtml(node.src) : '';
					const title = node.title ? ` title="${escapeHtml(node.title)}"` : '';
					return `<img src="${src}" alt="${escapeHtml(node.alt)}"${title}>`;
				}
			}
		})
		.join('');
}

function renderBlocks(blocks: Block[]): string {
	return blocks.map(renderBlock).join('\n');
}

function renderListItem(blocks: Block[], tight: boolean): string {
	if (tight && blocks.length === 1 && blocks[0].type === 'paragraph') {
		return `<li>${renderInline(blocks[0].children)}</li>`;
	}
	if (blocks.length === 0) return '<li></li>';
	return `<li>${renderBlocks(blocks)}</li>`;
}

function renderBlock(block: Block): string {
	switch (block.type) {
		case 'heading':
			return `<h${block.level}>${renderInline(block.children)}</h${block.level}>`;
		case 'paragraph':
			return `<p>${renderInline(block.children)}</p>`;
		case 'code': {
			const langClass = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : '';
			return `<pre><code${langClass}>${escapeHtml(block.value)}</code></pre>`;
		}
		case 'quote':
			return `<blockquote>\n${renderBlocks(block.children)}\n</blockquote>`;
		case 'hr':
			return '<hr>';
		case 'list': {
			const tag = block.ordered ? 'ol' : 'ul';
			const startAttr = block.ordered && block.start !== 1 ? ` start="${block.start}"` : '';
			const items = block.items.map((item) => renderListItem(item, block.tight)).join('\n');
			return `<${tag}${startAttr}>\n${items}\n</${tag}>`;
		}
		case 'table': {
			const alignStyle = (a: Align) => (a ? ` style="text-align:${a}"` : '');
			const head = block.header
				.map((cell, i) => `<th${alignStyle(block.align[i] ?? null)}>${renderInline(cell)}</th>`)
				.join('');
			const rows = block.rows
				.map(
					(row) =>
						`<tr>${row
							.map(
								(cell, i) => `<td${alignStyle(block.align[i] ?? null)}>${renderInline(cell)}</td>`
							)
							.join('')}</tr>`
				)
				.join('\n');
			return `<table>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${rows}\n</tbody>\n</table>`;
		}
	}
}

/** Parses a Markdown string and returns escaped, render-ready HTML. */
export function renderMarkdown(source: string): string {
	const lines = source.replace(/\r\n?/g, '\n').split('\n');
	const blocks = parseBlocks(lines);
	return renderBlocks(blocks);
}
