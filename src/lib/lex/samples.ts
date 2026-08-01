// Named groups (name/email) so "Load sample" demonstrates the one feature that's easy to miss
// exists at all — the group list below the matches renders straight from match.groups.
export const SAMPLE_PATTERN = String.raw`(?<name>[A-Z][a-z]+ [A-Z][a-z]+)\s*<(?<email>[\w.+-]+@[\w.-]+\.[a-z]{2,})>`;

export const SAMPLE_FLAGS = { g: true, i: false, m: false, s: false, u: false, y: false };

export const SAMPLE_TEXT = `Team roster:
Ada Lovelace <ada@example.com>
Grace Hopper <grace@example.com>
(not a match — just a note about the offsite)
Alan Turing <alan@example.org>`;

export const SAMPLE_REPLACEMENT = '$<name> (→ $<email>)';
