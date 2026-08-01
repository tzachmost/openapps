/**
 * One-shot handoff for the landing page's file-drop hub: stash a File before navigating to the
 * matched tool's page, so it doesn't have to be dropped a second time. Plain module state, not a
 * store — SvelteKit's client-side router doesn't reload this module on an internal link click, so
 * the value survives the navigation, and each tool page reads it exactly once at init and clears
 * it, so a later reload or revisit never resurfaces a stale file.
 */

let pending: File | null = null;

export function setPendingFile(file: File): void {
	pending = file;
}

export function takePendingFile(): File | null {
	const file = pending;
	pending = null;
	return file;
}
