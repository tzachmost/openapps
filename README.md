# open apps

A small, growing collection of tools that run entirely in your browser — no accounts, no uploads, no tracking. Built with [SvelteKit](https://svelte.dev/docs/kit) and deployed as a static site to GitHub Pages.

## Tools

- **[Darkroom](src/routes/apps/darkroom)** — one shared queue, five things to do with an image: compress, strip hidden EXIF/GPS metadata, pull a color palette, mount a screenshot with a background and shadow, or package a full favicon set. (Formerly five separate tools — Squish, Bare, Swatch, Mat, and Crest — merged once the shared component library shipped.)
- **[Prism](src/routes/apps/prism)** — a color picker with harmonies and an accessibility/colorblind check, plus a mesh-gradient builder. (Formerly Hue and Bloom.)
- **[Sift](src/routes/apps/sift)** — format, validate, and diff JSON as a collapsible tree.
- **[Delta](src/routes/apps/delta)** — compare two versions of any text — line diff, word-level highlighting, and a real unified `.patch` export.
- **[Claim](src/routes/apps/claim)** — decode a JWT's header and claims, check its expiry, verify its signature, or build and sign one from scratch.
- **[Lex](src/routes/apps/lex)** — write a pattern, paste a test string, see every match highlight live.
- **[Convert](src/routes/apps/convert)** — length, weight, temperature, area, volume, speed, time, and data storage — type into any field, every other unit updates live.
- **[Folio](src/routes/apps/folio)** — a Markdown editor with a live, typeset preview.
- **[Beacon](src/routes/apps/beacon)** — turn text or a URL into a QR code, hand-rolled encoder.
- **[Ease](src/routes/apps/ease)** — shape a cubic-bezier easing curve and feel it move.
- **[Meridian](src/routes/apps/meridian)** — see what time it is everywhere at once, with saved zones.
- **[Loop](src/routes/apps/loop)** — trim a video clip into an animated GIF.
- **[Splice](src/routes/apps/splice)** — trim and fade an audio clip, export a clean WAV.
- **[Seal](src/routes/apps/seal)** — checksum a file or a string, verify it against an expected hash.
- **[Ward](src/routes/apps/ward)** — generate a password or diceware passphrase from real cryptographic randomness.

## Developing

```sh
npm install
npm run dev -- --open
```

## Building

```sh
npm run build
npm run preview
```

The production build targets GitHub Pages, which serves this repo at `/openapps/`. Set `BASE_PATH=/openapps` when building for that deployment (the CI workflow does this automatically); leave it unset for local builds.

## Adding a tool

Each tool lives at `src/routes/apps/<slug>` and is listed in `src/lib/apps.ts`. Keep each one self-contained, client-only, and true to the site's design system in `src/app.css`.
