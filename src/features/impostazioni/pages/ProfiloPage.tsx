/**
 * Profilo: nome, sesso, anno, altezza, peso di partenza, acqua, competenze. Si salva mentre scrivi. L'obiettivo del corpo
 * si sceglie nella pagina Obiettivi, dove diventa una proposta da approvare (docs/FASE2.md § 2.1): qui resta il collegamento.
 */
import { useState } from 'react';
import { Droplets, Target } from 'lucide-react';
import type { Profile } from '../../../domain/types';
import { currentDate } from '../../../engine/dates';
import { fmtDateShort, fmtKg, fmtNumber } from '../../../lib/format';
import { latestWeight, useApp } from '../../../state/store';
import { Field, ListGroup, ListRow, Segmented, TextInput } from '../../../ui';
import { FormRow, InlineNumber, InlineText, MiniStepper } from '../components/controls';
import { GOAL_LABEL, validateBody } from '../lib';
import { Page, type PageProps } from './Page';

type Body = Pick<Profile, 'birthYear' | 'heightCm' | 'startWeightKg'>;

export default function ProfiloPage({ onBack, open, backLabel }: PageProps) {
  const profile = useApp((s) => s.profile);
  const checkIns = useApp((s) => s.checkIns);
  const update = useApp((s) => s.updateProfile);
  const year = currentDate().getFullYear();

  // Bozza locale dei numeri: si salva solo un valore valido, l'errore compare all'uscita dal campo.
  const [body, setBody] = useState<Partial<Record<keyof Body, number | undefined>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof Body, boolean>>>({});
  const value = (k: keyof Body) => (k in body ? body[k] : profile[k] || undefined);
  const errors = validateBody(
    { birthYear: value('birthYear') ?? 0, heightCm: value('heightCm') ?? 0, startWeightKg: value('startWeightKg') ?? 0 },
    year,
  );
  const setNum = (k: keyof Body, v: number | undefined) => {
    setBody((b) => ({ ...b, [k]: v }));
    const probe = { birthYear: profile.birthYear, heightCm: profile.heightCm, startWeightKg: profile.startWeightKg, [k]: v ?? 0 };
    if (v !== undefined && !validateBody(probe, year)[k]) update({ [k]: v } as Partial<Profile>);
  };
  const err = (k: keyof Body) => (touched[k] ? errors[k] : undefined);
  const blur = (k: keyof Body) => () => setTouched((t) => ({ ...t, [k]: true }));

  // Peso attuale dai controlli del mattino.
  const lastDate = Object.keys(checkIns)
    .filter((d) => (checkIns[d]?.weightKg ?? 0) > 0)
    .sort()
    .pop();
  const current = latestWeight({ checkIns, profile });

  return (
    <Page title="Profilo" subtitle="Restano solo su questo telefono." onBack={onBack} backLabel={backLabel}>
      <ListGroup title="Tu">
        <FormRow label="Nome" htmlFor="pr-nome">
          <InlineText id="pr-nome" value={profile.name ?? ''} onChange={(name) => update({ name: name || undefined })} placeholder="Facoltativo" autoComplete="given-name" maxLength={40} />
        </FormRow>
        <FormRow label="Sesso">
          <div className="w-[164px]">
            <Segmented
              aria-label="Sesso"
              size="sm"
              value={profile.sex}
              onChange={(sex) => update({ sex })}
              options={[
                { value: 'M', label: 'Uomo' },
                { value: 'F', label: 'Donna' },
              ]}
            />
          </div>
        </FormRow>
      </ListGroup>

      <ListGroup
        title="Corpo"
        footer={
          lastDate
            ? `Il peso attuale viene dai controlli del mattino: ${fmtKg(current)} il ${fmtDateShort(lastDate)}.`
            : 'Il peso attuale verrà dai controlli del mattino.'
        }
      >
        <FormRow label="Anno di nascita" htmlFor="pr-anno" error={err('birthYear')} hint={!err('birthYear') && value('birthYear') ? `${year - (value('birthYear') ?? year)} anni` : undefined}>
          <InlineNumber id="pr-anno" value={value('birthYear')} onChange={(v) => setNum('birthYear', v)} onBlur={blur('birthYear')} placeholder="es. 1995" chars={6} invalid={Boolean(err('birthYear'))} />
        </FormRow>
        <FormRow label="Altezza" htmlFor="pr-altezza" error={err('heightCm')}>
          <InlineNumber id="pr-altezza" value={value('heightCm')} onChange={(v) => setNum('heightCm', v)} onBlur={blur('heightCm')} placeholder="es. 178" unit="cm" chars={5} invalid={Boolean(err('heightCm'))} />
        </FormRow>
        <FormRow label="Peso di partenza" htmlFor="pr-peso" error={err('startWeightKg')}>
          <InlineNumber
            id="pr-peso"
            value={value('startWeightKg')}
            onChange={(v) => setNum('startWeightKg', v)}
            onBlur={blur('startWeightKg')}
            placeholder="es. 72,5"
            decimals={1}
            unit="kg"
            chars={5}
            invalid={Boolean(err('startWeightKg'))}
          />
        </FormRow>
      </ListGroup>

      <ListGroup footer="Corpo, allenamento e stagione: ogni cambio diventa una proposta da approvare.">
        <ListRow icon={Target} iconTone="accent" title="Obiettivi" value={GOAL_LABEL[profile.goal]} onPress={() => open('obiettivi')} />
      </ListGroup>

      <ListGroup title="Acqua" footer="Bicchieri da 250 ml nella schermata Oggi.">
        <FormRow icon={Droplets} iconTone="palestra" label="Al giorno">
          <MiniStepper
            label="Litri d’acqua al giorno"
            value={profile.waterTargetL}
            min={1.5}
            max={5}
            step={0.25}
            unit="l"
            format={(n) => fmtNumber(n, 2)}
            onChange={(waterTargetL) => update({ waterTargetL })}
          />
        </FormRow>
      </ListGroup>

      <Field label="Competenze" optional hint="Il coach adatta il tono: niente spiegazioni da principiante.">
        <TextInput value={profile.expertise ?? ''} onChange={(expertise) => update({ expertise: expertise || undefined })} placeholder="Es. allenatore, fisioterapista" maxLength={80} />
      </Field>
    </Page>
  );
}
