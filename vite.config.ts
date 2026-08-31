import { defineConfig } from 'vitest/config';

// base './' → relative asset paths, so dist/ works on GitHub Pages under a
// project path, on any plain web host, from file://, and inside an <iframe>
// on cse.nd.edu (CLAUDE.md "Static deployment").
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
