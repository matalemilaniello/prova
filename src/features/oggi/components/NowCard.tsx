import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChefHat, ClipboardList, Ellipsis, MoonStar, Play, Timer } from 'lucide-react';
import type { DayType, HHMM, TimelineItem } from '../../../domain/types';
import { RECIPES } from '../../../data/recipes';
import { SESSIONS } from '../../../data/sessions';
import { recipeNutrition } from '../../../engine/nutrition';
import type { AdherenceSummary, NowPick } from '../../../engine/timeline';
import { fmtKcal, fmtMinutes } from '../../../lib/format';
import { Button, Card, IconButton, cn, spring, toneColor, toneInk, toneSoft, type AnyTone } from '../../../ui';
import { itemIcon, itemTone } from '../kinds';

export interface NowCardProps {
  pick: NowPick | null;
  dayType: DayType;
  summary: AdherenceSummary;
  curfew: HHMM;
  bed: HHMM;
  /** Minuti al coprifuoco (negativo se passato). */
  curfewIn: number;
  onMark: (item: TimelineItem) => void;
  onOpen: (item: TimelineItem) => void;
  onOptions: (item: TimelineItem) => void;
}

/** Righe del campo: cerchio di centrocampo e linea di metà campo, appena accennati. */
function PitchLines({ tone }: { tone: AnyTone }) {
  const c = `color-mix(in srgb, ${toneColor(tone)} 15%, transparent)`;
  return (
    <svg aria-hidden className="pointer-events-none absolute -right-[72px] -top-[104px]" width="230" height="230" viewBox="0 0 230 230" fill="none">
      <circle cx="115" cy="115" r="78" stroke={c} strokeWidth="1.5" />
    </svg>
  );
}

function stateLabel(pick: NowPick): string {
  const d = pick.deltaMin;
  if (pick.item.kind === 'minima' && pick.state === 'adesso') return 'Da fare oggi';
  if (pick.state === 'adesso') return d < -2 ? `Adesso · da ${fmtMinutes(-d)}` : 'Adesso';
  if (pick.state === 'prossima') return d <= 240 ? `Prossima · tra ${fmtMinutes(d)}` : 'Prossima';
  return 'Da segnare';
}

interface Content {
  kicker: string;
  headline: string;
  sub?: string;
  meta: string[];
}

function contentFor(item: TimelineItem, dayType: DayType, curfewIn: number, bed: HHMM): Content {
  switch (item.kind) {
    case 'pasto': {
      const recipe = item.ref ? RECIPES[item.ref] : undefined;
      if (!recipe) return { kicker: item.title, headline: item.detail ?? item.title, meta: [] };
      const n = recipeNutrition(recipe, dayType);
      return {
        kicker: item.title,
        headline: recipe.name,
        meta: [fmtKcal(n.kcal), `${Math.round(n.proteinG)} g proteine`, fmtMinutes(recipe.prepMin)],
      };
    }
    case 'palestra': {
      const s = SESSIONS[item.ref ?? ''];
      return {
        kicker: item.title,
        headline: s?.subtitle ?? item.title,
        sub: s?.focus,
        meta: [s ? fmtMinutes(s.estMin) : '', item.detail?.startsWith('Facoltativa') ? 'Facoltativa' : ''].filter(Boolean),
      };
    }
    case 'calcio':
      return { kicker: 'Calcio', headline: item.title, meta: (item.detail ?? '').split(', ').filter(Boolean) };
    case 'controllo':
      return { kicker: 'Mattino', headline: item.title, meta: ['Meno di 30 secondi'] };
    case 'coprifuoco':
      return {
        kicker: 'Sera',
        headline: 'Telefono fuori dalla camera',
        meta: [curfewIn > 0 ? `Tra ${fmtMinutes(curfewIn)}` : 'È ora', `A letto alle ${bed}`],
      };
    case 'letto':
      return { kicker: 'Notte', headline: 'A letto', meta: (item.detail ?? '').split(' · ').filter(Boolean) };
    case 'fisio':
      return { kicker: 'Fisioterapista', headline: item.title, meta: (item.detail ?? '').split(' · ').filter(Boolean) };
    case 'integratori':
      return { kicker: item.title, headline: item.detail ?? item.title, meta: ['Con il pasto'] };
    case 'minima':
      return { kicker: 'Giornata minima', headline: item.title, sub: item.detail, meta: [] };
  }
}

/** Card "Adesso": la prossima voce da fare, grande, con l'azione principale a portata di pollice. */
export function NowCard({ pick, dayType, summary, curfew, bed, curfewIn, onMark, onOpen, onOptions }: NowCardProps) {
  if (!pick) return <DoneCard summary={summary} curfew={curfew} bed={bed} curfewIn={curfewIn} />;
  const { item } = pick;
  const tone = itemTone(item);
  const Icon = itemIcon(item);
  const c = contentFor(item, dayType, curfewIn, bed);
  const late = pick.state === 'in-ritardo';
  const allDay = item.kind === 'minima' && item.id !== 'minima:telefono' && pick.state === 'adesso';

  let primary: ReactNode;
  let secondary: ReactNode = null;
  if (item.kind === 'palestra') {
    primary = (
      <Button size="lg" icon={Play} className="min-w-0 flex-1 px-4" onClick={() => onOpen(item)}>
        Inizia
      </Button>
    );
    secondary = (
      <Button size="lg" variant="secondary" icon={Check} className="px-5" onClick={() => onMark(item)} aria-label={`Segna fatto: ${item.title}`}>
        Fatto
      </Button>
    );
  } else if (item.kind === 'calcio') {
    primary = (
      <Button size="lg" icon={Timer} className="flex-1" onClick={() => onOpen(item)}>
        Minuti e RPE
      </Button>
    );
  } else if (item.kind === 'controllo') {
    primary = (
      <Button size="lg" icon={ClipboardList} className="flex-1" onClick={() => onOpen(item)}>
        Compila
      </Button>
    );
  } else {
    primary = (
      <Button size="lg" icon={Check} className="min-w-0 flex-1 px-4" haptic="success" onClick={() => onMark(item)}>
        Fatto
      </Button>
    );
    if (item.kind === 'pasto' && item.ref) {
      secondary = (
        <Button size="lg" variant="secondary" icon={ChefHat} className="px-5" onClick={() => onOpen(item)}>
          Ricetta
        </Button>
      );
    } else if (item.kind === 'fisio') {
      secondary = (
        <Button size="lg" variant="secondary" className="px-5" onClick={() => onOpen(item)}>
          Esercizi
        </Button>
      );
    }
  }

  return (
    <Card variant="highlight" tone={tone} padding="none" as="section" aria-labelledby="oggi-adesso" className="isolate">
      <PitchLines tone={tone} />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={item.id}
          className="relative p-5"
          initial={{ opacity: 0, y: 18, filter: 'blur(3px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -14, filter: 'blur(3px)' }}
          transition={spring}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="oggi-adesso" className="t-label flex items-center gap-2" style={{ color: late ? 'var(--warn-ink)' : toneInk(tone) }}>
              {pick.state === 'adesso' && (
                <span aria-hidden className="relative flex size-2">
                  <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: toneColor(tone) }} />
                  <span className="relative size-2 rounded-full" style={{ background: toneColor(tone) }} />
                </span>
              )}
              {stateLabel(pick)}
            </h2>
            <div className="-mr-1 flex shrink-0 items-center gap-2">
              <span className="t-mono rounded-full px-2.5 py-1 text-[0.8125rem] font-medium text-ink" style={{ background: toneSoft(tone, 14) }}>
                {late ? `era alle ${item.time}` : allDay ? 'in giornata' : item.time}
              </span>
              <IconButton icon={Ellipsis} label={`Altre opzioni: ${item.title}`} size="sm" variant="tinted" onClick={() => onOptions(item)} />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2.5">
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px]" style={{ background: toneSoft(tone, 18), color: toneInk(tone) }}>
              <Icon size={17} strokeWidth={2.3} />
            </span>
            <p className="t-callout min-w-0 truncate font-semibold text-ink-2">{c.kicker}</p>
          </div>
          <p className="t-title mt-2.5 text-[1.875rem] leading-[1.04] text-ink [text-wrap:balance]">{c.headline}</p>
          {c.sub && <p className="t-footnote mt-2 line-clamp-2 text-ink-2">{c.sub}</p>}
          {c.meta.length > 0 && (
            <ul className="mt-3.5 flex flex-wrap gap-1.5" aria-label="Dettagli">
              {c.meta.map((m) => (
                <li key={m} className="t-footnote inline-flex h-7 items-center rounded-full bg-ink-soft px-2.5 font-medium text-ink-2">
                  {m}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 flex items-center gap-2.5">
            {primary}
            {secondary}
          </div>
        </motion.div>
      </AnimatePresence>
    </Card>
  );
}

/** Tutto segnato: chiusura sobria della giornata. */
function DoneCard({ summary, curfew, bed, curfewIn }: { summary: AdherenceSummary; curfew: HHMM; bed: HHMM; curfewIn: number }) {
  const empty = summary.total === 0;
  return (
    <Card variant="highlight" tone="good" padding="lg" as="section" aria-labelledby="oggi-adesso" className="isolate">
      <PitchLines tone="good" />
      <motion.div className="relative" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <h2 id="oggi-adesso" className="t-label text-good-ink">
          {empty ? 'Giornata libera' : 'Giornata completa'}
        </h2>
        <div className="mt-4 flex items-center gap-3.5">
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-good text-[var(--on-good)] shadow-[0_0_24px_-4px_var(--good)]">
            {empty ? <MoonStar size={24} strokeWidth={2.2} /> : <Check size={26} strokeWidth={3} />}
          </span>
          <div className="min-w-0">
            <p className="t-title text-ink">{empty ? 'Niente in programma' : 'Tutto segnato'}</p>
            <p className={cn('t-callout mt-1 text-ink-2')}>
              {curfewIn > 0 ? `Telefono fuori alle ${curfew}, a letto alle ${bed}.` : `A letto alle ${bed}. Domani si riparte.`}
            </p>
          </div>
        </div>
      </motion.div>
    </Card>
  );
}
