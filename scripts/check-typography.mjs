/**
 * Controllo tipografico dei testi: apostrofo tipografico (’) e niente trattino lungo (—).
 *
 * Scorre i sorgenti in src/ (test esclusi) e guarda solo i testi: stringhe tra apici o tra virgolette doppie,
 * template e testo JSX. I commenti e il codice non contano. Segnala:
 *   - l'apostrofo dritto al posto di quello tipografico (’): tra due lettere ("l'orario", 'Com\'è andata') e dopo
 *     una parola tronca ("un po' di", 'un po\' di'), scritto com'è, con l'escape \' o come entità HTML nel testo
 *     JSX. Un apice che apre una citazione ('così') e quello che la chiude non contano;
 *   - il trattino lungo (—), che nei testi dell'interfaccia non si usa (SPEC §3).
 *
 * Uso:
 *   node scripts/check-typography.mjs                 elenco per area, esce sempre con 0
 *   node scripts/check-typography.mjs --strict        esce con 1 se trova qualcosa (per la CI)
 *   node scripts/check-typography.mjs --area oggi     solo i file di un'area (sistema, oggi, settimana,
 *                                                     allenamento, coachProgressi, impostazioni)
 *   node scripts/check-typography.mjs --fix --area oggi
 *                                                     sostituisce gli apostrofi nei testi dei file dell'area,
 *                                                     test compresi (così le attese restano uguali al testo):
 *                                                     \' diventa ’ senza escape; il trattino lungo va
 *                                                     riscritto a mano
 *   node scripts/check-typography.mjs --quiet         solo i conteggi
 *
 * Eccezioni: una riga che contiene il commento `tipografia-ok` non viene controllata, per i rari testi che
 * sono codice (es. un selettore CSS scritto in una stringa).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};

/** Aree dei file (come nel piano di lavoro): la prima regola che corrisponde vince. */
const AREAS = [
  ['oggi', [/^src\/features\/oggi\//, /^src\/engine\/timeline(\.test)?\.ts$/, /^src\/data\/tips\.ts$/]],
  ['settimana', [/^src\/features\/settimana\//, /^src\/engine\/shopping(\.test)?\.ts$/, /^src\/data\/(foods|recipes|menu|barPlanB)\.ts$/, /^src\/data\/menu\.test\.ts$/]],
  ['allenamento', [/^src\/features\/allenamento\//, /^src\/engine\/training(\.test)?\.ts$/, /^src\/data\/(exercises|sessions)(\.test)?\.ts$/]],
  ['coachProgressi', [/^src\/features\/(coach|progressi)\//, /^src\/engine\/(coachContext|review)(\.test)?\.ts$/, /^src\/lib\/(claude|image)(\.test)?\.ts$/]],
  ['impostazioni', [/^src\/features\/(impostazioni|benvenuto)\//, /^src\/engine\/ics(\.test)?\.ts$/, /^src\/lib\/backup(\.test)?\.ts$/]],
  ['sistema', [/^src\//]],
];
const areaOf = (file) => AREAS.find(([, rules]) => rules.some((r) => r.test(file)))?.[0] ?? 'sistema';

const LETTER = /\p{L}/u;
const ENTITY = /^&(?:apos|#0*39|#x0*27);/i;

/** Limiti del contenuto nel sorgente del nodo, senza virgolette, apici inversi, `${` e `}`. */
function contentBounds(kind, raw) {
  switch (kind) {
    case ts.SyntaxKind.JsxText:
      return [0, raw.length];
    case ts.SyntaxKind.TemplateHead:
    case ts.SyntaxKind.TemplateMiddle:
      return [1, raw.length - 2];
    default:
      return [1, raw.length - 1];
  }
}

/**
 * Apostrofi dritti nel testo di un nodo: posizione e lunghezza nel sorgente (`'`, `\'` o un'entità HTML).
 * Si legge carattere per carattere, con gli escape risolti:
 *   - tra due lettere è un apostrofo (l'orario);
 *   - dopo una lettera e prima di uno spazio, di un segno o della fine è un apostrofo di troncamento (po'),
 *     a meno che chiuda una citazione aperta prima nella stessa stringa ('così');
 *   - prima di una lettera e dopo un non-lettera apre una citazione e non conta.
 */
export function straightApostrophes(kind, raw) {
  const [from, to] = contentBounds(kind, raw);
  /** @type {({ ch: string } | { quote: true, at: number, len: number })[]} */
  const tokens = [];
  for (let i = from; i < to; ) {
    const c = raw[i];
    if (c === '\\') {
      const n = raw[i + 1];
      if (n === "'") {
        tokens.push({ quote: true, at: i, len: 2 });
        i += 2;
      } else if (n === 'u' && raw[i + 2] === '{') {
        const end = raw.indexOf('}', i);
        const cp = parseInt(raw.slice(i + 3, end), 16);
        tokens.push({ ch: Number.isFinite(cp) ? String.fromCodePoint(cp) : ' ' });
        i = end + 1;
      } else if (n === 'u' || n === 'x') {
        const len = n === 'u' ? 4 : 2;
        const cp = parseInt(raw.slice(i + 2, i + 2 + len), 16);
        tokens.push({ ch: Number.isFinite(cp) ? String.fromCodePoint(cp) : ' ' });
        i += 2 + len;
      } else {
        tokens.push({ ch: ' ' });
        i += 2;
      }
      continue;
    }
    if (c === "'") {
      tokens.push({ quote: true, at: i, len: 1 });
      i += 1;
      continue;
    }
    if (c === '&') {
      const m = raw.slice(i, i + 10).match(ENTITY);
      if (m) {
        tokens.push({ quote: true, at: i, len: m[0].length });
        i += m[0].length;
        continue;
      }
    }
    const cp = raw.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    tokens.push({ ch });
    i += ch.length;
  }
  const isLetter = (t) => Boolean(t && 'ch' in t && LETTER.test(t.ch));
  const found = [];
  let open = 0;
  tokens.forEach((t, k) => {
    if (!('quote' in t)) return;
    const prev = isLetter(tokens[k - 1]);
    const next = isLetter(tokens[k + 1]);
    if (prev && next) found.push({ at: t.at, len: t.len });
    else if (!prev && next) open++;
    else if (prev && open > 0) open--;
    else if (prev) found.push({ at: t.at, len: t.len });
    else if (open > 0) open--;
  });
  return found;
}
const EM_DASH = /—/;
const isTest = (file) => /\.test\.tsx?$/.test(file);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const TEXT_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.JsxText,
]);

/** Nodi di testo del file con la loro porzione di sorgente. */
function textNodes(sf) {
  const nodes = [];
  const visit = (node) => {
    if (TEXT_KINDS.has(node.kind)) {
      // Gli import non sono testo.
      if (!(node.parent && (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)))) {
        const start = node.kind === ts.SyntaxKind.JsxText ? node.pos : node.getStart(sf);
        nodes.push({ start, end: node.end, kind: node.kind });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return nodes;
}

const onlyArea = value('area');
const fix = flag('fix');
const strict = flag('strict');
const quiet = flag('quiet');

const files = walk(join(root, 'src'))
  .map((abs) => ({ abs, rel: relative(root, abs).split(sep).join('/') }))
  .filter((f) => !onlyArea || areaOf(f.rel) === onlyArea)
  .filter((f) => fix || !isTest(f.rel));

/** @type {Record<string, { apostrophes: number, dashes: number, items: string[] }>} */
const report = {};
let fixedCount = 0;

for (const f of files) {
  const src = readFileSync(f.abs, 'utf8');
  const kind = f.rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(f.rel, src, ts.ScriptTarget.Latest, true, kind);
  const lines = src.split('\n');
  const skipLine = new Set(lines.map((l, i) => (l.includes('tipografia-ok') ? i : -1)).filter((i) => i >= 0));
  const area = areaOf(f.rel);
  const entry = (report[area] ??= { apostrophes: 0, dashes: 0, items: [] });
  const edits = [];

  for (const { start, end, kind } of textNodes(sf)) {
    const raw = src.slice(start, end);
    const line = sf.getLineAndCharacterOfPosition(start).line;
    if (skipLine.has(line)) continue;
    const hits = straightApostrophes(kind, raw);
    const apostrophes = hits.length;
    const dash = EM_DASH.test(raw);
    if (!apostrophes && !dash) continue;
    if (fix && apostrophes) {
      let text = raw;
      for (const h of [...hits].reverse()) text = text.slice(0, h.at) + '’' + text.slice(h.at + h.len);
      edits.push({ start, end, text });
      fixedCount += apostrophes;
    }
    if (isTest(f.rel)) continue;
    entry.apostrophes += apostrophes;
    if (dash) entry.dashes++;
    const snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 90);
    entry.items.push(`  ${f.rel}:${line + 1}  ${apostrophes ? "’" : ''}${dash ? '—' : ''}  ${snippet}`);
  }

  if (fix && edits.length) {
    let out = src;
    for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
    writeFileSync(f.abs, out);
  }
}

const areas = Object.keys(report).filter((a) => report[a].apostrophes || report[a].dashes).sort();
let total = 0;
for (const a of areas) {
  const r = report[a];
  total += r.apostrophes + r.dashes;
  console.log(`${a}: ${r.apostrophes} apostrofi dritti${r.dashes ? `, ${r.dashes} trattini lunghi` : ''}`);
  if (!quiet) console.log(r.items.join('\n'));
}
if (fix) console.log(`\nSostituiti ${fixedCount} apostrofi (test compresi). Il trattino lungo va riscritto a mano.`);
else if (!total) console.log('Testi a posto: apostrofi tipografici e nessun trattino lungo.');
else console.log(`\nIn tutto ${total}. Correggi con: node scripts/check-typography.mjs --fix --area <area>`);

if (strict && total && !fix) process.exit(1);
