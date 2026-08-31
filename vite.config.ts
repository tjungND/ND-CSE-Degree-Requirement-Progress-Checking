import { defineConfig } from 'vite';

// base './' → relative asset paths, so dist/ works on GitHub Pages under a
// project path, on any plain web host, from file://, and inside an <iframe>
// on cse.nd.edu (CLAUDE.md "Static deployment").
//
// Tests do NOT run through vite — see the note in package.json.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
