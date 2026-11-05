/**
 * Foglio `mealLog` (docs/FASE2.md § 7.4, § 7.6, § 8.2, § 11.3), `size="large"`, nei modi `foto` e `piatti`.
 *
 * Modo foto: la foto arriva dal selettore del foglio della voce (`photoInbox`) o da un messaggio della chat; lettura del
 * coach («Il coach guarda il piatto…»), scheda modificabile (totali, alimenti con i grammi, olio e condimenti, pasto
 * previsto o sostituito), conferma che scrive stima e stato insieme, poi «Salva tra i miei piatti». Ogni errore ha
 * un'uscita utile. Niente si salva prima della conferma; la foto resta solo in memoria.
 *
 * Modo piatti: `DishesSheet`, offline e senza chiave.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Camera, Check, Store, Utensils } from 'lucide-react';
import type { ISODate, MealSlot, OilChoice } from '../../domain/types';
import { photoReadable, readPhoto } from '../../engine/coachTasks/photo';
import { currentDate } from '../../engine/dates';
import {
  DRAFT_ITEMS_MAX,
  OIL_CHOICES,
  draftMeal,
  draftValues,
  kcalCheck,
  matchesPlanned,
  resolveEstimate,
  roundKcal10,
  type EstimateDraft,
} from '../../engine/estimate';
import { MEAL_SLOTS } from '../../engine/menu';
import { getUrlParam } from '../../app/urlParams';
import { usageMonth } from '../../lib/claude';
import type { TaskResult } from '../../lib/claudeTasks';
import { fmtKcal, fmtNumber, MEAL_SLOT_LABEL } from '../../lib/format';
import { prepareImage } from '../../lib/image';
import { useApp, useUi } from '../../state/store';
import { Button, Card, Chip, Field, NumberTicker, Select, Sheet, Spinner, TextInput } from '../../ui';
import { markEatenMeal, saveDishFromMeal } from './actions';
import { DishesSheet } from './DishesSheet';
import { FAKE_DELAY_MS, fakeReading } from './fakeReading';
import { ItemsEditor, type EditorItem } from './ItemsEditor';
import { countsAsText, failureView, kcalText, markLabel, MEAL_LOG_TEXT, type FailureView } from './logic';
import { chatPhoto, clearPhoto, peekPhoto, type PendingPhoto } from './photoInbox';
import { PhotoPickButton } from './PhotoPick';
import { KcalCheckLine, Macros, Photo, PlannedRow } from './parts';
import { useMealContext } from './useMealContext';
import type { PhotoReading } from '../../engine/estimate';

export interface MealLogSheetProps {
  date: ISODate;
  slot: MealSlot;
  mode: 'foto' | 'piatti';
  chatMessageId?: string;
  onClose: () => void;
}

export default function MealLogSheet(props: MealLogSheetProps) {
  if (props.mode === 'piatti') return <DishesSheet date={props.date} slot={props.slot} onClose={props.onClose} />;
  return <PhotoSheet {...props} />;
}

type Phase = 'nokey' | 'offline' | 'nophoto' | 'badfile' | 'reading' | 'error' | 'notfood' | 'unreadable' | 'draft' | 'done';

const OIL_LABEL: Record<OilChoice, string> = { niente: 'Niente', filo: 'Un filo', cucchiaio: 'Un cucchiaio', 'due-cucchiai': 'Due cucchiai' };
const OIL_WORDS: Record<OilChoice, string> = { niente: 'niente', filo: 'un filo', cucchiaio: 'un cucchiaio', 'due-cucchiai': 'due cucchiai' };

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

type Source = (PendingPhoto & { inboxId?: number }) | null;

function PhotoSheet({ date, slot: initialSlot, chatMessageId, onClose }: MealLogSheetProps) {
  const settings = useApp((s) => s.settings);
  const dishesCount = useApp((s) => s.dishes?.length ?? 0);
  const origin = chatMessageId ? 'chat' : 'oggi';
  const fake = getUrlParam('coach') === 'finto';
  const [slot, setSlot] = useState<MealSlot>(initialSlot);
  const ctx = useMealContext(date, slot);

  // La foto: dal messaggio della chat (1.024 px se è ancora in memoria, altrimenti la copia da 720 px) o dal selettore.
  const [source, setSource] = useState<Source>(() => {
    if (chatMessageId) {
      const dataUrl = chatPhoto(chatMessageId) ?? useApp.getState().chat.find((m) => m.id === chatMessageId)?.image;
      return dataUrl ? { kind: 'dataUrl', dataUrl } : null;
    }
    const p = peekPhoto();
    return p ? { ...p.photo, inboxId: p.id } : null;
  });
  const [phase, setPhase] = useState<Phase>(() => {
    if (!fake && !photoReadable(settings)) return 'nokey';
    if (!fake && isOffline()) return 'offline';
    if (!source && !fake) return 'nophoto';
    return 'reading';
  });

  const [preview, setPreview] = useState<string | null>(null);
  const sendRef = useRef<string | null>(null);
  const storeRef = useRef<string | null>(null);
  const [failure, setFailure] = useState<FailureView | null>(null);
  const retriedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const coachSaidYes = useRef(false);

  const [draft, setDraft] = useState<EstimateDraft | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [savedKcal, setSavedKcal] = useState(0);
  const savedMealRef = useRef<ReturnType<typeof draftMeal> | null>(null);
  const [dishName, setDishName] = useState('');
  const [saving, setSaving] = useState(false);
  const oilRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
      clearPhoto(source?.inboxId);
    };
    // La casella si svuota alla chiusura, con la foto con cui il foglio si è aperto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = (res: TaskResult<PhotoReading>) => {
    if (!mounted.current) return;
    if (res.usage) useApp.getState().recordCoachUsage(usageMonth(currentDate()), res.usage);
    if (!res.ok) {
      const view = failureView(res, retriedRef.current);
      if (!view) return;
      if (view.offline) return setPhase('offline');
      setFailure(view);
      return setPhase('error');
    }
    if (res.value.outcome === 'non-cibo') return setPhase('notfood');
    if (res.value.outcome === 'illeggibile') return setPhase('unreadable');
    coachSaidYes.current = res.value.matchesPlanned === 'si';
    setDraft(resolveEstimate(res.value, { origin, slot, planned: ctx.planned }));
    setPhase('draft');
  };

  const read = async () => {
    setPhase('reading');
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    if (fake) {
      await new Promise((r) => window.setTimeout(r, FAKE_DELAY_MS));
      if (ctrl.signal.aborted) return;
      return finish({ ok: true, value: fakeReading(), warnings: [], model: null, fallback: false, usage: { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } });
    }
    const s = useApp.getState();
    const res = await readPhoto({
      apiKey: s.settings.coachApiKey ?? '',
      model: s.settings.coachModel,
      image: sendRef.current ?? '',
      context: { slot, dayType: ctx.dayType, planned: ctx.planned, carbScale: ctx.carbScale },
      signal: ctrl.signal,
    });
    if (ctrl.signal.aborted) return;
    finish(res);
  };

  const prepare = async (src: NonNullable<Source>): Promise<boolean> => {
    if (src.kind === 'dataUrl') {
      sendRef.current = src.dataUrl;
      storeRef.current = src.dataUrl;
      setPreview(src.dataUrl);
      return true;
    }
    try {
      const img = await prepareImage(src.file);
      if (!mounted.current) return false;
      sendRef.current = img.send;
      storeRef.current = img.store;
      setPreview(img.store);
      return true;
    } catch {
      if (!mounted.current) return false;
      setPhase('badfile');
      return false;
    }
  };

  const start = async (src: Source) => {
    retriedRef.current = false;
    if (src && !(await prepare(src))) return;
    void read();
  };

  useEffect(() => {
    if (phase === 'reading') void start(source);
    // Solo all'apertura: dopo, lettura e «Riprova» partono dai tocchi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retake = (file: File) => {
    const src: Source = { kind: 'file', file };
    setSource(src);
    setDraft(null);
    setFailure(null);
    setPhase('reading');
    if (isOffline() && !fake) return setPhase('offline');
    void start(src);
  };

  const retry = () => {
    retriedRef.current = true;
    if (isOffline() && !fake) return setPhase('offline');
    void read();
  };

  // Un altro pasto scelto dalla chat: «previsto» si ricalcola con la ricetta di quel pasto.
  const lastSlot = useRef(slot);
  useEffect(() => {
    if (lastSlot.current === slot) return;
    lastSlot.current = slot;
    setDraft((d) => {
      if (!d) return d;
      const engine = matchesPlanned(d.items, ctx.planned);
      const asPlanned = Boolean(ctx.planned) && (origin === 'oggi' ? coachSaidYes.current || engine : coachSaidYes.current && engine);
      return { ...d, engineMatch: engine, asPlanned };
    });
  }, [slot, ctx.planned, origin]);

  const values = useMemo(() => (draft ? draftValues(draft) : null), [draft]);

  const confirm = () => {
    if (!draft) return;
    const meal = draftMeal(draft);
    markEatenMeal(date, slot, meal, {
      onUndo: () => {
        if (mounted.current) setPhase('draft');
      },
    });
    savedMealRef.current = meal;
    setSavedKcal(meal.nutrients.kcal);
    setDishName(meal.label);
    setPhase('done');
  };

  const saveDish = async () => {
    const meal = savedMealRef.current;
    if (!meal) return onClose();
    if (!dishName.trim()) {
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    await saveDishFromMeal(slot, meal, dishName, storeRef.current);
    if (mounted.current) onClose();
  };

  const scrollTo = (el: HTMLElement | null | undefined) => {
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const focusable = el?.querySelector<HTMLElement>('button, input');
    window.setTimeout(() => focusable?.focus({ preventScroll: true }), 300);
  };

  const close = () => {
    abortRef.current?.abort();
    onClose();
  };

  // ───────────── Piede ─────────────
  let footer: ReactNode = (
    <Button variant="secondary" fullWidth size="lg" onClick={close}>
      Chiudi
    </Button>
  );
  if (phase === 'reading') {
    footer = (
      <Button variant="secondary" fullWidth size="lg" onClick={close}>
        Annulla
      </Button>
    );
  } else if (phase === 'offline') {
    footer = (
      <div className="flex flex-col gap-2.5">
        {dishesCount > 0 && (
          <Button fullWidth size="lg" icon={Utensils} onClick={() => useUi.getState().open({ type: 'mealLog', date, slot, mode: 'piatti' })}>
            I miei piatti
          </Button>
        )}
        <Button variant={dishesCount > 0 ? 'secondary' : 'primary'} fullWidth size="lg" icon={Store} onClick={() => useUi.getState().open({ type: 'barPlanB', slot })}>
          Piano B al bar
        </Button>
        <Button variant="secondary" fullWidth size="lg" onClick={close}>
          Chiudi
        </Button>
      </div>
    );
  } else if (phase === 'error' && failure?.retry) {
    footer = (
      <div className="flex flex-col gap-2.5">
        <Button fullWidth size="lg" onClick={retry}>
          Riprova
        </Button>
        <Button variant="secondary" fullWidth size="lg" onClick={close}>
          Chiudi
        </Button>
      </div>
    );
  } else if (phase === 'notfood' || phase === 'unreadable' || phase === 'nophoto' || phase === 'badfile') {
    footer = (
      <div className="flex flex-col gap-2.5">
        <PhotoPickButton icon={Camera} onPick={retake}>
          {phase === 'nophoto' || phase === 'badfile' ? 'Scegli la foto' : 'Scatta di nuovo'}
        </PhotoPickButton>
        <Button variant="secondary" fullWidth size="lg" onClick={close}>
          Chiudi
        </Button>
      </div>
    );
  } else if (phase === 'draft' && draft && values) {
    const check = kcalCheck(values.nutrients.kcal);
    let primary: { label: string; run: () => void };
    if (!draft.items.length) primary = { label: 'Aggiungi un alimento', run: () => setSearchOpen(true) };
    else if (values.unresolved > 0) primary = { label: 'Completa gli alimenti', run: () => scrollTo(itemsRef.current?.querySelector<HTMLElement>('[data-unresolved]')) };
    else if (draft.oil === null) primary = { label: 'Scegli l’olio', run: () => scrollTo(oilRef.current) };
    else if (check === 'oltre') primary = { label: 'Controlla i grammi', run: () => scrollTo(itemsRef.current) };
    else primary = { label: markLabel(slot), run: confirm };
    footer = (
      <Button fullWidth size="lg" icon={primary.run === confirm ? Check : undefined} onClick={primary.run} haptic={primary.run === confirm ? false : 'light'}>
        {primary.label}
      </Button>
    );
  } else if (phase === 'done') {
    footer = (
      <div className="flex flex-col gap-2.5">
        <Button fullWidth size="lg" loading={saving} onClick={() => void saveDish()}>
          {dishName.trim() ? 'Salva' : 'Scrivi il nome'}
        </Button>
        <Button variant="secondary" fullWidth size="lg" onClick={onClose}>
          No, grazie
        </Button>
      </div>
    );
  }

  const title = phase === 'done' ? `Segnato: ${fmtKcal(roundKcal10(savedKcal))}` : MEAL_SLOT_LABEL[slot];
  const subtitle = phase === 'done' ? undefined : origin === 'chat' ? 'Dalla foto della chat' : 'Dalla foto';

  return (
    <Sheet open onClose={close} size="large" title={title} subtitle={subtitle} footer={footer}>
      <div className="flex flex-col gap-5 pb-2">
        {phase === 'nokey' && <Message text={MEAL_LOG_TEXT.noKey} />}
        {phase === 'offline' && <Message text={MEAL_LOG_TEXT.offline} />}
        {phase === 'nophoto' && <Message text={MEAL_LOG_TEXT.noPhoto} />}
        {phase === 'badfile' && <Message text={MEAL_LOG_TEXT.badFile} />}
        {phase === 'reading' && (
          <div className="flex flex-col items-center gap-4 py-6" role="status" aria-live="polite">
            <Photo src={preview} size={160} />
            <div className="flex items-center gap-2.5">
              <Spinner size={18} />
              <p className="t-callout text-ink-2">{MEAL_LOG_TEXT.reading}</p>
            </div>
          </div>
        )}
        {phase === 'error' && failure && <Message text={failure.text} photo={preview} />}
        {phase === 'notfood' && <Message text={MEAL_LOG_TEXT.notFood} photo={preview} />}
        {phase === 'unreadable' && <Message text={MEAL_LOG_TEXT.unreadable} photo={preview} />}

        {phase === 'draft' && draft && values && (
          <>
            {origin === 'chat' && (
              <Field label="Pasto">
                <Select value={slot} onChange={(v) => setSlot(v as MealSlot)} options={MEAL_SLOTS.map((s) => ({ value: s, label: MEAL_SLOT_LABEL[s] }))} />
              </Field>
            )}
            {ctx.previous && (
              <p className="t-footnote px-1 text-ink-2">Sostituisce la stima di prima: {fmtKcal(roundKcal10(ctx.previous.nutrients.kcal))}</p>
            )}
            <Totals preview={preview} values={values} />
            <div ref={itemsRef}>
              <ItemsEditor
                items={draft.items}
                onChange={(items: EditorItem[]) => setDraft({ ...draft, items: items.map((i) => ({ ...i, confidence: i.confidence ?? 'alta' })) })}
                max={DRAFT_ITEMS_MAX}
                searchOpen={searchOpen}
                onSearchOpenChange={setSearchOpen}
              />
            </div>
            <section ref={oilRef} className="flex flex-col gap-2" aria-labelledby="olio-titolo">
              <h3 id="olio-titolo" className="t-label px-1 text-ink-3">
                Olio e condimenti
              </h3>
              <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="olio-titolo">
                {OIL_CHOICES.map((c) => (
                  <Chip key={c} selected={draft.oil === c} onChange={() => setDraft({ ...draft, oil: c })} className="w-full justify-center">
                    {OIL_LABEL[c]}
                  </Chip>
                ))}
              </div>
              {draft.oilSuggested && <p className="t-footnote px-1 text-ink-2">Il coach dice: {OIL_WORDS[draft.oilSuggested]}</p>}
              {values.friedOilG > 0 && <p className="t-footnote px-1 text-ink-2">Fritto: più {fmtNumber(values.friedOilG)}{' '}g di olio assorbito</p>}
            </section>
            <PlannedRow
              text={countsAsText(slot, draft.asPlanned)}
              canChange={Boolean(ctx.planned)}
              onChange={() => setDraft({ ...draft, asPlanned: !draft.asPlanned })}
            />
            <KcalCheckLine kcal={values.nutrients.kcal} />
          </>
        )}

        {phase === 'done' && (
          <div className="flex flex-col gap-4">
            <p className="t-callout px-1 text-ink-2">Lo ritrovi tra i tuoi piatti e lo segni anche senza rete.</p>
            <Field label="Salva tra i miei piatti">
              <TextInput ref={nameRef} value={dishName} onChange={(v) => setDishName(v.slice(0, 40))} maxLength={40} enterKeyHint="done" autoComplete="off" />
            </Field>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Message({ text, photo }: { text: string; photo?: string | null }) {
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      {photo !== undefined && <Photo src={photo} size={120} />}
      <p className="t-callout max-w-[30ch] text-ink-2">{text}</p>
    </div>
  );
}

function Totals({ preview, values }: { preview: string | null; values: ReturnType<typeof draftValues> }) {
  const n = values.nutrients;
  return (
    <Card padding="lg" aria-label={`Totali: ${kcalText(values)}`}>
      <div className="flex items-center gap-4">
        {preview && <img src={preview} alt="" className="size-16 shrink-0 rounded-[14px] object-cover" />}
        <div className="flex min-w-0 flex-col">
          {values.range && <span className="t-footnote text-ink-2">circa</span>}
          <div className="flex items-baseline gap-1.5">
            <NumberTicker value={values.kcalShown} format={(x) => fmtNumber(Math.round(x))} className="t-num text-[2.75rem] leading-none text-ink" />
            <span className="t-unit text-ink-2">kcal</span>
          </div>
          {values.range && (
            <span className="t-footnote tabular text-ink-2">
              ({fmtNumber(values.range.low)}-{fmtNumber(values.range.high)})
            </span>
          )}
        </div>
      </div>
      <Macros nutrients={n} />
    </Card>
  );
}
