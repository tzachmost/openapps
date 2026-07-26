const DOCUMENT_CSS = `
	:root { color-scheme: light; }
	* { box-sizing: border-box; }
	body {
		margin: 0;
		background: #faf8f4;
		font-family: ui-serif, Georgia, 'Times New Roman', serif;
		color: #1c1a16;
		line-height: 1.65;
		font-size: 17px;
	}
	.folio-doc {
		max-width: 38rem;
		margin: 0 auto;
		padding: 4rem 1.5rem 6rem;
	}
	h1, h2, h3, h4, h5, h6 {
		font-family: ui-sans-serif, system-ui, sans-serif;
		line-height: 1.25;
		letter-spacing: -0.01em;
		margin: 1.8em 0 0.5em;
	}
	h1 { font-size: 2rem; margin-top: 0; }
	h2 { font-size: 1.5rem; }
	h3 { font-size: 1.2rem; }
	p, ul, ol, blockquote, table, pre { margin: 0 0 1.1em; }
	ul, ol { padding-left: 1.4em; }
	li { margin: 0.3em 0; }
	a { color: #b8410f; }
	strong { font-weight: 700; }
	code {
		font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
		font-size: 0.88em;
		background: rgba(23, 21, 15, 0.06);
		padding: 0.15em 0.35em;
		border-radius: 4px;
	}
	pre {
		background: rgba(23, 21, 15, 0.05);
		border: 1px solid rgba(23, 21, 15, 0.1);
		border-radius: 8px;
		padding: 1em 1.1em;
		overflow-x: auto;
	}
	pre code { background: none; padding: 0; font-size: 0.85em; }
	blockquote {
		margin-left: 0;
		padding-left: 1em;
		border-left: 3px solid rgba(23, 21, 15, 0.18);
		color: #4a463c;
	}
	hr { border: none; border-top: 1px solid rgba(23, 21, 15, 0.18); margin: 2em 0; }
	table { border-collapse: collapse; width: 100%; font-size: 0.95em; }
	th, td { border: 1px solid rgba(23, 21, 15, 0.16); padding: 0.5em 0.75em; text-align: left; }
	th { background: rgba(23, 21, 15, 0.04); }
	img { max-width: 100%; border-radius: 6px; }
	@media print {
		body { background: #fff; }
		.folio-doc { max-width: none; padding: 0; }
		a { color: inherit; text-decoration: underline; }
	}
`;

/** Wraps rendered Markdown HTML into a self-contained, styled HTML document. */
export function buildStandaloneDocument(bodyHtml: string, title: string): string {
	const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>${DOCUMENT_CSS}</style>
</head>
<body>
<article class="folio-doc">
${bodyHtml}
</article>
</body>
</html>
`;
}

export { DOCUMENT_CSS };
