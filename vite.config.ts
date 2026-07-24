import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// GitHub Pages serves this project from /openapps/, so builds need that base
// path baked in. Local dev keeps an empty base so `npm run dev` still works.
const envBase = process.env.BASE_PATH;
const base = envBase && envBase.startsWith('/') ? (envBase as `/${string}`) : '';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			paths: { base },
			adapter: adapter({ fallback: '404.html' })
		})
	]
});
