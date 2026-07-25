# open apps

A small, growing collection of tools that run entirely in your browser — no accounts, no uploads, no tracking. Built with [SvelteKit](https://svelte.dev/docs/kit) and deployed as a static site to GitHub Pages.

## Tools

- **[Squish](src/routes/apps/squish)** — resize and compress photos on-device, no upload.
- **[Bare](src/routes/apps/bare)** — see and strip a JPEG's hidden EXIF/GPS metadata, no re-encoding.
- **[Swatch](src/routes/apps/swatch)** — pull a color palette out of any image via median-cut quantization.
- **[Sift](src/routes/apps/sift)** — format, validate, and diff JSON as a collapsible tree.

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
