import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/** Colori del manifest: devono coincidere con --bg del tema scuro (src/styles/tokens.css). */
const NIGHT = '#0A1220';

/**
 * Testa dell'HTML. Nell'anteprima in un unico file non ci sono file accanto all'HTML:
 * la favicon diventa un data URI e i link solo-PWA spariscono. Nella build normale si toglie il marcatore.
 */
function htmlHead(singleFile: boolean): Plugin {
  return {
    name: 'ritmo:html-head',
    transformIndexHtml(html) {
      if (!singleFile) return html.replace(/ data-pwa-only/g, '');
      const favicon = readFileSync(fileURLToPath(new URL('./public/favicon.svg', import.meta.url)), 'utf8');
      const faviconUri = `data:image/svg+xml,${encodeURIComponent(favicon)}`;
      return html
        .replace(/\s*<link[^>]*data-pwa-only[^>]*>/g, '')
        .replace(/href="[^"]*favicon\.svg"/, `href="${faviconUri}"`);
    },
  };
}

export default defineConfig(({ command, mode, isPreview }) => {
  const singleFile = mode === 'preview';
  const pagesBase = '/prova/';
  const base = singleFile ? './' : command === 'build' || isPreview ? pagesBase : '/';

  return {
    base,
    publicDir: singleFile ? false : 'public',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    },
    plugins: [
      react(),
      tailwindcss(),
      htmlHead(singleFile),
      ...(singleFile
        ? [viteSingleFile({ removeViteModuleLoader: true })]
        : [
            VitePWA({
              registerType: 'autoUpdate',
              injectRegister: 'auto',
              includeAssets: ['favicon.svg', 'favicon.png', 'icons/apple-touch-icon.png'],
              manifest: {
                id: pagesBase,
                name: 'Ritmo',
                short_name: 'Ritmo',
                description: 'La tua giornata già decisa: pasti, allenamento intorno al calcio e sonno.',
                lang: 'it',
                dir: 'ltr',
                start_url: `${pagesBase}#oggi`,
                scope: pagesBase,
                display: 'standalone',
                orientation: 'portrait',
                background_color: NIGHT,
                theme_color: NIGHT,
                categories: ['health', 'fitness', 'lifestyle', 'sports'],
                icons: [
                  { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                  { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                  { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
              },
              workbox: {
                globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
                navigateFallback: 'index.html',
                cleanupOutdatedCaches: true,
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
              },
              devOptions: { enabled: false },
            }),
          ]),
    ],
    build: {
      outDir: singleFile ? 'dist-preview' : 'dist',
      emptyOutDir: true,
      target: 'es2022',
      reportCompressedSize: false,
      chunkSizeWarningLimit: singleFile ? 8000 : 1200,
    },
    server: { host: true },
  };
});
