/**
 * Verifica dei contenuti di allenamento: coerenza del catalogo e delle sedute, regole tecniche
 * (gomito, progressione, RIR, prevenzione) e durata stimata. Stampa la tabella delle durate per blocco.
 *
 * La stima della durata è definita qui, in modo indipendente da sessions.ts:
 * per ogni esercizio serie × (tempo di lavoro + recupero), con lavoro = 10 s di preparazione +
 * ripetizioni medie × 4 s (o secondi medi), raddoppiato se l'esercizio è per lato.
 */
import { describe, expect, it } from 'vitest';
import type { Exercise, SessionExercise, WorkoutSession } from '../domain/types';
import { EXERCISES, EXERCISE_LIST } from './exercises';
import { SESSIONS, SESSION_LIST, estimateSessionMin } from './sessions';

// ───────────────────────── Modello di durata ─────────────────────────

const SEC_PER_REP = 4;
const SETUP_SEC = 10;
const DURATION_TOLERANCE = 0.2;

function workSec(it: SessionExercise): number {
  const mid = (it.repMin + it.repMax) / 2;
  const once = it.unit === 'secondi' ? mid : mid * SEC_PER_REP;
  return SETUP_SEC + once * (it.perSide ? 2 : 1);
}
const itemSec = (it: SessionExercise) => it.sets * (workSec(it) + it.restSec);
const blockMin = (items: SessionExercise[]) => items.reduce((t, it) => t + itemSec(it), 0) / 60;
const sessionMin = (s: WorkoutSession) => s.blocks.reduce((t, b) => t + blockMin(b.items), 0);

// ───────────────────────── Regole di stile dei testi (SPEC §3) ─────────────────────────

const EMOJI = /\p{Extended_Pictographic}/u;
/** Nomi propri e sigle ammessi con la maiuscola dentro un titolo. */
const PROPER = new Set(['Nordic', 'Copenhagen', 'Tyler', 'Pallof', 'FlexBar', 'FIFA', 'RIR', 'RPE', 'A', 'B', 'C']);

function checkText(label: string, text: string): string[] {
  const errors: string[] = [];
  if (!text.trim()) errors.push(`${label}: testo vuoto`);
  if (text.includes('—') || text.includes('–')) errors.push(`${label}: trattino lungo in "${text}"`);
  if (EMOJI.test(text)) errors.push(`${label}: emoji in "${text}"`);
  if (text.includes('!')) errors.push(`${label}: esclamazione in "${text}"`);
  if (/\s{2,}/.test(text)) errors.push(`${label}: spazi doppi in "${text}"`);
  return errors;
}

/** Titoli ed etichette: maiuscola solo sulla prima parola (più i nomi propri). */
function checkTitleCase(label: string, title: string): string[] {
  const errors = checkText(label, title);
  if (title[0] !== title[0].toUpperCase()) errors.push(`${label}: la prima lettera deve essere maiuscola in "${title}"`);
  const words = title.replace(/[()]/g, ' ').split(/\s+/).filter(Boolean).slice(1);
  for (const w of words) {
    if (/^\p{Lu}/u.test(w) && !PROPER.has(w)) errors.push(`${label}: maiuscola non ammessa su "${w}" in "${title}"`);
  }
  return errors;
}

const allItems = (s: WorkoutSession) => s.blocks.flatMap((b) => b.items);
const exOf = (it: SessionExercise): Exercise => EXERCISES[it.exerciseId];
const usedIn = (ids: string[], sessions: WorkoutSession[]) =>
  sessions.filter((s) => allItems(s).some((it) => ids.includes(it.exerciseId)));

/** Incremento realistico per attrezzatura: [minimo, massimo] in kg, o null se non ha senso. */
function incrementRange(equipment: string): [number, number] | null {
  const e = equipment.toLowerCase();
  if (/trap bar|bilanciere/.test(e)) return [2.5, 2.5];
  if (/macchina|cavo|cavi|lat machine|pulley|leg press|multipower/.test(e)) return [2.5, 5];
  if (/manubri/.test(e)) return [1, 2];
  return null;
}

// ───────────────────────── Catalogo degli esercizi ─────────────────────────

describe('catalogo degli esercizi', () => {
  it('ha 45-60 esercizi con id univoci in kebab-case', () => {
    expect(EXERCISE_LIST.length).toBeGreaterThanOrEqual(45);
    expect(EXERCISE_LIST.length).toBeLessThanOrEqual(60);
    const ids = EXERCISE_LIST.map((e) => e.id);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dup, `id duplicati: ${dup.join(', ')}`).toEqual([]);
    expect(Object.keys(EXERCISES).length).toBe(EXERCISE_LIST.length);
    for (const e of EXERCISE_LIST) {
      expect(e.id, e.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(EXERCISES[e.id]).toBe(e);
    }
  });

  it('ogni esercizio è completo: nome, categoria, attrezzatura, 2-3 indicazioni, ricerca video', () => {
    const errors: string[] = [];
    for (const e of EXERCISE_LIST) {
      errors.push(...checkTitleCase(`${e.id}.name`, e.name));
      errors.push(...checkText(`${e.id}.equipment`, e.equipment));
      if (e.category === 'fisio') errors.push(`${e.id}: la categoria fisio è riservata agli esercizi del fisioterapista`);
      if (e.cues.length < 2 || e.cues.length > 3) errors.push(`${e.id}: ${e.cues.length} indicazioni (servono 2-3)`);
      e.cues.forEach((c, i) => {
        errors.push(...checkText(`${e.id}.cues[${i}]`, c));
        if (!/^\p{Lu}/u.test(c)) errors.push(`${e.id}.cues[${i}]: deve iniziare con la maiuscola`);
        if (/[.;]$/.test(c)) errors.push(`${e.id}.cues[${i}]: niente punto finale`);
        if (c.length > 100) errors.push(`${e.id}.cues[${i}]: troppo lunga (${c.length} caratteri)`);
      });
      if (!e.videoQuery || e.videoQuery.trim().length < 8) errors.push(`${e.id}: manca videoQuery`);
      if (typeof e.elbowFriendly !== 'boolean') errors.push(`${e.id}: elbowFriendly va indicato in modo esplicito`);
    }
    expect(errors).toEqual([]);
  });

  it('le alternative esistono, non sono ripetute e non puntano a sé stesse', () => {
    const errors: string[] = [];
    for (const e of EXERCISE_LIST) {
      const alts = e.alternatives ?? [];
      if (alts.length === 0) errors.push(`${e.id}: nessuna alternativa`);
      if (new Set(alts).size !== alts.length) errors.push(`${e.id}: alternative ripetute`);
      for (const a of alts) {
        if (a === e.id) errors.push(`${e.id}: è alternativa di sé stesso`);
        else if (!EXERCISES[a]) errors.push(`${e.id}: alternativa inesistente "${a}"`);
      }
    }
    expect(errors).toEqual([]);
  });

  it('ogni esercizio non adatto al gomito ha almeno un’alternativa adatta', () => {
    const missing = EXERCISE_LIST.filter(
      (e) => e.elbowFriendly === false && !(e.alternatives ?? []).some((a) => EXERCISES[a]?.elbowFriendly),
    ).map((e) => e.id);
    expect(missing).toEqual([]);
  });

  it('le spinte sono tutte a presa neutra e adatte al gomito, senza bilanciere', () => {
    for (const e of EXERCISE_LIST.filter((x) => x.category === 'spinta')) {
      expect(e.elbowFriendly, e.id).toBe(true);
      expect(e.name.toLowerCase(), e.id).toContain('presa neutra');
      expect(e.equipment.toLowerCase(), e.id).not.toMatch(/bilanciere/);
    }
  });

  it('copre i contenuti richiesti dalla specifica', () => {
    const required = [
      'nordic-hamstring-curl',
      'copenhagen-leva-corta',
      'copenhagen-leva-lunga',
      'polpacci-in-piedi-macchina',
      'polpacci-seduto',
      'tibiale-anteriore-seduto',
      'isometria-estensori-polso',
      'tyler-twist',
      'stacco-trap-bar',
      'squat-goblet',
      'affondo-bulgaro-manubri',
      'hip-thrust-bilanciere',
      'dead-bug',
      'pallof-press',
      'mobilita-caviglia-al-muro',
      'rotazioni-anche-90-90',
      'panca-manubri-presa-neutra',
      'lat-machine-presa-neutra',
    ];
    expect(required.filter((id) => !EXERCISES[id])).toEqual([]);
    const categories = new Set(EXERCISE_LIST.map((e) => e.category));
    for (const c of ['riscaldamento', 'mobilita', 'spinta', 'tirata', 'gambe', 'core', 'prevenzione'] as const) {
      expect(categories.has(c), c).toBe(true);
    }
  });
});

// ───────────────────────── Sedute ─────────────────────────

describe('sedute', () => {
  it('sono A, B e C, con id coerenti con le chiavi e la settimana tipo', () => {
    expect(SESSION_LIST.map((s) => s.id)).toEqual(['A', 'B', 'C']);
    for (const s of SESSION_LIST) expect(SESSIONS[s.id]).toBe(s);
  });

  it('ogni exerciseId esiste e non si ripete nella stessa seduta', () => {
    const errors: string[] = [];
    for (const s of SESSION_LIST) {
      const ids = allItems(s).map((it) => it.exerciseId);
      for (const id of ids) if (!EXERCISES[id]) errors.push(`${s.id}: esercizio inesistente "${id}"`);
      const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
      if (dup.length) errors.push(`${s.id}: ripetuti ${dup.join(', ')}`);
    }
    expect(errors).toEqual([]);
  });

  it('serie, ripetizioni, recuperi, RIR e progressione sono plausibili', () => {
    const errors: string[] = [];
    for (const s of SESSION_LIST) {
      for (const it of allItems(s)) {
        const tag = `${s.id}/${it.exerciseId}`;
        const ex = exOf(it);
        if (!Number.isInteger(it.sets) || it.sets < 1 || it.sets > 5) errors.push(`${tag}: serie ${it.sets}`);
        if (!Number.isInteger(it.repMin) || !Number.isInteger(it.repMax) || it.repMin < 1) errors.push(`${tag}: ripetizioni non intere`);
        if (it.repMin > it.repMax) errors.push(`${tag}: repMin ${it.repMin} > repMax ${it.repMax}`);
        if (it.unit === 'reps' && it.repMax > 20) errors.push(`${tag}: troppe ripetizioni (${it.repMax})`);
        if (it.unit === 'secondi' && it.repMax > 180) errors.push(`${tag}: serie troppo lunga (${it.repMax} s)`);
        if (it.restSec < 0 || it.restSec > 180) errors.push(`${tag}: recupero ${it.restSec} s`);
        if (it.rir !== undefined && (it.rir < 1 || it.rir > 3)) errors.push(`${tag}: RIR ${it.rir} fuori da 1-3`);
        if (it.progression === 'doppia') {
          if (it.unit !== 'reps') errors.push(`${tag}: progressione doppia solo a ripetizioni`);
          if (it.rir === undefined) errors.push(`${tag}: progressione doppia senza RIR`);
          if (it.repMax - it.repMin < 2) errors.push(`${tag}: forbice di ripetizioni troppo stretta per la progressione doppia`);
          const range = ex && incrementRange(ex.equipment);
          if (!range) errors.push(`${tag}: progressione doppia su un esercizio senza carico (${ex?.equipment})`);
          else if (!it.incrementKg || it.incrementKg < range[0] || it.incrementKg > range[1]) {
            errors.push(`${tag}: incremento ${it.incrementKg} kg fuori da ${range[0]}-${range[1]} kg per "${ex.equipment}"`);
          }
        } else if (it.incrementKg !== undefined) {
          errors.push(`${tag}: incremento senza progressione doppia`);
        }
        if (it.note) errors.push(...checkText(`${tag}.note`, it.note));
      }
    }
    expect(errors).toEqual([]);
  });

  it('ogni seduta ha riscaldamento di 6-8 minuti, blocco principale e prevenzione', () => {
    for (const s of SESSION_LIST) {
      const titles = s.blocks.map((b) => b.title);
      expect(titles[0], s.id).toBe('Riscaldamento');
      expect(titles.some((t) => /^blocco principale$/i.test(t)), s.id).toBe(true);
      expect(/^prevenzione/i.test(titles[titles.length - 1]), s.id).toBe(true);
      for (const t of titles) expect(checkTitleCase(`${s.id}.block`, t)).toEqual([]);
      const warm = blockMin(s.blocks[0].items);
      expect(warm, `${s.id}: riscaldamento ${warm.toFixed(1)} min`).toBeGreaterThanOrEqual(6);
      expect(warm, `${s.id}: riscaldamento ${warm.toFixed(1)} min`).toBeLessThanOrEqual(8);
      for (const it of s.blocks[0].items) {
        expect(['riscaldamento', 'mobilita', 'prevenzione'], `${s.id}/${it.exerciseId}`).toContain(exOf(it).category);
      }
    }
  });

  it('i testi delle sedute rispettano lo stile', () => {
    const errors: string[] = [];
    for (const s of SESSION_LIST) {
      errors.push(...checkTitleCase(`${s.id}.name`, s.name));
      errors.push(...checkTitleCase(`${s.id}.subtitle`, s.subtitle));
      errors.push(...checkText(`${s.id}.focus`, s.focus));
    }
    expect(errors).toEqual([]);
  });

  it('la durata stimata è coerente con estMin (±20%) e con la specifica', () => {
    const rows = SESSION_LIST.map((s) => ({
      seduta: s.id,
      estMin: s.estMin,
      stima: Math.round(sessionMin(s) * 10) / 10,
      ...Object.fromEntries(s.blocks.map((b) => [b.title, Math.round(blockMin(b.items) * 10) / 10])),
    }));
    console.table(rows);
    const ranges: Record<string, [number, number]> = { A: [50, 55], B: [55, 60], C: [35, 40] };
    for (const s of SESSION_LIST) {
      const est = sessionMin(s);
      expect(Math.abs(est - s.estMin) / s.estMin, `${s.id}: stima ${est.toFixed(1)} min, estMin ${s.estMin}`).toBeLessThanOrEqual(
        DURATION_TOLERANCE,
      );
      const [lo, hi] = ranges[s.id];
      expect(s.estMin, s.id).toBeGreaterThanOrEqual(lo);
      expect(s.estMin, s.id).toBeLessThanOrEqual(hi);
      // La funzione esportata per l'interfaccia usa lo stesso modello.
      expect(estimateSessionMin(s), s.id).toBe(Math.round(est));
    }
  });
});

// ───────────────────────── Regole tecniche ─────────────────────────

describe('regole tecniche della settimana', () => {
  const A = SESSIONS.A;
  const B = SESSIONS.B;
  const C = SESSIONS.C;
  const mandatory = [A, B];

  it('seduta A: tutto adatto al gomito, nessun bilanciere, spinte a presa neutra', () => {
    for (const it of allItems(A)) {
      const ex = exOf(it);
      expect(ex.elbowFriendly, it.exerciseId).toBe(true);
      expect(ex.equipment.toLowerCase(), it.exerciseId).not.toMatch(/bilanciere|trap bar/);
    }
    const pushes = allItems(A).filter((it) => exOf(it).category === 'spinta');
    expect(pushes.length).toBeGreaterThanOrEqual(2);
    for (const it of pushes) expect(exOf(it).name, it.exerciseId).toMatch(/presa neutra/);
  });

  it('seduta A: le gambe lavorano solo in prevenzione il giorno dopo la partita', () => {
    expect(allItems(A).filter((it) => exOf(it).category === 'gambe')).toEqual([]);
  });

  it('Nordic in stagione a volume basso, una volta a settimana, in B', () => {
    const nordic = allItems(B).find((it) => it.exerciseId === 'nordic-hamstring-curl');
    expect(nordic).toBeDefined();
    expect(nordic!.sets).toBeLessThanOrEqual(3);
    expect(nordic!.repMax).toBeLessThanOrEqual(6);
    expect(usedIn(['nordic-hamstring-curl'], SESSION_LIST.slice())).toHaveLength(1);
  });

  it('B, a 72 ore dalla partita, resta lontana dal cedimento', () => {
    for (const it of allItems(B)) if (it.rir !== undefined) expect(it.rir, it.exerciseId).toBeGreaterThanOrEqual(2);
  });

  it('C è leggera: 2 serie al massimo e RIR 3', () => {
    for (const it of C.blocks.find((b) => /principale/i.test(b.title))!.items) {
      expect(it.sets, it.exerciseId).toBeLessThanOrEqual(2);
      if (it.rir !== undefined) expect(it.rir, it.exerciseId).toBe(3);
    }
  });

  it('la prevenzione obbligatoria sta nelle sedute A e B', () => {
    const need: [string, string[]][] = [
      ['Copenhagen dalla leva corta', ['copenhagen-leva-corta']],
      ['soleo pesante', ['polpacci-seduto', 'soleo-una-gamba-ginocchio-piegato']],
      ['polpacci in piedi', ['polpacci-in-piedi-macchina', 'polpacci-una-gamba-manubrio']],
      ['isometria degli estensori del polso', ['isometria-estensori-polso']],
      ['eccentrico degli estensori del polso', ['tyler-twist', 'eccentrico-estensori-polso']],
      ['core anti-estensione', ['dead-bug', 'plank-sugli-avambracci', 'rollout-ruota']],
      ['core anti-rotazione', ['pallof-press']],
    ];
    for (const [what, ids] of need) expect(usedIn(ids, mandatory).length, what).toBeGreaterThanOrEqual(1);
    expect(usedIn(['tibiale-anteriore-seduto', 'tibiale-al-muro'], mandatory).length, 'tibiale anteriore').toBe(2);
    expect(usedIn(['tyler-twist', 'eccentrico-estensori-polso'], mandatory).length, 'eccentrico del polso').toBe(2);
  });

  it('per il gomito, l’isometria viene prima delle spinte', () => {
    const items = allItems(A);
    const iso = items.findIndex((it) => it.exerciseId === 'isometria-estensori-polso');
    const firstPush = items.findIndex((it) => exOf(it).category === 'spinta');
    expect(iso).toBeGreaterThanOrEqual(0);
    expect(iso).toBeLessThan(firstPush);
  });

  it('polpacci e soleo restano pesanti: al massimo 12 ripetizioni, con progressione', () => {
    for (const s of mandatory) {
      for (const it of allItems(s).filter((x) => /polpacci/.test(x.exerciseId))) {
        expect(it.repMax, `${s.id}/${it.exerciseId}`).toBeLessThanOrEqual(12);
        expect(it.progression, `${s.id}/${it.exerciseId}`).toBe('doppia');
      }
    }
  });
});
