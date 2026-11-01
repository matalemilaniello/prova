import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CalendarCheck } from 'lucide-react';
import { WEEKDAY_INITIAL, fmtDateShort, fmtPercent, plural } from '../../../lib/format';
import type { Weekday } from '../../../domain/types';
import type { CalendarDay, CalendarSummary } from '../series';
import { monthShort } from './axis';
import { BigValue, ChartCard, LegendItem } from './ChartCard';
import { labelStyle, useGeometry } from './frame';
import { haptic } from '../../../lib/haptics';

const GOOD = 'var(--good)';
const LABEL_W = 16;
const ROW_LABEL_W = 48;
const MONTH_H = 16;
const GAP = 4;

function fillFor(d: CalendarDay): { fill: string; stroke?: string; dash?: string } {
  // Salvata da un jolly: il suo colore, con un bordo ambra tratteggiato.
  if (d.jolly) return { ...fillFor({ ...d, jolly: false }), stroke: 'var(--accent)', dash: '2.5 2' };
  switch (d.kind) {
    case 'riuscita':
      return d.minimal
        ? { fill: `color-mix(in srgb, ${GOOD} 55%, transparent)`, stroke: GOOD }
        : { fill: `color-mix(in srgb, ${GOOD} ${Math.round(78 + 22 * Math.min(1, (d.score - 0.7) / 0.3))}%, transparent)` };
    case 'parziale':
      return { fill: `color-mix(in srgb, ${GOOD} ${Math.round(14 + 26 * Math.min(1, d.score / 0.7))}%, transparent)` };
    case 'vuota':
      return { fill: 'var(--ink-soft)' };
    case 'fuori':
      return { fill: 'transparent', stroke: 'var(--line)', dash: '2 2.5' };
    case 'futuro':
      return { fill: 'transparent', stroke: 'var(--line)' };
  }
}

const KIND_TEXT: Record<CalendarDay['kind'], string> = {
  riuscita: 'riuscita',
  parziale: 'non riuscita',
  vuota: 'non segnata',
  fuori: 'prima di Ritmo',
  futuro: 'da vivere',
};

/** Il giorno letto, in breve per l'intestazione: "riuscita, 85%", "minima riuscita", "salvata dal jolly". */
function dayCaption(d: CalendarDay): string {
  if (d.jolly) return 'salvata dal jolly';
  if (d.minimal && d.kind === 'riuscita') return 'minima riuscita';
  if (d.kind === 'riuscita' || d.kind === 'parziale') return `${KIND_TEXT[d.kind]}, ${fmtPercent(d.score)}`;
  return KIND_TEXT[d.kind];
}

export function SuccessHeatmap({ days, summary, weeks = 12 }: { days: CalendarDay[]; summary: CalendarSummary; weeks?: number }) {
  const reduce = useReducedMotion();
  const nWeeks = Math.max(1, Math.ceil(days.length / 7));
  // Poche settimane (le prime con Ritmo): un calendario, una riga per settimana; tante: colonne come una mappa.
  const asRows = nWeeks <= 5;
  // Altezza provvisoria: la geometria serve solo per la larghezza.
  const { ref, geo } = useGeometry(10, { top: 0, right: 0, bottom: 0, left: 0 });
  const labelW = asRows ? ROW_LABEL_W : LABEL_W;
  const cols = asRows ? 7 : nWeeks;
  const rowsN = asRows ? nWeeks : 7;
  const cell = asRows
    ? Math.max(18, Math.min(34, Math.floor((geo.width - labelW - GAP * 6 - 8) / 7)))
    : Math.max(10, Math.min(24, Math.floor((geo.width - LABEL_W - GAP * (cols - 1)) / cols)));
  const gridW = labelW + cols * cell + (cols - 1) * GAP;
  const offsetX = Math.max(0, Math.floor((geo.width - gridW) / 2));
  const height = MONTH_H + rowsN * cell + (rowsN - 1) * GAP;

  const cellX = useCallback((c: number) => offsetX + labelW + c * (cell + GAP), [offsetX, labelW, cell]);
  const cellY = (r: number) => MONTH_H + r * (cell + GAP);
  /** Colonna e riga del giorno i (settimane in colonna o in riga). */
  const pos = (i: number) => (asRows ? { c: i % 7, r: Math.floor(i / 7) } : { c: Math.floor(i / 7), r: i % 7 });
  const [selIdx, setSelIdx] = useState<number | null>(null);
  const select = (i: number | null) => {
    if (i !== null && i !== selIdx) haptic('selection');
    setSelIdx(i);
  };
  const lastPast = (() => {
    for (let i = days.length - 1; i >= 0; i--) if (days[i].kind !== 'futuro') return i;
    return days.length - 1;
  })();
  const onKeyDown = (e: KeyboardEvent) => {
    const cur = selIdx ?? lastPast;
    const moves: Record<string, number> = asRows ? { ArrowUp: -7, ArrowDown: 7, ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };
    if (e.key === 'Escape') return select(null);
    if (!(e.key in moves)) return;
    e.preventDefault();
    const next = selIdx === null ? lastPast : cur + moves[e.key];
    if (next >= 0 && next < days.length) select(next);
  };

  const months = useMemo(() => {
    const out: { x: number; label: string }[] = [];
    if (asRows) return out;
    let prevMonth = -1;
    for (let c = 0; c < cols; c++) {
      const d = days[c * 7];
      if (!d) continue;
      const m = Number(d.date.slice(5, 7));
      if (m !== prevMonth) {
        // La prima colonna di un mese: se il mese inizia a metà settimana, l'etichetta va sulla colonna dopo.
        const firstOfMonthInCol = days.slice(c * 7, c * 7 + 7).some((x) => x.date.endsWith('-01'));
        const col = c === 0 || !firstOfMonthInCol || days[c * 7].date.endsWith('-01') ? c : c + 1;
        if (col < cols && (out.length === 0 || cellX(col) - out[out.length - 1].x > 30)) out.push({ x: cellX(col), label: monthShort(days[col * 7].date) });
        prevMonth = m;
      }
    }
    return out;
  }, [days, cols, cellX, asRows]);

  const sel = selIdx !== null ? days[selIdx] : null;
  const rate = summary.counted ? summary.successful / summary.counted : 0;

  const span = weeks >= 12 ? 'Ultime 12 settimane' : weeks === 1 ? 'Questa settimana' : `Le prime ${weeks} settimane`;
  const label = `Calendario delle giornate riuscite, ${span.toLowerCase()}: ${summary.successful} su ${summary.counted}, ${fmtPercent(rate)}. Serie attuale ${plural(summary.streak, 'giorno', 'giorni')}, la più lunga ${plural(summary.best, 'giorno', 'giorni')}.`;

  return (
    <ChartCard
      title="Giornate riuscite"
      subtitle={span}
      value={<BigValue value={String(summary.successful)} unit={`su ${summary.counted}`} />}
      caption={
        sel ? (
          <span>
            {fmtDateShort(sel.date)} <span className="text-ink-3">· {dayCaption(sel)}</span>
          </span>
        ) : (
          <span className="tabular">
            Serie {summary.streak} <span className="text-ink-3">· record {summary.best}</span>
          </span>
        )
      }
      empty={
        summary.counted === 0
          ? { icon: CalendarCheck, title: 'Il calendario parte da oggi', text: 'Ogni giornata con almeno il 70% delle voci fatte diventa un quadrato pieno.' }
          : null
      }
      legendBehind
      legend={
        <>
          <LegendItem color={GOOD} kind="square">
            Riuscita
          </LegendItem>
          <LegendItem color={`color-mix(in srgb, ${GOOD} 30%, transparent)`} kind="square">
            Parziale
          </LegendItem>
          <LegendItem color={GOOD} kind="ring">
            Giornata minima
          </LegendItem>
          <LegendItem color="var(--ink-soft)" kind="square">
            Non segnata
          </LegendItem>
          {days.some((d) => d.jolly) && (
            <LegendItem color="var(--accent)" kind="ring">
              Salvata dal jolly
            </LegendItem>
          )}
        </>
      }
      footnote="Una giornata è riuscita con almeno il 70% delle voci fatte (sostituite contano metà), oppure con le 4 voci della giornata minima. Con 5 giornate riuscite in una settimana arriva un jolly, che salva la serie alla prossima giornata storta. Tocca un giorno per leggerlo."

    >
      <div ref={ref}>
        <svg
          width={geo.width}
          height={height}
          viewBox={`0 0 ${geo.width} ${height}`}
          role="img"
          aria-label={label}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onBlur={() => setSelIdx(null)}
          className="block rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          style={{ touchAction: 'pan-y', WebkitTapHighlightColor: 'transparent' }}
        >
          <g aria-hidden>
            {months.map((m) => (
              <text key={`${m.x}-${m.label}`} x={m.x} y={10} style={labelStyle()}>
                {m.label}
              </text>
            ))}
            {asRows
              ? ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((c) => (
                  <text key={c} x={cellX(c) + cell / 2} y={10} textAnchor="middle" style={labelStyle({ fontSize: 10 })}>
                    {WEEKDAY_INITIAL[c]}
                  </text>
                ))
              : ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((r) => (
                  <text key={r} x={offsetX} y={cellY(r) + cell / 2} dy="0.34em" style={labelStyle({ fontSize: 9.5 })}>
                    {r % 2 === 0 || r === 6 ? WEEKDAY_INITIAL[r] : ''}
                  </text>
                ))}
            {asRows &&
              Array.from({ length: nWeeks }, (_, r) => (
                <text key={`w${r}`} x={offsetX} y={cellY(r) + cell / 2} dy="0.34em" style={labelStyle({ fontSize: 10 })}>
                  {fmtDateShort(days[r * 7].date)}
                </text>
              ))}
          </g>
          <g aria-hidden>
            {days.map((d, i) => {
              const { c, r } = pos(i);
              const f = fillFor(d);
              const x = cellX(c);
              const yy = cellY(r);
              const active = selIdx === i;
              if (d.kind === 'fuori' && !active) {
                return <circle key={d.date} cx={x + cell / 2} cy={yy + cell / 2} r={1.6} style={{ fill: 'var(--ink-3)', opacity: 0.45 }} />;
              }
              return (
                <motion.rect
                  key={d.date}
                  x={x + 0.5}
                  y={yy + 0.5}
                  width={cell - 1}
                  height={cell - 1}
                  rx={Math.max(3, cell * 0.24)}
                  style={{
                    fill: f.fill,
                    stroke: active ? 'var(--ink)' : f.stroke ?? 'none',
                    strokeWidth: active ? 2 : f.stroke ? 1.25 : 0,
                    strokeDasharray: active ? undefined : f.dash,
                  }}
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25, delay: Math.min(0.6, c * 0.035) }}
                />
              );
            })}
            {days.map((d, i) =>
              d.today ? (
                <rect
                  key="oggi"
                  x={cellX(pos(i).c) - 2}
                  y={cellY(pos(i).r) - 2}
                  width={cell + 4}
                  height={cell + 4}
                  rx={Math.max(5, cell * 0.3)}
                  style={{ fill: 'none', stroke: 'var(--accent)', strokeWidth: 2 }}
                />
              ) : null,
            )}
          </g>
          <rect
            x={0}
            y={0}
            width={geo.width}
            height={height}
            fill="transparent"
            onClick={(e) => {
              const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
              const c = Math.floor((e.clientX - rect.left - offsetX - labelW + GAP / 2) / (cell + GAP));
              const r = Math.floor((e.clientY - rect.top - MONTH_H + GAP / 2) / (cell + GAP));
              if (c < 0 || c >= cols || r < 0 || r >= rowsN) return select(null);
              const idx = asRows ? r * 7 + c : c * 7 + r;
              if (idx >= days.length) return select(null);
              select(idx === selIdx ? null : idx);
            }}
          />
        </svg>
      </div>
    </ChartCard>
  );
}
