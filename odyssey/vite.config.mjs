import { defineConfig } from 'vite';

// The Odyssey is a static site: the chart is a file, and the Navigator is
// reached at run time (the companion, or Claude inside the page).
export default defineConfig({
  root: import.meta.dirname,
  base: './',
  publicDir: 'public',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 900 },
  server: { port: 5199, strictPort: true },
  preview: { port: 5199, strictPort: true },
});
