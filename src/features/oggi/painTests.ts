/**
 * Gesti di prova del dolore per zona, sempre uguali: senza un riferimento il numero cambia con l'umore.
 * Li usano il controllo del mattino e gli avvisi di Oggi ("prima di uscire rifai il test").
 */

interface PainTest {
  re: RegExp;
  /** Il gesto, detto in breve. */
  text: string;
  /**
   * Regola di sicurezza: quando il gesto non va fatto. Con uno stress osseo che fa male già camminando,
   * saltare per misurarlo è controindicato.
   */
  safety?: string;
}

const PAIN_TESTS: PainTest[] = [
  { re: /tibi|stinc/i, text: '10 saltelli su una gamba', safety: 'Se camminare fa già male, non saltare: segna il dolore camminando.' },
  { re: /polpacc|achill|cavigl/i, text: '10 sollevamenti sulle punte su una gamba', safety: 'Se camminare fa già male, non farli: segna il dolore camminando.' },
  { re: /gomit/i, text: 'stringi forte una bottiglia a braccio teso' },
  { re: /flessor|posterior/i, text: 'ponte su una gamba, 5 ripetizioni' },
  { re: /addutt|pube|inguin/i, text: 'stringi un pallone tra le ginocchia' },
  { re: /ginocch/i, text: '5 squat su una gamba, lenti' },
  { re: /spall/i, text: 'braccio teso sopra la testa' },
];

/**
 * Gesto di prova della zona ("10 saltelli su una gamba"); per le zone sconosciute i primi passi del mattino.
 * `custom` sono i gesti indicati dal fisioterapista, per zona (campo facoltativo `Profile.painTests`): vincono
 * su quelli predefiniti.
 */
export function testGesture(site: string, custom?: Record<string, string>): string {
  const own = custom?.[site]?.trim();
  if (own) return own;
  return PAIN_TESTS.find((g) => g.re.test(site))?.text ?? 'primi passi del mattino';
}

/** Gesti personalizzati salvati nel profilo (`Profile.painTests`, facoltativo), solo quelli scritti davvero. */
export function customPainTests(profile: object | undefined): Record<string, string> | undefined {
  const t = (profile as { painTests?: unknown } | undefined)?.painTests;
  if (!t || typeof t !== 'object') return undefined;
  return Object.fromEntries(Object.entries(t as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'));
}

/** Regola di sicurezza del gesto, se c'è (con un gesto del fisioterapista vale la sua indicazione). */
export function testSafety(site: string, custom?: Record<string, string>): string | undefined {
  if (custom?.[site]?.trim()) return undefined;
  return PAIN_TESTS.find((g) => g.re.test(site))?.safety;
}

/**
 * Oltre questo valore, per le zone con un gesto d'impatto, il dolore c'è anche senza saltare: è un segnale da
 * riferire al fisioterapista, non un numero da gestire da soli.
 */
export const PAIN_TEST_ALERT = 5;

/** La zona ha un gesto di prova con impatto o carico sul piede (tibia, caviglia, polpaccio). */
export function isImpactTest(site: string): boolean {
  return Boolean(testSafety(site));
}
