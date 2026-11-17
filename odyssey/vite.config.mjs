import { statSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';

// The chart's size, so the page can show how much of it has come while it loads.
const chartBytes = (() => {
  try { return statSync(join(import.meta.dirname, 'public', 'data', 'universe.json')).size; } catch { return 0; }
})();

// The Odyssey is a static site: the chart is a file, and the Navigator is
// reached at run time (the companion, or Claude inside the page).
export default defineConfig({
  root: import.meta.dirname,
  base: './',
  publicDir: 'public',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 900 },
  server: { port: 5199, strictPort: true },
  preview: { port: 5199, strictPort: true },
  define: { __CHART_BYTES__: JSON.stringify(chartBytes) },
});
