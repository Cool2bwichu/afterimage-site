// Builds AFTERIMAGE as a claude.ai Artifact: one self-contained page, with its
// script and styles inline (an Artifact loads nothing from other hosts except
// Google Fonts). Private routes are answered inside the page by asking Claude
// through the Artifact's `sample` capability; see github-pages/in-page.mjs.
//
//   npm run build:artifact   →   dist-artifact/afterimage.html
import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// A `</script` or `</style` inside the inlined code would end the element early.
const inlineSafe = (code: string, tag: 'script' | 'style') => code.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);

// The Artifact tool wraps the page in its own document skeleton, so the page
// is its content alone: the title, the dark colour scheme and font links, the
// inlined styles, the root element and the inlined script.
export function artifactPage(html: string, scripts: string[], styles: string[]): string {
  const head = /<head>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? '';
  const body = /<body>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? '';
  const keep = head.match(/<title>[\s\S]*?<\/title>|<style>[\s\S]*?<\/style>|<link\b[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>/gi) ?? [];
  const root = body.replace(/<script\b[\s\S]*?<\/script>/gi, '').trim();
  return [
    ...keep,
    ...styles.map((css) => `<style>\n${inlineSafe(css, 'style')}\n</style>`),
    root,
    ...scripts.map((js) => `<script type="module">\n${inlineSafe(js, 'script')}\n</script>`),
  ].join('\n') + '\n';
}

function singleArtifactPage(): Plugin {
  return {
    name: 'afterimage-artifact-page',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const page = bundle['artifact.html'];
      if (!page || page.type !== 'asset') throw new Error('The Artifact build did not produce artifact.html.');
      const scripts: string[] = [];
      const styles: string[] = [];
      for (const [name, item] of Object.entries(bundle)) {
        if (item.type === 'chunk') {
          if (!item.isEntry) throw new Error(`The Artifact build must be one script; ${name} was split off.`);
          scripts.push(item.code);
          delete bundle[name];
        } else if (name.endsWith('.css')) {
          styles.push(String(item.source));
          delete bundle[name];
        } else if (name !== 'artifact.html') {
          throw new Error(`The Artifact build cannot publish ${name}; inline it instead.`);
        }
      }
      delete bundle['artifact.html'];
      this.emitFile({ type: 'asset', fileName: 'afterimage.html', source: artifactPage(String(page.source), scripts, styles) });
    },
  };
}

export default defineConfig({
  root: here('./github-pages'),
  publicDir: false,
  base: './',
  plugins: [react(), singleArtifactPage()],
  css: { postcss: { plugins: [tailwindcss()] } },
  define: { __AFTERIMAGE_API_BASE__: JSON.stringify('') },
  build: {
    outDir: here('./dist-artifact'),
    emptyOutDir: true,
    modulePreload: false,
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    rollupOptions: { input: here('./github-pages/artifact.html'), output: { inlineDynamicImports: true } },
  },
});
