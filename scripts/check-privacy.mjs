/**
 * Controllo della privacy sui file tracciati da git: il repository è pubblico (docs/FASE2.md § 14.1).
 *
 * Segnala in ogni file di testo tracciato:
 *   - percorsi assoluti di una macchina (cartelle temporanee, home, utente root, Users);
 *   - indirizzi email;
 *   - identificativi di sessione;
 *   - le parole dell'elenco privato (dati dell'utente: misure, orari, abitudini, prodotti, zone).
 *
 * L'elenco privato non sta mai nel repository. Si legge dal file indicato in RITMO_PRIVACY_WORDS oppure da
 * ~/.config/ritmo/privacy-words.txt: una parola o un'espressione per riga, senza differenza tra maiuscole e
 * minuscole; le righe vuote e quelle che iniziano con # non contano.
 *
 * Uso:
 *   node scripts/check-privacy.mjs            elenco dei problemi, esce sempre con 0
 *   node scripts/check-privacy.mjs --strict   esce con 1 se trova qualcosa o se manca l'elenco privato
 *
 * Eccezioni: una riga che contiene il segno `privacy-ok` non viene controllata. Serve solo alle righe che
 * descrivono gli schemi, come quelle di questo file.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');

const BINARY = /\.(png|jpe?g|gif|webp|ico|icns|woff2?|ttf|otf|pdf|zip|gz)$/i;
/** File generati dagli strumenti: non li scrive nessuno di noi. */
const GENERATED = new Set(['package-lock.json']);

const PATTERNS = [
  ['percorso assoluto', /(?<![\w.:/-])\/(?:tmp|home|root|Users)\/[\w.-]/], // privacy-ok
  ['indirizzo email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/],
  ['identificativo di sessione', /\bsession_[A-Za-z0-9]{12,}\b|claude\.ai\/code\/session/], // privacy-ok
];

function privateWords() {
  const file = process.env.RITMO_PRIVACY_WORDS || join(homedir(), '.config', 'ritmo', 'privacy-words.txt');
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.toLowerCase());
}

const words = privateWords();
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter((f) => f && !BINARY.test(f) && !GENERATED.has(f));

const problems = [];
for (const file of files) {
  const path = join(root, file);
  if (!existsSync(path)) continue;
  const text = readFileSync(path, 'utf8');
  if (text.includes('\0')) continue;
  text.split('\n').forEach((line, i) => {
    if (line.includes('privacy-ok')) return;
    for (const [what, re] of PATTERNS) {
      if (re.test(line)) problems.push(`${file}:${i + 1} · ${what}`);
    }
    if (words) {
      const low = line.toLowerCase();
      for (const w of words) {
        if (low.includes(w)) problems.push(`${file}:${i + 1} · parola dell'elenco privato`);
      }
    }
  });
}

if (!words) {
  console.log("Elenco privato assente: controllo solo percorsi, email e sessioni. Indica il file con RITMO_PRIVACY_WORDS.");
}
for (const p of problems) console.log(p);
console.log(`${files.length} file controllati, ${problems.length} problemi.`);
if (strict && (problems.length > 0 || !words)) process.exit(1);
