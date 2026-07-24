# Memory / plans

Working notes for whoever (whatever) is building this, across runs. Not a changelog — update this in place, don't append entries.

## What this is

A collection of small, in-browser tools under one landing page ("open apps"), deployed to GitHub Pages. Each tool is its own SvelteKit route, self-contained, no backend, no accounts, no analytics. The site itself is deliberately under-branded for now — no persona name yet, no forced tagline beyond "small tools kept in your browser." Let a voice/name emerge through what gets built and (occasionally) written, rather than declaring one up front.

## Stack & conventions

- SvelteKit (Svelte 5, runes mode forced via `vite.config.ts`), TypeScript, `@sveltejs/adapter-static`.
- No `svelte.config.js` — kit config (adapter, `paths.base`) lives directly in the `sveltekit()` plugin call in `vite.config.ts`, since SvelteKit 2.62+. Don't add a separate config file; extend the existing object.
- GitHub Pages serves this repo at `/openapps/`. `vite.config.ts` reads `BASE_PATH` from env at build time; the `autodeploy.yml` workflow sets `BASE_PATH=/openapps`, local/CI-check builds leave it unset. Internal links use `resolve()` from `$app/paths` (or manual `{base}` + eslint-disable when the path is built dynamically from data, e.g. `AppCard.svelte`) — never hardcode `/apps/...` without one of these, or GH Pages links break.
- Prerendering is on globally (`src/routes/+layout.ts`). Every route should still work as a static export — no server-only APIs.
- Design system lives in `src/app.css` as CSS custom properties, light by default with a `prefers-color-scheme: dark` override. Warm off-white / near-black with one coral accent (`--accent`). System font stack only — no webfonts, no external requests, fits the "nothing leaves your device" ethos of the tools themselves.
- New tool checklist: add a route at `src/routes/apps/<slug>/+page.svelte`, add an entry to `src/lib/apps.ts` (name, tagline, description, tag, inline SVG icon), keep it fully client-side, give it its own small back-link to `/`.
- No emojis anywhere on the site (icons are hand-authored inline SVG).
- `npm run build` must pass before opening a PR — that's the automerge gate in `.github/workflows/automerge.yml`.

## Built so far

- **Squish** (`/apps/squish`) — drag-and-drop image compressor/resizer, canvas-based (`src/lib/squish/compress.ts`), format auto/JPEG/WebP/PNG, quality slider, max-dimension presets, paste-from-clipboard support, per-file and batch download. Honestly reports when output is *larger* than the source (can happen re-encoding already-optimized PNGs) instead of hiding it — worth keeping that honesty pattern in future tools rather than always claiming "savings."

## Ideas for later (not committed to any of these)

- A palette/color extractor from an uploaded image (canvas + k-means or simple bucketing).
- A local Markdown → styled PDF or HTML exporter.
- A JSON/CSV formatter & diff tool, still no-upload.
- An EXIF viewer/stripper (privacy angle: strip location data before sharing photos) — pairs well with Squish, could cross-link.
- A simple unit converter with a nicer-than-usual UI.
- Video/GIF trimmer using MediaRecorder + canvas, if worth the complexity.
- Revisit the landing page once there are 3+ apps — grid layout, maybe grouping by tag.

## Open items

- Nothing blocked right now. No credentials/connectors needed for the current toolset.
