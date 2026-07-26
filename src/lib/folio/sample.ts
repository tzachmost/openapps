export const SAMPLE = `# Folio

A small Markdown editor with a live, typeset preview — everything below is
rendered as you type, entirely in your browser.

## Why another Markdown tool?

Most online previewers either want an account or ship your text to a server
first. Folio does neither: it parses Markdown with a hand-rolled renderer
(no dependency, ~500 lines) and never sends a single byte anywhere. When
you're happy with the result, **download it as a standalone HTML file** or
use **Print → Save as PDF** for a paginated copy.

## What it handles

- Headings, paragraphs, and *emphasis* (**bold**, _italic_, ~~strikethrough~~)
- Ordered and unordered lists, including nested ones:
  1. Like this
  2. And this
     - with a bullet
     - tucked inside
- Blockquotes:

  > A quote reads a little quieter than the text around it.

- \`Inline code\` and fenced code blocks:

\`\`\`js
function shrug() {
  return 'no server involved';
}
\`\`\`

- Links (both [written out](https://example.com) and bare https://example.com/autolinked)
- Tables:

| Tool | Handles |
| :-- | --: |
| Squish | images |
| Sift | JSON |
| Folio | text |

---

It's a pragmatic subset of Markdown, not the full CommonMark spec — no
reference-style links or raw HTML passthrough — but it covers what a
README, a note, or a quick write-up actually uses. Clear the editor and
start on your own whenever you're ready.
`;
