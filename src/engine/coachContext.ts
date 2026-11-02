/**
 * Contesto del coach: il prompt di sistema (stabile, va in cache) e un riassunto compatto in testo dello
 * stato dell'utente, ricostruito a ogni domanda: profilo, piano, giornata di oggi con gli stati delle voci,
 * menù con i valori, ultimi controlli del mattino, dolori, sedute e calcio recenti, settimana.
 *
 * Privacy: il nome non viene mai inviato. L'interfaccia mostra all'utente questo stesso testo.
 * Ogni sezione è protetta: se un motore fallisce, il coach riceve comunque il resto.
 */
import type { AppData, CheckIn, DayType, ISODate, ItemStatus, MealSlot, MealSource, Nutrients, Weekday } from '../domain/types';
import { BAR_OPTIONS, BAR_VERDICTS } from '../data/barPlanB';
import { SESSIONS } from '../data/sessions';
import {
  DAY_TYPE_LABEL,
  FOOTBALL_LABEL,
  WEEKDAY_SHORT,
  capitalize,
  fmtHours,
  fmtKcal,
  fmtKg,
  fmtNumber,
  fmtPercent,
  listIt,
  plural,
} from '../lib/format';
import {
  addDays,
  currentDate,
  daysBetween,
  formatDayLong,
  formatShort,
  formatWeekdayShort,
  nowHHMM,
  toISO,
  weekStart,
  weekdayOf,
} from './dates';
import { dayTypeFor, effectiveDayType, isMatchEve, mealsForDate } from './menu';
import { dayCarbScale, dayNutritionDetail, dayTargetFor, eatenMeal, recipeNutrition } from './nutrition';
import { droppedByOverride, sessionFor } from './plan/program';
import { firstReviewDate, MIN_NUTRITION_DAYS, reviewAvailable, weeklyStepStatus, weekStats } from './review';
import { checkInSleepHours, curfewFor, planDayISO } from './sleep';
import { ageFrom, MATCH_CARB_G_PER_KG } from './targets';
import { adherenceSummary, buildDay, doseUndefined, effectiveStatus, takenSupplements } from './timeline';
import { bestSet, findExercise, impactThresholdFor, isElbowSite, isLowerLegSite, loadStatus, nextPlannedSession, painGate } from './training';

// ───────────────────────── Prompt di sistema ─────────────────────────

function barLine(o: (typeof BAR_OPTIONS)[number]): string {
  const a = o.approx;
  return `- ${o.name}: circa ${fmtNumber(a.kcal)} kcal, P ${fmtNumber(a.proteinG)} g. ${o.why}`;
}

function barSection(): string {
  const groups = (['si', 'meglio', 'programmato'] as const)
    .map((v) => {
      const list = BAR_OPTIONS.filter((o) => o.verdict === v);
      if (!list.length) return '';
      return `${BAR_VERDICTS[v].label} (${BAR_VERDICTS[v].hint.toLowerCase()}):\n${list.map(barLine).join('\n')}`;
    })
    .filter(Boolean);
  return groups.length ? groups.join('\n\n') : 'Nessuna opzione caricata: ragiona sulle scelte tipiche di un bar italiano.';
}

/**
 * Prompt di sistema del coach. Stabile tra una domanda e l'altra (niente date né dati che cambiano):
 * così resta in cache. I dati della giornata arrivano a parte, nel contesto.
 */
export const COACH_SYSTEM_PROMPT = `Sei il coach di Ritmo, un’app personale che decide la giornata dell’utente: cosa mangiare, come allenarsi intorno al calcio, quando posare il telefono e dormire. Sei un allenatore e un nutrizionista sportivo pratico: parli come un professionista competente e calmo, a bordo campo.

Chi hai davanti
- Un calciatore amatoriale che va anche in palestra: partite e allenamenti di sera, sedute di palestra con un programma, esercizi del fisioterapista. Obiettivo, priorità e zone da monitorare sono nel profilo del contesto: rispetta quell’ordine.
- Insieme a queste istruzioni ricevi il contesto di Ritmo: profilo, piano, giornata di oggi con lo stato di ogni voce, menù con i valori stimati, controlli del mattino, dolori, sedute e calcio recenti. Usalo: rispondi su questa persona e su questa giornata, non in generale. Se un dato manca, dillo in mezza riga e dai comunque l’indicazione migliore.
- Se nel profilo ci sono competenze dichiarate (per esempio dietista, preparatore atletico o fisioterapista), parla da collega: termini tecnici corretti, niente spiegazioni di base, vai dritto al ragionamento e ai numeri.

Come rispondi
- In italiano, con frasi brevi e voce attiva. Di norma tra 40 e 120 parole; di più solo se l’utente chiede un approfondimento.
- Prima la decisione, poi il motivo in una frase. Una proposta concreta, con le porzioni a mano (palmo, pugno, pollice, mano a coppa) e i grammi quando servono.
- Testo semplice per una chat sul telefono: paragrafi brevi; elenchi con "- " solo per opzioni o passaggi. Niente titoli, tabelle, emoji o trattino lungo. Il grassetto con **...** al massimo per una parola chiave.
- Numeri in formato italiano: 2.600 kcal, 70,2 kg, 6 h 40, orari come 07:30.
- Tono calmo, niente esclamazioni a raffica, niente prediche. Se la giornata è andata storta, proponi la giornata minima o il prossimo passo utile, senza colpe.

Cosa sai fare
- Al bar: scegli dal piano B qui sotto in base all’ora, al pasto e al tipo di giorno (nei giorni di calcio più carboidrati; prima della partita cibi digeribili e poveri di grassi e fibre).
- Foto del piatto: stima porzioni e valori indicativi, confronta con il pasto previsto e con gli obiettivi di oggi, poi suggerisci un solo aggiustamento per il resto della giornata. Le stime da foto sono approssimative: dillo una volta, senza insistere.
- Prevenzione dei tumori, sempre (WCRF 2018, Codice europeo contro il cancro): non proporre mai carni lavorate, cioè salumi e affettati (prosciutto crudo e cotto, salame, mortadella, speck, bresaola, pancetta), würstel anche di pollo, salsiccia, carne in scatola, fesa di pollo o tacchino arrosto a fette, ragù pronto di carne; né gallette o riso soffiato. Carne rossa fresca (manzo, vitello, maiale, agnello, cavallo): nel menù una porzione a settimana, in tutto non oltre circa 350 g cotti a settimana con i pasti fuori. Pollo, tacchino, pesce e uova non hanno un tetto oncologico. Ogni giorno almeno 400 g di verdura e frutta e 30 g di fibre, cereali integrali in quasi tutti i pasti, legumi spesso. Riso al massimo 3 volte a settimana, lessato in molta acqua e scolato. Cotture: dorato e non bruciato, alla griglia girare spesso e togliere le parti annerite. Bevande calde non bollenti.
- Alcol: per i tumori la scelta migliore è non bere, non c’è una dose sicura. Non proporlo mai; se l’utente beve, ogni bicchiere in meno conta, e mai 5 o più nella stessa sera.
- Integratori e tumori: nessuno li previene. Beta-carotene, vitamina E e acido folico ad alte dosi hanno dato più tumori in alcuni trial; per la vitamina B12 ad alte dosi c’è solo un sospetto da studi osservazionali. Non proporne a questo scopo e rimanda al medico per le dosi.
- Proporzioni: per un adulto attivo contano soprattutto alcol, peso e attività fisica, poi carne lavorata, fibre, verdura e frutta. Contaminanti e cotture sono precauzioni. Niente allarmi: il gruppo 1 dell’IARC dice quanto sono solide le prove, non quanto è grande il rischio; niente superfood, diete alcaline o «lo zucchero nutre il tumore».
- Cucina: piatti da 15 minuti con ingredienti comuni e verdure comode (surgelati, insalate in busta, legumi in barattolo, vellutate), adattati al tipo di giorno e a quello che l’utente ha in casa.
- Allenamento: decidi se saltare, accorciare o spingere una seduta in base a sonno, dolore, carico della settimana e distanza dalla partita. Di solito accorciare è meglio che saltare. Rispetta la progressione doppia, i RIR e le limitazioni del piano indicate nel contesto.
- Settimana: leggi aderenza, sonno, peso, dolori e carico; di’ cosa ha funzionato e proponi una correzione. Se nel contesto c’è uno scalino della settimana (un solo obiettivo piccolo, come un frutto allo spuntino), aiutalo a centrarlo prima di aggiungere altro. Le modifiche al piano si accettano nella revisione della domenica, nella sezione Progressi: ricordalo quando proponi un cambiamento.
- Ritmo ha queste sezioni: Oggi (timeline da segnare, acqua, dolci, giornata minima), Settimana (menù, spesa, preparazione della domenica), Allenamento (sedute e storico), Coach, Progressi (grafici e revisione della domenica). Indica la sezione giusta quando serve.

Limiti e sicurezza
- Non fai diagnosi e non prescrivi farmaci né integratori nuovi. Per dosi come quella della vitamina D rimanda al medico e agli esami.
- Peso: guarda la media di 7 giorni, non la singola pesata. Nelle prime 3-4 settimane di creatina il peso sale di circa 0,5-1 kg per l’acqua nei muscoli: non è grasso e non si correggono le calorie per questo.
- Dolore: se una zona monitorata è sopra la soglia del piano o in aumento, mantieni o riduci il carico e consiglia di sentire il fisioterapista; applica le limitazioni indicate nel contesto. Non cambiare gli esercizi prescritti dal fisioterapista.
- Segnali da medico, subito: dolore al petto, svenimento, fiato corto anomalo, palpitazioni, gonfiore o arrossamento importante, dolore notturno o a riposo che non passa, febbre, trauma con deformità o impossibilità di caricare il peso. In questi casi dillo per primo, con chiarezza.
- Niente diete estreme, digiuni lunghi o cali di peso rapidi. Se emergono segnali di un rapporto difficile con il cibo, rispondi con delicatezza e suggerisci un professionista.
- Se una domanda esce dal tuo campo, rispondi in breve o indica chi può aiutare.

Piano B al bar (valori indicativi della porzione tipica servita al banco)
${barSection()}`;

// ───────────────────────── Giornata del coach ─────────────────────────

/** Giornata in corso: dopo mezzanotte e prima della sveglia vale ancora quella di ieri (come in Oggi). */
export function coachDay(state: Pick<AppData, 'plan'>, now: Date = currentDate()): ISODate {
  return planDayISO(now, state.plan);
}

const STATUS_LABEL: Record<ItemStatus, string> = { fatto: 'fatto', sostituito: 'sostituito', saltato: 'saltato' };

const GOAL_LABEL: Record<AppData['profile']['goal'], string> = {
  ricomposizione: 'ricomposizione corporea',
  dimagrimento: 'dimagrimento',
  massa: 'aumento della massa muscolare',
  mantenimento: 'mantenimento',
};

/** Priorità in ordine, dall'obiettivo del profilo: salute e calcio vengono sempre prima. */
const GOAL_PRIORITIES: Record<AppData['profile']['goal'], string> = {
  ricomposizione: "salute (infiammazione di basso grado, microbiota), rendimento nel calcio senza infortuni, un po’ di muscolo a peso stabile",
  dimagrimento: 'salute (infiammazione di basso grado, microbiota), rendimento nel calcio senza infortuni, calo di grasso graduale senza perdere muscolo',
  massa: 'salute (infiammazione di basso grado, microbiota), rendimento nel calcio senza infortuni, più muscolo con un surplus contenuto',
  mantenimento: 'salute (infiammazione di basso grado, microbiota), rendimento nel calcio senza infortuni, peso e forma stabili',
};

const n1 = (x: number) => fmtNumber(x, 1);
/** "Dose da definire" → "dose da definire" (non tocca sigle come "EPA"). */
const lowerFirst = (s: string) => (s.length > 1 && s[1] === s[1].toLowerCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const trimDot = (s: string) => s.trim().replace(/[.\s]+$/, '');
const n0 = (x: number) => fmtNumber(Math.round(x));
const dayShort = (iso: ISODate) => `${formatWeekdayShort(iso)} ${formatShort(iso)}`;

function macros(t: Nutrients | AppData['plan']['targets'][DayType]): string {
  return `P ${n0(t.proteinG)} g, C ${n0(t.carbG)} g, G ${n0(t.fatG)} g, fibre ${n0(t.fiberG)} g`;
}

function painList(pain: Record<string, number> | undefined): string {
  const e = Object.entries(pain ?? {}).filter(([, v]) => typeof v === 'number' && Number.isFinite(v));
  return e.length ? e.map(([k, v]) => `${k} ${n0(v)}`).join(', ') : '';
}

function lastWeight(state: Pick<AppData, 'checkIns'>, upTo: ISODate): { kg: number; date: ISODate } | null {
  const dates = Object.keys(state.checkIns)
    .filter((d) => d <= upTo)
    .sort();
  for (let i = dates.length - 1; i >= 0; i--) {
    const w = state.checkIns[dates[i]]?.weightKg;
    if (typeof w === 'number' && w > 0) return { kg: w, date: dates[i] };
  }
  return null;
}

/** Sezione protetta: un errore di un motore non blocca il resto del contesto. */
function section(title: string, build: () => string | string[] | null | undefined): string {
  try {
    const body = build();
    const text = Array.isArray(body) ? body.filter(Boolean).join('\n') : body;
    return text ? `## ${title}\n${text}` : '';
  } catch {
    return '';
  }
}

// ───────────────────────── Sezioni ─────────────────────────

function profileSection(state: AppData, today: ISODate, now: Date): string[] {
  const p = state.profile;
  const bits: string[] = [];
  const who = [p.sex === 'F' ? 'Donna' : 'Uomo'];
  if (p.birthYear > 1900) who.push(`${ageFrom(p.birthYear, now)} anni`);
  if (p.heightCm > 0) who.push(`${n0(p.heightCm)} cm`);
  bits.push(`${who.join(', ')}.`);
  const w = lastWeight(state, today);
  const weight: string[] = [];
  if (w) weight.push(`ultimo ${fmtKg(w.kg)} (${dayShort(w.date)})`);
  if (p.startWeightKg > 0) weight.push(`partenza ${fmtKg(p.startWeightKg)}`);
  if (weight.length) bits.push(`Peso: ${weight.join(', ')}.`);
  bits.push(`Obiettivo: ${GOAL_LABEL[p.goal] ?? p.goal}.`);
  const lines = [bits.join(' ')];
  if (GOAL_PRIORITIES[p.goal]) lines.push(`Priorità, in quest’ordine: ${GOAL_PRIORITIES[p.goal]}.`);
  if (p.expertise?.trim()) lines.push(`Competenze dichiarate: ${p.expertise.trim()}.`);
  if (p.painSites.length) lines.push(`Zone di dolore monitorate: ${listIt(p.painSites)}; soglia del piano ${n0(state.plan.painThreshold)} su 10.`);
  lines.push(`Acqua: ${n1(p.waterTargetL)} l al giorno.`);
  return lines;
}

function weekdayPlan(state: AppData): string {
  const days = [...state.plan.week].sort((a, b) => a.weekday - b.weekday);
  return days
    .map((d) => {
      const parts: string[] = [];
      if (d.football) parts.push(`${FOOTBALL_LABEL[d.football.kind].toLowerCase()} ${d.football.time}, ${n0(d.football.durationMin)} min`);
      if (d.gymSessionId) {
        const s = SESSIONS[d.gymSessionId];
        parts.push(`${s?.name ?? `seduta ${d.gymSessionId}`}${d.gymTime ? ` ${d.gymTime}` : ''}${d.gymOptional ? ' facoltativa' : ''}`);
      }
      if (d.physio) parts.push('fisio');
      return `${WEEKDAY_SHORT[d.weekday as Weekday]} ${DAY_TYPE_LABEL[d.dayType].toLowerCase()}${parts.length ? ` (${parts.join('; ')})` : ''}`;
    })
    .join(' · ');
}

function planSection(state: AppData, today: ISODate): string[] {
  const plan = state.plan;
  const lines: string[] = [];
  lines.push(`Settimana tipo: ${weekdayPlan(state)}.`);
  lines.push(
    `Obiettivi per tipo di giorno: ${(Object.keys(plan.targets) as DayType[])
      .map((t) => `${DAY_TYPE_LABEL[t].toLowerCase()} ${fmtKcal(plan.targets[t].kcal)} (${macros(plan.targets[t])})`)
      .join('; ')}.`,
  );
  lines.push(`Partita e vigilia: almeno ${n0(MATCH_CARB_G_PER_KG)} g/kg di carboidrati, già compresi nell’obiettivo e nelle porzioni di quei giorni.`);
  const s = plan.sleep;
  lines.push(
    `Sonno: sveglia ${s.wake}; a letto alle ${s.current} in questa fase (obiettivo finale ${s.target}, si anticipa di ${n0(s.stepMin)} min dopo una settimana in orario); coprifuoco del telefono alle ${curfewFor(today, plan)}.`,
  );
  const mt = plan.mealTimes;
  lines.push(`Orari dei pasti: colazione ${mt.colazione}, spuntino ${mt.spuntino}, pranzo ${mt.pranzo}, merenda ${mt.merenda}, cena ${mt.cena} (nei giorni di calcio serale merenda pre-calcio e cena di recupero).`);
  const supp = takenSupplements(plan);
  if (supp.length) lines.push(`Integratori: ${supp.map((x) => `${x.name}, ${lowerFirst(x.dose)} (${x.timing})`).join('; ')}.`);
  const undecided = plan.supplements.filter((x) => x.active && doseUndefined(x));
  if (undecided.length) {
    lines.push(`Integratori senza dose: ${listIt(undecided.map((x) => x.name))}, dose da definire con l’esame, per ora non si prende${undecided.length > 1 ? 'no' : ''}.`);
  }
  lines.push(`Dolci previsti: ${n0(plan.sweetsPerWeek)} a settimana.`);
  const sites = state.profile.painSites ?? [];
  const limits: string[] = [];
  const elbow = sites.find(isElbowSite);
  if (elbow) limits.push(`${elbow.toLowerCase()} monitorato: nelle spinte manubri a presa neutra, niente bilanciere`);
  const lower = sites.filter(isLowerLegSite);
  if (lower.length) {
    const t = Math.min(plan.painThreshold ?? 3, impactThresholdFor(plan));
    limits.push(`${listIt(lower.map((x) => x.toLowerCase()))}: balzi e salti solo con dolore fino a ${n0(t)} su 10`);
  }
  if (limits.length) lines.push(`Limitazioni del piano: ${limits.join('; ')}.`);
  const presc = state.physio.prescriptions;
  if (presc.length) {
    const ex = presc.map((p) => {
      const name = findExercise(p.exerciseId, state.physio)?.name ?? p.exerciseId;
      const reps = p.repMin === p.repMax ? n0(p.repMin) : `${n0(p.repMin)}-${n0(p.repMax)}`;
      return `${name} ${n0(p.sets)}×${reps}${p.unit === 'secondi' ? ' s' : ''}${p.perSide ? ' per lato' : ''}`;
    });
    lines.push(`Esercizi del fisioterapista: ${ex.join('; ')}.`);
  }
  return lines;
}


/** Provenienza di un pasto stimato nella riga del coach: il piano B al bar resta «ordine al bar», come prima. */
const EATEN_SOURCE_LABEL: Record<MealSource, string> = {
  bar: 'ordine al bar',
  foto: 'stima dalla foto',
  piatto: 'piatto salvato',
};

function todaySection(state: AppData, today: ISODate): string[] {
  const plan = state.plan;
  const dayType = dayTypeFor(today, plan);
  // La vigilia della partita mangia come un giorno di calcio, e partita e vigilia hanno il minimo di
  // carboidrati: l'obiettivo della data è lo stesso di Oggi e del menù.
  const t = dayTargetFor(today, state);
  const log = state.dayLogs[today];
  const lines: string[] = [];
  const eve = isMatchEve(today, plan) ? ', vigilia della partita (porzioni e obiettivo da giorno di calcio)' : '';
  lines.push(`Tipo di giorno: ${DAY_TYPE_LABEL[dayType].toLowerCase()}${eve}, obiettivo ${fmtKcal(t.kcal)} (${macros(t)}).`);

  const items = buildDay(today, state);
  const status = effectiveStatus(today, state, items);
  const sum = adherenceSummary(today, state, items, status);
  const counts = [
    plural(sum.done, 'fatta', 'fatte'),
    sum.replaced ? plural(sum.replaced, 'sostituita', 'sostituite') : '',
    sum.skipped ? plural(sum.skipped, 'saltata', 'saltate') : '',
    plural(sum.pending, 'da fare', 'da fare'),
  ].filter(Boolean);
  lines.push(
    `${sum.minimal ? 'Giornata minima attiva. ' : ''}Voci: ${counts.join(', ')} su ${n0(sum.total)} (aderenza ${fmtPercent(sum.score)}).`,
  );

  const meals = mealsForDate(today, state);
  const k = dayCarbScale(today, state);
  lines.push('Timeline:');
  for (const it of items) {
    const st = status[it.id];
    let label = `${it.time} ${it.title}`;
    if (it.preShopping) {
      label += ': prima della prima spesa, con quello che c’è in casa';
    } else if (it.kind === 'pasto' && it.slot) {
      const entry = meals.bySlot[it.slot as MealSlot];
      if (entry?.recipe) {
        const nn = recipeNutrition(entry.recipe, meals.dayType, undefined, k);
        label += `: ${entry.recipe.name}${entry.swapped ? ' (scelta al posto del menù)' : ''} (${fmtKcal(nn.kcal)}, P ${n0(nn.proteinG)} g, fibre ${n0(nn.fiberG)} g)`;
      }
    } else if (it.detail) {
      label += `: ${it.detail}`;
    }
    const note = log?.notes?.[it.id];
    // Pasto stimato che vale (`eatenMeal`: piano B al bar, foto, piatto salvato): i suoi valori, non quelli della ricetta.
    const bar = it.kind === 'pasto' && it.slot ? eatenMeal(log, it.slot as MealSlot) : null;
    const barValues = bar
      ? `, ${EATEN_SOURCE_LABEL[bar.source ?? 'bar']}: ${fmtKcal(bar.nutrients.kcal)}, P ${n0(bar.nutrients.proteinG)} g, fibre ${n0(bar.nutrients.fiberG)} g`
      : '';
    lines.push(`- ${label} · ${st ? STATUS_LABEL[st] : it.kind === 'letto' ? 'stasera' : 'da fare'}${barValues}${note ? ` (nota: "${trimDot(note)}")` : ''}`);
  }

  const det = dayNutritionDetail(today, state);
  if (det.total.kcal > 0) {
    lines.push(
      `Menù di oggi, totale stimato: ${fmtKcal(det.total.kcal)} (${macros(det.total)}), ${plural(Math.round(det.vegPortions), 'porzione', 'porzioni')} di frutta e verdura.`,
    );
  }
  const glasses = log?.waterGlasses ?? 0;
  const glassTarget = Math.round((state.profile.waterTargetL || 2.5) / 0.25);
  lines.push(`Acqua: ${plural(glasses, 'bicchiere', 'bicchieri')} da 250 ml su ${n0(glassTarget)}. Dolci oggi: ${n0(log?.sweets ?? 0)}.`);
  return lines;
}

function checkInLine(iso: ISODate, c: CheckIn): string {
  const parts: string[] = [];
  if (typeof c.weightKg === 'number' && c.weightKg > 0) parts.push(`peso ${fmtKg(c.weightKg)}`);
  const h = checkInSleepHours(c);
  if (h !== undefined) {
    const times = [c.bedTime ? `a letto ${c.bedTime}` : '', c.wakeTime ? `sveglia ${c.wakeTime}` : ''].filter(Boolean).join(', ');
    parts.push(`a letto ${fmtHours(h)}${times ? ` (${times})` : ''}${c.sleepQuality ? `, qualità ${n0(c.sleepQuality)}/5` : ''}`);
  }
  if (typeof c.energy === 'number') parts.push(`energia ${n0(c.energy)}/10`);
  const pain = painList(c.pain);
  if (pain) parts.push(`dolore ${pain}`);
  return `- ${dayShort(iso)}: ${parts.join(' · ') || 'nessun valore'}`;
}

function checkInsSection(state: AppData, today: ISODate): string[] {
  const dates = Object.keys(state.checkIns)
    .filter((d) => d <= today && daysBetween(d, today) < 14)
    .sort()
    .reverse()
    .slice(0, 7);
  const lines = dates.map((d) => checkInLine(d, state.checkIns[d]));
  if (!state.checkIns[today]) lines.unshift('- Il controllo del mattino di oggi non è ancora fatto.');
  if (dates.some((d) => state.checkIns[d]?.bedTime)) {
    lines.push('Le ore sono tempo a letto, dagli orari segnati: il sonno vero è circa l’85-90% di quel tempo. Non chiamarle ore dormite.');
  }
  const gate = painGate(state, today);
  if (gate.sites.length) lines.push(`Regola del dolore oggi: ${gate.title}. ${gate.message}`);
  const limits: string[] = [];
  if (gate.impact || gate.lowerLeg) limits.push('niente balzi né salti');
  if (gate.elbowOver) limits.push('panca con i manubri sostituita da chest press e cavi');
  else if (gate.elbow) limits.push('niente aumenti nelle spinte');
  if (limits.length) lines.push(`Limitazioni di oggi: ${limits.join('; ')}.`);
  return lines;
}

function trainingSection(state: AppData, today: ISODate): string[] {
  const lines: string[] = [];
  const workouts = state.workoutLogs
    .filter((w) => w.date <= today)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 3);
  if (workouts.length) {
    lines.push('Ultime sedute di palestra:');
    for (const w of workouts) {
      const name = sessionFor(w.sessionId, w.date, state.plan)?.name ?? `Seduta ${w.sessionId}`;
      const ex = w.exercises
        .map((e) => {
          const best = bestSet(e);
          if (!best) return '';
          const exName = findExercise(e.exerciseId, state.physio)?.name ?? e.exerciseId;
          const sets = e.sets.filter((s) => s.done).length;
          return `${exName} ${n0(sets)} serie, migliore ${n1(best.set.weightKg)} kg × ${n0(best.set.reps)}`;
        })
        .filter(Boolean)
        .slice(0, 4);
      const pain = painList(w.pain);
      lines.push(
        `- ${dayShort(w.date)} · ${name} · ${n0(w.durationMin)} min · RPE ${n0(w.rpe)}${pain ? ` · dolore ${pain}` : ''}${ex.length ? ` · ${ex.join('; ')}` : ''}`,
      );
    }
  } else {
    lines.push('Nessuna seduta di palestra registrata finora.');
  }
  const football = state.footballLogs
    .filter((f) => f.date <= today && daysBetween(f.date, today) < 14)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (football.length) {
    lines.push(`Calcio recente: ${football.map((f) => `${dayShort(f.date)} ${FOOTBALL_LABEL[f.kind].toLowerCase()} ${n0(f.durationMin)} min, RPE ${n0(f.rpe)}`).join('; ')}.`);
  }
  const ls = loadStatus(weekStart(today), state);
  const load = [`Carico della settimana in corso (minuti × RPE): ${n0(ls.load)} UA`];
  if (ls.average !== null) load.push(`media delle settimane precedenti ${n0(ls.average)} UA${ls.ratio ? ` (${fmtPercent(ls.ratio)})` : ''}`);
  lines.push(`${load.join('; ')}.${ls.alert ? ' Attenzione: carico oltre il 120% della media.' : ''}`);
  const next = nextPlannedSession(today, state);
  if (next) {
    const name = sessionFor(next.sessionId, next.date, state.plan)?.name ?? `Seduta ${next.sessionId}`;
    const when = next.daysAway === 0 ? 'oggi' : next.daysAway === 1 ? 'domani' : formatDayLong(next.date);
    lines.push(`Prossima seduta: ${name} ${when}${next.time ? ` alle ${next.time}` : ''}${next.optional ? ' (facoltativa)' : ''}.`);
  }
  return lines;
}

function weekSection(state: AppData, today: ISODate): string[] {
  const out: string[] = [];
  const describe = (label: string, ws: ISODate, opts: { today?: ISODate }) => {
    const s = weekStats(ws, state, opts);
    const parts: string[] = [];
    if (s.adherence !== null) parts.push(`aderenza media ${fmtPercent(s.adherence)} su ${plural(s.adherenceDays, 'giorno', 'giorni')}, ${plural(s.successfulDays, 'giornata riuscita', 'giornate riuscite')}`);
    if (s.sleepAvgH !== null) parts.push(`tempo a letto medio ${fmtHours(s.sleepAvgH)}, ${n0(s.nightsOnTarget)} notti in orario su ${n0(Math.max(s.countedNights, s.nightsWithBedtime))}`);
    if (s.firstWeek) parts.unshift(`prima settimana con Ritmo (${plural(s.daysWithRitmo, 'giorno', 'giorni')})`);
    if (s.weightAvg !== null) parts.push(`peso medio ${fmtKg(s.weightAvg)}${s.weightDelta !== null ? ` (${s.weightDelta >= 0 ? '+' : '−'}${n1(Math.abs(s.weightDelta))} kg)` : ''}`);
    // Fibre e proteine solo da 3 giorni con almeno 3 pasti su 5 segnati: mezza giornata direbbe un numero sbagliato.
    if (s.fiberAvgG !== null && s.nutritionDays >= MIN_NUTRITION_DAYS) {
      const menu = s.fiberPlannedG !== null ? ` (menù previsto ${n0(s.fiberPlannedG)} g di fibre e ${s.proteinPlannedG !== null ? n0(s.proteinPlannedG) : '?'} g di proteine)` : '';
      const bar = s.mealsAtBar ? ` (${n0(s.mealsAtBar)} con il piano B al bar, contati con i valori dell’ordine)` : '';
      parts.push(
        `fibre stimate ${n0(s.fiberAvgG)} g al giorno, proteine ${s.proteinAvgG !== null ? n0(s.proteinAvgG) : '?'} g, da ${n0(s.mealsLogged)} pasti segnati su ${n0(s.mealsCounted)}${menu}; pasti sostituiti ${n0(s.mealsReplaced)}${bar}, saltati ${n0(s.mealsSkipped)}`,
      );
    }
    parts.push(`dolci ${n0(s.sweets)} su ${n0(s.sweetsPlanned)} previsti`);
    parts.push(`${plural(s.gymSessions, 'seduta', 'sedute')} di palestra, ${n0(s.footballSessions)} di calcio`);
    out.push(`${label}: ${parts.join('; ')}.`);
  };
  const ws = weekStart(today);
  describe(`Settimana in corso (dal ${formatDayLong(ws)})`, ws, { today });
  const prev = addDays(ws, -7);
  if (prev >= weekStart(state.plan.startDate)) describe(`Settimana scorsa (dal ${formatDayLong(prev)})`, prev, {});
  const step = weeklyStepStatus(today, state);
  if (step) {
    out.push(
      `Scalino della settimana: ${step.step.title.toLowerCase()} (${step.step.how}). Fatto ${plural(step.done, 'giorno', 'giorni')} su ${n0(step.target)} da centrare${step.todayState === 'fatto' ? ', oggi già fatto' : ''}.`,
    );
  }
  // Prima della prima revisione (settimana di avvio troppo corta) il coach non deve mandare a una revisione che non c'è.
  if (!reviewAvailable(today, state.plan)) {
    const first = firstReviewDate(state.plan);
    if (first) out.push(`Prima revisione della domenica: ${formatDayLong(first)}. Prima di allora non c’è una settimana da rivedere.`);
  }
  const last = [...state.reviews].sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1))[0];
  if (last) {
    const v = last.votes;
    out.push(
      `Ultima revisione della domenica (settimana dal ${formatDayLong(last.weekStart)}): energia ${n0(v.energia)}, digestione ${n0(v.digestione)}, umore ${n0(v.umore)}, sensazioni in campo ${n0(v.campo)} su 10${last.waistCm ? `; vita ${n1(last.waistCm)} cm` : ''}${last.note ? `; nota: "${trimDot(last.note)}"` : ''}.`,
    );
  }
  return out;
}

/**
 * Contesto completo in testo compatto (italiano), da mandare insieme a ogni domanda.
 * Non contiene il nome dell'utente.
 */
export function buildCoachContext(state: AppData, now: Date = currentDate()): string {
  const today = coachDay(state, now);
  const head = `# Contesto di Ritmo\nAdesso: ${formatDayLong(toISO(now))} ${now.getFullYear()}, ore ${nowHHMM(now)}. Giornata in corso: ${formatDayLong(today)}.${
    state.settings.demoData ? '\nNota: sono attivi i dati di esempio dell’app, non dati reali.' : ''
  }`;
  return [
    head,
    section('Profilo', () => profileSection(state, today, now)),
    section('Piano', () => planSection(state, today)),
    section(`Oggi, ${formatDayLong(today)}`, () => todaySection(state, today)),
    section('Controlli del mattino recenti', () => checkInsSection(state, today)),
    section('Allenamento e calcio', () => trainingSection(state, today)),
    section('Settimana', () => weekSection(state, today)),
  ]
    .filter(Boolean)
    .join('\n\n');
}

// ───────────────────────── Riassunto per l'interfaccia ─────────────────────────

export interface CoachDaySummary {
  date: ISODate;
  dayType: DayType;
  /** Vigilia della partita in un giorno senza calcio: obiettivo e porzioni da giorno di calcio. */
  matchEve?: boolean;
  kcal: number;
  /** "Seduta A alle 17:00", "Partita alle 21:00", oppure null. */
  activity: string | null;
  done: number;
  total: number;
  minimal: boolean;
  /** Ore a letto stanotte, se c'è il controllo del mattino (tempo a letto, non sonno misurato). */
  sleepH: number | null;
  /** Zona più dolorante di oggi, se c'è. */
  pain: { site: string; value: number; over: boolean } | null;
  checkInDone: boolean;
}

/** Quello che il coach "vede" della giornata, in breve, per le pillole della chat. */
export function coachDaySummary(state: AppData, now: Date = currentDate()): CoachDaySummary {
  const today = coachDay(state, now);
  const dayType = dayTypeFor(today, state.plan);
  const eff = effectiveDayType(today, state.plan);
  const wd = state.plan.week.find((d) => d.weekday === weekdayOf(today));
  let activity: string | null = null;
  if (wd?.football) activity = `${capitalize(FOOTBALL_LABEL[wd.football.kind])} alle ${wd.football.time}`;
  else if (wd?.gymSessionId && !droppedByOverride(today, wd, state.plan)) {
    const name = sessionFor(wd.gymSessionId, today, state.plan)?.name ?? `Seduta ${wd.gymSessionId}`;
    activity = `${name}${wd.gymOptional ? ' facoltativa' : ''}${wd.gymTime ? ` alle ${wd.gymTime}` : ''}`;
  }
  let done = 0;
  let total = 0;
  let minimal = false;
  try {
    const sum = adherenceSummary(today, state);
    done = sum.done;
    total = sum.total;
    minimal = sum.minimal;
  } catch {
    /* timeline non disponibile */
  }
  const c = state.checkIns[today];
  const h = checkInSleepHours(c);
  let pain: CoachDaySummary['pain'] = null;
  try {
    const gate = painGate(state, today);
    const top = gate.sites[0];
    if (top && gate.date === today) pain = { site: top.site, value: top.value, over: top.level !== 'ok' };
  } catch {
    pain = null;
  }
  return {
    date: today,
    dayType,
    matchEve: dayType !== 'calcio' && eff === 'calcio',
    kcal: dayTargetFor(today, state)?.kcal ?? 0,
    activity,
    done,
    total,
    minimal,
    sleepH: h ?? null,
    pain,
    checkInDone: Boolean(c),
  };
}
