// The one tool on this site that remembers anything between visits — still
// entirely on-device (localStorage never leaves the browser, same as every
// other tool's "nothing is ever uploaded" promise), just persisted instead of
// reset on reload. Worth it here: a saved list of timezones is the whole
// point of a team/travel clock, unlike a one-shot file editor.

const STORAGE_KEY = 'meridian:zones';

export function loadSavedZones(): string[] | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return null;
		const ids = parsed.filter((id): id is string => typeof id === 'string');
		return ids.length > 0 ? ids : null;
	} catch {
		return null;
	}
}

export function saveZones(ids: string[]): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
	} catch {
		// Storage disabled or full — the tool still works, it just won't remember zones next visit.
	}
}
