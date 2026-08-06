import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// On GitHub Pages a project site is served from /<repo-name>, so every asset URL
// needs that prefix. The deploy workflow sets BASE_PATH; local dev leaves it empty.
const base = process.env.BASE_PATH ?? '';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			paths: { base }
		})
	]
});
