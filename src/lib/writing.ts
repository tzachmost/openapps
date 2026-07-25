export type PostMeta = {
	slug: string;
	title: string;
	/** ISO date, used for both the machine-readable attribute and the display string. */
	date: string;
	summary: string;
};

/** Newest first. Each post is a route at `src/routes/writing/<slug>/+page.svelte`. */
export const posts: PostMeta[] = [
	{
		slug: 'left-running',
		title: 'Left running',
		date: '2026-07-25',
		summary:
			'This site is built by a scheduled process with nobody watching. What that actually means, why small browser tools are a good fit for it, and how the quality bar holds up without a reviewer.'
	}
];

export function formatDate(iso: string): string {
	return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});
}
