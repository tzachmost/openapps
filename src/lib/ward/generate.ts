import { WORDLIST } from './wordlist';

// Every draw in this file goes through crypto.getRandomValues — never Math.random, which
// is not specified to be cryptographically secure and isn't a safe source for anything
// meant to resist guessing. randomInt uses rejection sampling (discard-and-redraw on the
// short top slice of the 32-bit range) rather than a plain modulo, so every remainder stays
// exactly as likely as every other one instead of the low remainders being ever so slightly
// overrepresented — the classic "modulo bias" a naive `getRandomValues()[0] % max` has.
function randomInt(maxExclusive: number): number {
	const range = 2 ** 32;
	const limit = range - (range % maxExclusive);
	const buf = new Uint32Array(1);
	let value: number;
	do {
		crypto.getRandomValues(buf);
		value = buf[0];
	} while (value >= limit);
	return value % maxExclusive;
}

const CHARSETS = {
	lower: 'abcdefghijklmnopqrstuvwxyz',
	upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
	digits: '0123456789',
	// Avoids quotes, backslash, and backtick — the handful of symbols most likely to need
	// escaping wherever the password ends up (a shell, a CSV, a URL, a JSON string).
	symbols: '!@#$%^&*()-_=+[]{};:,.<>/?'
} as const;

const AMBIGUOUS = new Set(['I', 'l', '1', 'O', '0', 'o']);

export type PasswordOptions = {
	length: number;
	lower: boolean;
	upper: boolean;
	digits: boolean;
	symbols: boolean;
	excludeAmbiguous: boolean;
	requireEachType: boolean;
};

export type PassphraseOptions = {
	wordCount: number;
	separator: string;
	capitalize: boolean;
	appendNumber: boolean;
};

export type GeneratedSecret = { value: string; entropyBits: number };

function buildCategories(opts: PasswordOptions): { chars: string }[] {
	const raw: string[] = [];
	if (opts.lower) raw.push(CHARSETS.lower);
	if (opts.upper) raw.push(CHARSETS.upper);
	if (opts.digits) raw.push(CHARSETS.digits);
	if (opts.symbols) raw.push(CHARSETS.symbols);

	return raw
		.map((chars) =>
			opts.excludeAmbiguous ? [...chars].filter((ch) => !AMBIGUOUS.has(ch)).join('') : chars
		)
		.filter((chars) => chars.length > 0)
		.map((chars) => ({ chars }));
}

/** null means no character type is selected — nothing to draw from. */
export function generatePassword(opts: PasswordOptions): GeneratedSecret | null {
	const categories = buildCategories(opts);
	if (categories.length === 0) return null;

	const pool = [...categories.map((c) => c.chars).join('')];
	const entropyBits = opts.length * Math.log2(pool.length);
	// Requiring one of every selected category is only satisfiable when there's room for
	// each of them — with the length floor this UI offers that's never actually false, but
	// checked explicitly rather than assumed, so a future lower minimum can't silently start
	// looping forever below.
	const enforce = opts.requireEachType && opts.length >= categories.length;

	// Rejection sampling: draw a fully random string, keep it only if it happens to satisfy
	// the "at least one of each" constraint, otherwise throw the whole draw away and try
	// again. This keeps every *qualifying* string exactly as likely as every other one — no
	// character position is ever fixed to a particular category the way naive
	// "one guaranteed uppercase here, one guaranteed digit there" generators do, which would
	// leak structure and quietly shrink the real entropy below what's reported.
	const maxAttempts = 1000;
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const chars: string[] = [];
		for (let i = 0; i < opts.length; i++) chars.push(pool[randomInt(pool.length)]);
		if (!enforce || categories.every((c) => chars.some((ch) => c.chars.includes(ch)))) {
			return { value: chars.join(''), entropyBits };
		}
	}
	// Astronomically unlikely to be reached with any realistic length/category combination —
	// falls through to an unconstrained draw rather than ever hanging.
	const chars: string[] = [];
	for (let i = 0; i < opts.length; i++) chars.push(pool[randomInt(pool.length)]);
	return { value: chars.join(''), entropyBits };
}

export function generatePassphrase(opts: PassphraseOptions): GeneratedSecret {
	const words: string[] = [];
	for (let i = 0; i < opts.wordCount; i++) {
		words.push(WORDLIST[randomInt(WORDLIST.length)]);
	}
	const rendered = words.map((w) => (opts.capitalize ? w[0].toUpperCase() + w.slice(1) : w));

	let entropyBits = opts.wordCount * Math.log2(WORDLIST.length);
	let parts = rendered;
	if (opts.appendNumber) {
		const n = randomInt(100);
		parts = [...rendered, String(n).padStart(2, '0')];
		entropyBits += Math.log2(100);
	}
	return { value: parts.join(opts.separator), entropyBits };
}

export type Strength = { label: string; level: 0 | 1 | 2 | 3 | 4 };

export function strengthOf(entropyBits: number): Strength {
	if (entropyBits < 35) return { label: 'Very weak', level: 0 };
	if (entropyBits < 50) return { label: 'Weak', level: 1 };
	if (entropyBits < 65) return { label: 'Fair', level: 2 };
	if (entropyBits < 90) return { label: 'Strong', level: 3 };
	return { label: 'Very strong', level: 4 };
}

// Illustrative, not a promise: one stated, fairly aggressive assumption (10 billion guesses
// a second — roughly what a fast offline attack against a weakly-hashed leak can reach) run
// through straightforward math, not a model of any real attacker or storage scheme. A slow,
// salted hash resists far more than this number implies; plaintext or a fast unsalted hash
// resists far less. Treat the result as an order of magnitude, never a guarantee.
const GUESSES_PER_SECOND = 1e10;

export function estimateCrackTime(entropyBits: number): string {
	const combinations = Math.pow(2, entropyBits);
	const seconds = combinations / GUESSES_PER_SECOND / 2;
	return formatDuration(seconds);
}

function formatDuration(seconds: number): string {
	if (seconds < 1) return 'instantly';

	const YEAR = 31_557_600; // 365.25 days, average
	if (seconds < 60) return `~${Math.round(seconds)} second${Math.round(seconds) === 1 ? '' : 's'}`;
	if (seconds < 3600) return `~${Math.round(seconds / 60)} minutes`;
	if (seconds < 86400) return `~${Math.round(seconds / 3600)} hours`;
	if (seconds < YEAR) return `~${Math.round(seconds / 86400)} days`;

	const years = seconds / YEAR;
	if (years < 1e3) return `~${Math.round(years)} years`;
	if (years < 1e6) return `~${Math.round(years / 1e3)} thousand years`;
	if (years < 1e9) return `~${Math.round(years / 1e6)} million years`;
	if (years < 1e12) return `~${Math.round(years / 1e9)} billion years`;
	if (years < 1e15) return `~${Math.round(years / 1e12)} trillion years`;
	return `~10^${Math.floor(Math.log10(years))} years`;
}

export const WORDLIST_SIZE = WORDLIST.length;
