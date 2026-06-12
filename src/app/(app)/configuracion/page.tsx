'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toIsoDate } from '@/lib/domain/rest-days';
import { getActiveAgreement, type FeeType } from '@/lib/domain/settlement';

const WEEKDAYS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
] as const;

const DEFAULT_CATEGORIES = [
  { name: 'Gasolina', default_boss_share: 0 },
  { name: 'Lavado', default_boss_share: 0 },
  { name: 'Otros', default_boss_share: 0 },
];

export default function ConfiguracionPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [feeType, setFeeType] = useState<FeeType>('fixed');
  const [feeValue, setFeeValue] = useState('100');
  const [weekdayRest, setWeekdayRest] = useState(1);
  const [parity, setParity] = useState<'even' | 'odd'>('even');
  const [validFrom, setValidFrom] = useState(() => toIsoDate(new Date()));

  const [hasExisting, setHasExisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const current = await getActiveAgreement(supabase, toIsoDate(new Date()));
      if (current) {
        setHasExisting(true);
        setFeeType(current.fee_type);
        setFeeValue(String(current.fee_value));
        setWeekdayRest(current.weekday_rest);
        setParity(current.weekend_work_parity);
      }
    })();
  }, [supabase]);

  async function handleSave() {
    setSaving(true);
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user!.id;

    // Versionado: cerrar el acuerdo vigente el día anterior al nuevo valid_from.
    if (hasExisting) {
      const dayBefore = new Date(validFrom);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const { error: closeError } = await supabase
        .from('agreement_configs')
        .update({ valid_to: toIsoDate(dayBefore) })
        .is('valid_to', null);

      if (closeError) {
        setError('No se pudo cerrar el acuerdo anterior.');
        setSaving(false);
        return;
      }
    }

    const { error: insertError } = await supabase.from('agreement_configs').insert({
      user_id: userId,
      fee_type: feeType,
      fee_value: Number(feeValue),
      weekday_rest: weekdayRest,
      weekend_work_parity: parity,
      valid_from: validFrom,
    });

    if (insertError) {
      setError('No se pudo guardar el acuerdo. Revisa los valores.');
      setSaving(false);
      return;
    }

    // Primera configuración: sembrar categorías de gasto básicas.
    if (!hasExisting) {
      await supabase
        .from('expense_categories')
        .upsert(
          DEFAULT_CATEGORIES.map((c) => ({ ...c, user_id: userId })),
          { onConflict: 'user_id,name', ignoreDuplicates: true },
        );
    }

    router.replace('/registro');
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="rise-in font-[family-name:var(--font-display)] text-2xl font-bold">
        Acuerdo con el jefe
      </h1>
      {hasExisting && (
        <p className="rise-in text-sm text-muted">
          Si cambias algo, el acuerdo anterior se conserva: los días pasados se
          siguen calculando con las condiciones que tenían entonces.
        </p>
      )}

      {/* ---------- Tipo de cuota ---------- */}
      <section className="card rise-in-2 flex flex-col gap-4 p-5">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['fixed', 'Fijo por día'],
              ['percentage', 'Porcentaje'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFeeType(value)}
              className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                feeType === value
                  ? 'border-amber bg-amber-soft text-amber'
                  : 'border-line text-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">
            {feeType === 'fixed'
              ? 'Euros por día trabajado'
              : '% del bruto diario para el jefe'}
          </span>
          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={feeValue}
              onChange={(e) => setFeeValue(e.target.value)}
              className="amount-input w-full px-4 py-4 pr-12 text-2xl"
            />
            <span className="taximeter absolute right-4 top-1/2 -translate-y-1/2 text-xl">
              {feeType === 'fixed' ? '€' : '%'}
            </span>
          </div>
        </label>
      </section>

      {/* ---------- Descansos ---------- */}
      <section className="card rise-in-3 flex flex-col gap-4 p-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Día fijo de descanso (lun–vie)</span>
          <select
            value={weekdayRest}
            onChange={(e) => setWeekdayRest(Number(e.target.value))}
            className="amount-input px-4 py-3 text-base"
          >
            {WEEKDAYS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Fin de semana: trabajas el día…</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['even', 'Par (2, 4, 16…)'],
                ['odd', 'Impar (1, 3, 15…)'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setParity(value)}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                  parity === value
                    ? 'border-amber bg-amber-soft text-amber'
                    : 'border-line text-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">
            Se mira el número del día del mes. Si sábado y domingo caen 31 y 1,
            quien trabaja el par descansa ambos, y quien trabaja el impar trabaja
            ambos.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Este acuerdo aplica desde</span>
          <input
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            className="amount-input px-4 py-3 text-base"
          />
        </label>
      </section>

      {error && <p className="text-center text-sm text-bad">{error}</p>}

      <button onClick={handleSave} disabled={saving} className="btn-amber py-4 text-lg">
        {saving ? 'Guardando…' : 'Guardar acuerdo'}
      </button>
    </div>
  );
}
