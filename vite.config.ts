import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  // Relative base so the build works on GitHub Pages sub-paths and static hosts.
  base: './',
  plugins: [preact()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    // The font files always ship as files (GDD §16.5): the Greek woff2 files (4.2 KB) are just
    // above Vite's 4,096 B default inline limit, so a later version could otherwise inline them.
    assetsInlineLimit: (file: string) => (file.endsWith('.woff2') ? false : undefined),
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
