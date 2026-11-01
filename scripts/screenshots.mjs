/**
 * Screenshot di Ritmo dalla build in un unico file (npm run build:preview), via file://.
 *
 * Uso:
 *   npm run screenshots -- [--html dist-preview/index.html] [--out screenshots] [--only oggi,kit]
 *                          [--themes scuro,chiaro] [--today 2026-11-10] [--now 18:10] [--full] [--strict]
 *                          [--width 360]
 *
 * - Viewport 390×844 (iPhone), deviceScaleFactor 2, attende i font.
 * - Dati di esempio (?demo=1); il benvenuto usa ?onboarding=1 su uno stato pulito.
 * - Controlla l'overflow orizzontale a 390 e a 360 px e raccoglie gli errori della console.
 * - --only accetta nomi o prefissi: "settimana" include settimana-spesa e settimana-preparazione,
 *   "impostazioni" tutte le sezioni (impostazioni-profilo, …), "benvenuto" i passi 2-6.
 * - --full salva anche la versione a tutta altezza di ogni schermata (il kit la salva sempre).
 * - --strict esce con codice 1 se ci sono errori della pagina o overflow.
 * - --width cambia la larghezza delle immagini (predefinita 390, iPhone 12-16); i file prendono il suffisso -360.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const htmlPath = resolve(root, typeof args.html === 'string' ? args.html : 'dist-preview/index.html');
const outDir = resolve(root, typeof args.out === 'string' ? args.out : 'screenshots');
const themes = (typeof args.themes === 'string' ? args.themes : 'scuro,chiaro').split(',').map((s) => s.trim()).filter(Boolean);
const only = typeof args.only === 'string' ? args.only.split(',').map((s) => s.trim()).filter(Boolean) : null;
const fixedNow = typeof args.now === 'string' ? args.now : '18:10';
const fixedToday = typeof args.today === 'string' ? args.today : null;
const full = Boolean(args.full);
const strict = Boolean(args.strict);
const width = Number(args.width) > 0 ? Math.round(Number(args.width)) : 390;
const suffix = width === 390 ? '' : `-${width}`;

if (!existsSync(htmlPath)) {
  console.error(`File non trovato: ${htmlPath}\nEsegui prima: npm run build:preview`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

/**
 * `now` cambia l'orologio della vista; `weekday` (0 = lunedì) porta la data al prossimo giorno della settimana
 * indicato (a partire da --today o da oggi), per avere sempre una giornata di partita o di palestra.
 * @type {{ name: string, hash?: string, query?: Record<string,string>, fresh?: boolean, tall?: boolean, wait?: number, now?: string, weekday?: number }[]}
 */
const SETTINGS_PAGES = ['profilo', 'obiettivi', 'settimana', 'pasti', 'sonno', 'integratori', 'dolore', 'fisio', 'promemoria', 'coach', 'backup', 'info'];

const VIEWS = [
  { name: 'benvenuto', query: { onboarding: '1' }, fresh: true },
  // Passi del benvenuto (2-6; il 6 è il riepilogo "Il tuo piano è pronto").
  ...[2, 3, 4, 5, 6].map((n) => ({ name: `benvenuto-${n}`, query: { onboarding: '1', step: String(n) }, fresh: true, wait: 800 })),
  { name: 'oggi', hash: 'oggi' },
  // Momenti della giornata: controllo del mattino, giorno di partita, palestra, sera del coprifuoco.
  { name: 'oggi-mattina', hash: 'oggi', now: '07:25' },
  { name: 'oggi-partita', hash: 'oggi', weekday: 0, now: '18:40' },
  { name: 'oggi-palestra', hash: 'oggi', weekday: 1, now: '16:55' },
  { name: 'oggi-sera', hash: 'oggi', weekday: 1, now: '23:05' },
  { name: 'settimana', hash: 'settimana', query: { tab: 'menu' } },
  { name: 'settimana-spesa', hash: 'settimana', query: { tab: 'spesa' } },
  { name: 'settimana-preparazione', hash: 'settimana', query: { tab: 'preparazione' } },
  { name: 'settimana-guida', hash: 'settimana', query: { tab: 'preparazione', guida: '1' }, wait: 900 },
  { name: 'allenamento', hash: 'allenamento' },
  { name: 'coach', hash: 'coach' },
  { name: 'coach-attivazione', hash: 'coach', query: { coach: 'setup' } },
  { name: 'progressi', hash: 'progressi' },
  { name: 'progressi-revisione', hash: 'progressi', query: { view: 'revisione' }, wait: 900 },
  { name: 'impostazioni', hash: 'impostazioni' },
  ...SETTINGS_PAGES.map((sezione) => ({ name: `impostazioni-${sezione}`, hash: 'impostazioni', query: { sezione }, wait: 700 })),
  { name: 'kit', hash: 'kit', tall: true },
  { name: 'recipe', hash: 'oggi', query: { overlay: 'recipe' }, wait: 900 },
  { name: 'checkin', hash: 'oggi', query: { overlay: 'checkin' }, wait: 900 },
  { name: 'session', hash: 'allenamento', query: { overlay: 'session' }, wait: 900 },
  { name: 'football', hash: 'oggi', query: { overlay: 'football' }, wait: 900 },
  { name: 'barPlanB', hash: 'coach', query: { overlay: 'barPlanB' }, wait: 900 },
];

const selected = VIEWS.filter((v) => !only || only.some((o) => v.name === o || v.name.startsWith(`${o}-`)));
if (!selected.length) {
  console.error(`Nessuna vista corrisponde a --only ${only?.join(',')}. Viste: ${VIEWS.map((v) => v.name).join(', ')}`);
  process.exit(1);
}

/** Data locale AAAA-MM-GG del prossimo giorno della settimana `wd` (0 = lunedì) a partire da `fromIso` (incluso). */
function nextWeekday(fromIso, wd) {
  const [y, m, d] = fromIso.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  const cur = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() + ((wd - cur + 7) % 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function localToday() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function urlFor(view, theme) {
  const q = new URLSearchParams({ ...(view.fresh ? {} : { demo: '1' }), ...(view.query ?? {}), theme, now: view.now ?? fixedNow });
  if (typeof view.weekday === 'number') q.set('today', nextWeekday(fixedToday ?? localToday(), view.weekday));
  else if (fixedToday) q.set('today', fixedToday);
  const u = pathToFileURL(htmlPath);
  u.search = q.toString();
  if (view.hash) u.hash = view.hash;
  return u.href;
}

/** Elementi che sporgono oltre il bordo destro (esclusi i contenitori scorrevoli in orizzontale e le schermate nascoste). */
async function findOverflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const issues = [];
    if (document.documentElement.scrollWidth > vw + 1) issues.push(`documento largo ${document.documentElement.scrollWidth}px`);
    const all = document.body.querySelectorAll('*');
    for (const el of all) {
      if (issues.length >= 6) break;
      if (el.closest('[inert], [aria-hidden="true"], [data-allow-overflow]')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.position === 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right <= vw + 1 && r.left >= -1) continue;
      // Dentro un contenitore che scorre in orizzontale: è voluto.
      let p = el.parentElement;
      let scroller = false;
      while (p && p !== document.body) {
        const ps = getComputedStyle(p);
        if (['auto', 'scroll'].includes(ps.overflowX) && p.scrollWidth > p.clientWidth) {
          scroller = true;
          break;
        }
        p = p.parentElement;
      }
      if (scroller) continue;
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const cls = typeof el.className === 'string' ? el.className.split(' ').slice(0, 4).join('.') : '';
      issues.push(`<${el.tagName.toLowerCase()}${cls ? ` .${cls}` : ''}> ${Math.round(r.left)}→${Math.round(r.right)}px "${text}"`);
    }
    return issues;
  });
}

const browser = await chromium.launch();
const written = [];
const problems = [];
let pageErrors = 0;

try {
  for (const theme of themes) {
    for (const view of selected) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        deviceScaleFactor: 2,
        colorScheme: theme === 'chiaro' ? 'light' : 'dark',
        reducedMotion: 'reduce',
        locale: 'it-IT',
        timezoneId: 'Europe/Rome',
        hasTouch: true,
        isMobile: true,
      });
      const page = await context.newPage();
      const logs = [];
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`);
      });
      page.on('pageerror', (e) => {
        pageErrors++;
        logs.push(`eccezione: ${e.message}`);
      });

      await page.goto(urlFor(view, theme), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(view.wait ?? 650);

      // Overflow a 360 px, poi di nuovo a 390.
      await page.setViewportSize({ width: 360, height: 780 });
      await page.waitForTimeout(250);
      const of360 = await findOverflow(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(250);
      const of390 = await findOverflow(page);
      if (width !== 390) {
        await page.setViewportSize({ width, height: 844 });
        await page.waitForTimeout(250);
      }

      const file = join(outDir, `${view.name}-${theme}${suffix}.png`);
      await page.screenshot({ path: file });
      written.push(file);

      if (view.tall || full) {
        const h = await page.evaluate(() => {
          const sc = document.querySelector('[data-screen-active="true"] [data-scroll-container]');
          if (sc) return Math.min(9000, Math.ceil(sc.scrollHeight));
          // Benvenuto e fogli: il contenitore che scorre di più (la pagina cresce di quanto manca).
          let extra = 0;
          for (const el of document.body.querySelectorAll('*')) {
            const oy = getComputedStyle(el).overflowY;
            if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) extra = Math.max(extra, el.scrollHeight - el.clientHeight);
          }
          return Math.min(9000, Math.ceil(document.documentElement.clientHeight + extra));
        });
        if (h > 844) {
          await page.setViewportSize({ width, height: h });
          await page.waitForTimeout(350);
          const tallFile = join(outDir, `${view.name}-${theme}${suffix}-full.png`);
          await page.screenshot({ path: tallFile });
          written.push(tallFile);
        }
      }

      if (logs.length || of360.length || of390.length) {
        problems.push({ view: `${view.name} (${theme})`, logs, of360, of390 });
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log(`\nScreenshot salvati (${written.length}):`);
for (const f of written) console.log(`  ${f}`);

if (problems.length) {
  console.log('\nDa controllare:');
  for (const p of problems) {
    console.log(`\n• ${p.view}`);
    for (const l of p.logs) console.log(`  console  ${l}`);
    for (const o of p.of390) console.log(`  overflow a 390 px  ${o}`);
    for (const o of p.of360) console.log(`  overflow a 360 px  ${o}`);
  }
} else {
  console.log('\nNessun errore in console, nessun overflow orizzontale (390 e 360 px).');
}

if (strict && (pageErrors > 0 || problems.some((p) => p.of360.length || p.of390.length))) process.exitCode = 1;
