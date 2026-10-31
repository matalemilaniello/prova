/**
 * Genera le icone PWA da un disegno SVG originale (una "R" condensata dentro un anello di avanzamento
 * con la luce ambra dei riflettori, su blu notte).
 *
 * Uso: npm run icons   (Playwright è installato nel sistema: require('playwright'))
 * Scrive: public/favicon.svg, public/favicon.png, public/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {object} o
 * @param {number} [o.scale] scala del disegno attorno al centro (maskable: zona sicura)
 * @param {number} [o.radius] raggio degli angoli dello sfondo (0 = quadrato pieno)
 */
function iconSvg({ scale = 1, radius = 0 } = {}) {
  const C = 256;
  const r = 166;
  const circ = 2 * Math.PI * r;
  const sweep = 288;
  const dash = (circ * sweep) / 360;
  const endA = ((-90 + sweep) * Math.PI) / 180;
  const ex = C + r * Math.cos(endA);
  const ey = C + r * Math.sin(endA);
  const t = `translate(${C} ${C}) scale(${scale}) translate(${-C} ${-C})`;
  // "R" condensata: asta, occhiello con controforma, gamba diagonale.
  const R =
    'M193 154 H269 C298 154 317 173 317 203 V221 C317 245 303 261 283 267 L323 358 H274 L239 272 V358 H193 Z ' +
    'M239 194 V234 H265 C274 234 278 228 278 220 V207 C278 199 274 194 265 194 Z';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#15253F"/>
      <stop offset="0.55" stop-color="#0C1626"/>
      <stop offset="1" stop-color="#070C16"/>
    </linearGradient>
    <radialGradient id="flood" cx="0.78" cy="0.04" r="0.75">
      <stop offset="0" stop-color="#F5C04A" stop-opacity="0.30"/>
      <stop offset="0.45" stop-color="#F5C04A" stop-opacity="0.07"/>
      <stop offset="1" stop-color="#F5C04A" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="arc" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFE29A"/>
      <stop offset="0.5" stop-color="#F5C04A"/>
      <stop offset="1" stop-color="#E39A1C"/>
    </linearGradient>
    <linearGradient id="ink" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#DCE4F0"/>
    </linearGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="10"/>
    </filter>
    <filter id="dotglow" x="-200%" y="-200%" width="500%" height="500%">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="${radius}" fill="url(#bg)"/>
  <rect width="512" height="512" rx="${radius}" fill="url(#flood)"/>
  <g transform="${t}">
    <circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="#FFFFFF" stroke-opacity="0.07" stroke-width="30"/>
    <circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="#F5C04A" stroke-opacity="0.55" stroke-width="30"
      stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 ${C} ${C})" filter="url(#glow)"/>
    <circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="url(#arc)" stroke-width="30"
      stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 ${C} ${C})"/>
    <circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="20" fill="#FFE7A8" opacity="0.9" filter="url(#dotglow)"/>
    <circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="9" fill="#FFF6DC"/>
    <path d="${R}" fill="url(#ink)" fill-rule="evenodd"/>
  </g>
</svg>`;
}

const outputs = [
  { file: 'public/icons/icon-192.png', size: 192, svg: iconSvg() },
  { file: 'public/icons/icon-512.png', size: 512, svg: iconSvg() },
  { file: 'public/icons/icon-maskable-512.png', size: 512, svg: iconSvg({ scale: 0.8 }) },
  { file: 'public/icons/apple-touch-icon.png', size: 180, svg: iconSvg() },
  { file: 'public/favicon.png', size: 64, svg: iconSvg({ radius: 116 }) },
];

mkdirSync(join(root, 'public/icons'), { recursive: true });
writeFileSync(join(root, 'public/favicon.svg'), iconSvg({ radius: 116 }));
writeFileSync(join(root, 'public/icons/icon.svg'), iconSvg());

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const o of outputs) {
    await page.setViewportSize({ width: o.size, height: o.size });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">` +
        `<img src="data:image/svg+xml;base64,${Buffer.from(o.svg).toString('base64')}" width="${o.size}" height="${o.size}" style="display:block"/>` +
        `</body></html>`,
    );
    await page.waitForFunction(() => document.images[0]?.complete);
    await page.screenshot({ path: join(root, o.file), omitBackground: true, clip: { x: 0, y: 0, width: o.size, height: o.size } });
    console.log(`${o.file} (${o.size}×${o.size})`);
  }
  console.log('public/favicon.svg');
} finally {
  await browser.close();
}
