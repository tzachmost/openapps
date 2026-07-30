// All timezone math routes through Intl (built into every modern browser's ICU
// data, no bundled tz database needed) rather than a hand-rolled implementation
// — unlike the site's from-scratch binary/crypto formats, there's no honest
// reason to reimplement IANA tz rules when the platform already ships them.

export type WallTime = {
	year: number;
	month: number; // 1-12
	day: number;
	hour: number; // 0-23
	minute: number;
	weekday: string; // locale-short, e.g. "Tue"
};

export type Band = 'day' | 'twilight' | 'night';

const HOUR_MS = 3_600_000;

// A curated fallback for browsers without `Intl.supportedValuesOf` (Safari
// < 15.4) — one representative zone per populated region so search/add still
// works, just with a shorter list. Everything else (wall-clock math, offsets)
// only needs a valid IANA id and works identically either way.
const FALLBACK_ZONES = [
	'UTC',
	'America/Los_Angeles',
	'America/Denver',
	'America/Chicago',
	'America/New_York',
	'America/Sao_Paulo',
	'America/Mexico_City',
	'America/Toronto',
	'Europe/London',
	'Europe/Lisbon',
	'Europe/Paris',
	'Europe/Berlin',
	'Europe/Warsaw',
	'Europe/Athens',
	'Europe/Moscow',
	'Africa/Cairo',
	'Africa/Lagos',
	'Africa/Johannesburg',
	'Africa/Nairobi',
	'Asia/Jerusalem',
	'Asia/Dubai',
	'Asia/Karachi',
	'Asia/Kolkata',
	'Asia/Dhaka',
	'Asia/Bangkok',
	'Asia/Jakarta',
	'Asia/Shanghai',
	'Asia/Hong_Kong',
	'Asia/Singapore',
	'Asia/Seoul',
	'Asia/Tokyo',
	'Australia/Perth',
	'Australia/Adelaide',
	'Australia/Sydney',
	'Pacific/Auckland',
	'Pacific/Honolulu'
];

let cachedZones: string[] | null = null;

export function listTimeZones(): string[] {
	if (cachedZones) return cachedZones;
	cachedZones =
		typeof Intl.supportedValuesOf === 'function'
			? [...Intl.supportedValuesOf('timeZone')]
			: FALLBACK_ZONES;
	return cachedZones;
}

export function detectHomeZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
	} catch {
		return 'UTC';
	}
}

// A handful of IANA ids whose canonical spelling — what
// `Intl.supportedValuesOf('timeZone')` itself returns — is a city's old or
// colonial-era name; ECMA-402's canonicalization table hasn't caught up to
// these renames. Shown with the modern name since that's what anyone would
// actually search for; the raw id (still findable by its old name, since the
// id itself is also matched below) is what every lookup and wall-clock
// computation underneath actually uses, untouched.
const CITY_OVERRIDES: Record<string, string> = {
	'Asia/Calcutta': 'Kolkata',
	'Asia/Rangoon': 'Yangon',
	'Asia/Saigon': 'Ho Chi Minh City',
	'Europe/Kiev': 'Kyiv'
};

export function zoneLabel(id: string): { city: string; region: string } {
	const parts = id.split('/');
	const city = CITY_OVERRIDES[id] ?? (parts[parts.length - 1] ?? id).replace(/_/g, ' ');
	const region = parts.slice(0, -1).join(' / ').replace(/_/g, ' ');
	return { city, region };
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function cachedFormatter(zone: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	const key = `${zone}|${JSON.stringify(opts)}`;
	let dtf = formatterCache.get(key);
	if (!dtf) {
		dtf = new Intl.DateTimeFormat('en-US', { timeZone: zone, ...opts });
		formatterCache.set(key, dtf);
	}
	return dtf;
}

const WALL_OPTS: Intl.DateTimeFormatOptions = {
	hourCycle: 'h23',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	weekday: 'short'
};

export function wallTimeAt(zone: string, instant: Date): WallTime {
	const parts = cachedFormatter(zone, WALL_OPTS).formatToParts(instant);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
	const hour = Number(get('hour'));
	return {
		year: Number(get('year')),
		month: Number(get('month')),
		day: Number(get('day')),
		hour: hour === 24 ? 0 : hour,
		minute: Number(get('minute')),
		weekday: get('weekday')
	};
}

/** Minutes east of UTC for `zone` at `instant` (negative west), DST already applied. */
export function zoneOffsetMinutes(zone: string, instant: Date): number {
	const w = wallTimeAt(zone, instant);
	const asUTC = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
	return Math.round((asUTC - instant.getTime()) / 60_000);
}

export function zoneAbbreviation(zone: string, instant: Date): string {
	const parts = cachedFormatter(zone, { timeZoneName: 'short', hour: '2-digit' }).formatToParts(
		instant
	);
	return parts.find((p) => p.type === 'timeZoneName')?.value ?? zone;
}

export function zoneOffsetLabel(zone: string, instant: Date): string {
	const parts = cachedFormatter(zone, {
		timeZoneName: 'shortOffset',
		hour: '2-digit'
	}).formatToParts(instant);
	const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
	return raw.replace('GMT', 'UTC') || 'UTC+0';
}

export function formatClock(zone: string, instant: Date, use24h: boolean): string {
	const text = cachedFormatter(zone, {
		hour: 'numeric',
		minute: '2-digit',
		hourCycle: use24h ? 'h23' : 'h12'
	}).format(instant);
	return use24h ? text : text.toLowerCase().replace(/\s+/g, '');
}

export function formatDateLabel(zone: string, instant: Date): string {
	return cachedFormatter(zone, { weekday: 'short', month: 'short', day: 'numeric' }).format(
		instant
	);
}

function epochDay(w: WallTime): number {
	return Math.floor(Date.UTC(w.year, w.month - 1, w.day) / 86_400_000);
}

/** Days `zone`'s calendar date at `instant` sits from `homeZone`'s — 0 if same day. */
export function dayDelta(zone: string, homeZone: string, instant: Date): number {
	return epochDay(wallTimeAt(zone, instant)) - epochDay(wallTimeAt(homeZone, instant));
}

/**
 * UTC instant of `homeZone`'s local midnight on the day containing `now`.
 * Uses `now`'s own offset as the conversion factor — off by at most the DST
 * shift amount in the rare case a transition falls between midnight and `now`
 * on the same day, which doesn't matter for a scheduling helper.
 */
export function homeMidnightInstant(homeZone: string, now: Date): Date {
	const wall = wallTimeAt(homeZone, now);
	const naiveUTC = Date.UTC(wall.year, wall.month - 1, wall.day, 0, 0, 0);
	const offsetMin = zoneOffsetMinutes(homeZone, now);
	return new Date(naiveUTC - offsetMin * 60_000);
}

export function bandForHour(hour: number): Band {
	if (hour >= 7 && hour < 19) return 'day';
	if ((hour >= 6 && hour < 7) || (hour >= 19 && hour < 20)) return 'twilight';
	return 'night';
}

/** 24 hourly bands for `zone`, one per home-referenced hour starting at `homeMidnight`. */
export function daySegments(zone: string, homeMidnight: Date): Band[] {
	const bands: Band[] = [];
	for (let i = 0; i < 24; i++) {
		const instant = new Date(homeMidnight.getTime() + (i + 0.5) * HOUR_MS);
		bands.push(bandForHour(wallTimeAt(zone, instant).hour));
	}
	return bands;
}

export function instantFromFrac(homeMidnight: Date, frac: number): Date {
	return new Date(homeMidnight.getTime() + frac * HOUR_MS);
}
