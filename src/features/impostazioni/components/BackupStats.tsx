/** Numeri principali di un backup (diario, controlli, sedute, revisioni), per l'esportazione e il ripristino. */
import type { BackupSummary } from '../../../lib/backup';
import { fmtNumber } from '../../../lib/format';

export function StatGrid({ s }: { s: BackupSummary }) {
  const items = [
    { label: 'Giorni di diario', value: s.dayLogs },
    { label: 'Controlli', value: s.checkIns },
    { label: 'Sedute e calcio', value: s.workouts + s.football },
    { label: 'Revisioni', value: s.reviews },
  ];
  return (
    <dl className="grid grid-cols-2 gap-2">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col-reverse gap-0.5 rounded-[14px] bg-card-2 px-3.5 py-3">
          <dt className="t-footnote text-ink-2">{it.label}</dt>
          <dd className="t-num text-[1.75rem] text-ink">{fmtNumber(it.value)}</dd>
        </div>
      ))}
    </dl>
  );
}
