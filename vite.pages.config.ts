// Static build of AFTERIMAGE for GitHub Pages. There is no server: the page is
// compiled with the companion's public address, which then serves the private
// routes (reels, Atlases, film search) behind the owner's passphrase.
//
//   AFTERIMAGE_COMPANION_URL=https://… npm run build:pages
import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import manifest from './app/manifest';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export function companionUrl(value = ''): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  let url: URL;
  try { url = new URL(trimmed); } catch {
    throw new Error('Set AFTERIMAGE_COMPANION_URL to the companion\'s address, such as https://afterimage-claude.up.railway.app.');
  }
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new Error('AFTERIMAGE_COMPANION_URL must use HTTPS.');
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('AFTERIMAGE_COMPANION_URL must be just the companion\'s origin, with no path or credentials.');
  }
  return url.origin;
}

export function pagesBase(value = '/afterimage-site/'): string {
  const base = '/' + value.trim().replace(/^\/+|\/+$/g, '') + '/';
  return base === '//' ? '/' : base;
}

// The web app manifest from app/manifest.ts, with paths under the Pages base.
function webManifest(base: string): Plugin {
  return {
    name: 'afterimage-web-manifest',
    transformIndexHtml(html) {
      return html.replace('href="/manifest.webmanifest"', `href="${base}manifest.webmanifest"`);
    },
    generateBundle() {
      const data = manifest();
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: JSON.stringify({
          ...data,
          start_url: base,
          scope: base,
          icons: (data.icons ?? []).map((icon) => ({ ...icon, src: base + icon.src.replace(/^\//, '') })),
        }),
      });
    },
  };
}

export default defineConfig(({ command }) => {
  const base = pagesBase(process.env.AFTERIMAGE_PAGES_BASE);
  const api = command === 'build' || process.env.AFTERIMAGE_COMPANION_URL
    ? companionUrl(process.env.AFTERIMAGE_COMPANION_URL)
    : 'http://localhost:8788';
  return {
    root: here('./github-pages'),
    publicDir: here('./public'),
    base,
    plugins: [react(), webManifest(base)],
    css: { postcss: { plugins: [tailwindcss()] } },
    define: { __AFTERIMAGE_API_BASE__: JSON.stringify(api) },
    build: { outDir: here('./dist-pages'), emptyOutDir: true },
  };
});
