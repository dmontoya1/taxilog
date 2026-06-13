'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toIsoDate } from '@/lib/domain/rest-days';
import {
  DEFAULT_REPORT_PREFS,
  getActiveAgreement,
  getReportPreferences,
  type FeeType,
  type ReportPreferences,
} from '@/lib/domain/settlement';

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

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl bg-bg px-4 py-3">
      <span className="text-sm">
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-[var(--amber)]"
      />
    </label>
  );
}

export default function ConfiguracionPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  // ---------- Acuerdo ----------
  const [feeType, setFeeType] = useState<FeeType>('fixed');
  const [feeValue, setFeeValue] = useState('100');
  const [weekdayRest, setWeekdayRest] = useState(1);
  const [parity, setParity] = useState<'even' | 'odd'>('even');
  const [cardGoesToBoss, setCardGoesToBoss] = useState(true);
  const [validFrom, setValidFrom] = useState(() => toIsoDate(new Date()));

  // ---------- Preferencias de informe ----------
  const [prefs, setPrefs] = useState<ReportPreferences>(DEFAULT_REPORT_PREFS);

  const [hasExisting, setHasExisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [current, savedPrefs] = await Promise.all([
        getActiveAgreement(supabase, toIsoDate(new Date())),
        getReportPreferences(supabase),
      ]);
      if (current) {
        setHasExisting(true);
        setFeeType(current.fee_type);
        setFeeValue(String(current.fee_value));
        setWeekdayRest(current.weekday_rest);
        setParity(current.weekend_work_parity);
        setCardGoesToBoss(current.card_goes_to_boss);
      }
      setPrefs(savedPrefs);
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
      card_goes_to_boss: cardGoesToBoss,
      valid_from: validFrom,
    });

    if (insertError) {
      setError('No se pudo guardar el acuerdo. Revisa los valores.');
      setSaving(false);
      return;
    }

    // Preferencias del informe (1:1 con el usuario)
    const { error: prefsError } = await supabase.from('report_preferences').upsert(
      {
        user_id: userId,
        show_cash: prefs.show_cash,
        show_expenses: prefs.show_expenses,
        show_rest_days: prefs.show_rest_days,
        signature_name: prefs.signature_name?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (prefsError) {
      setError(`No se pudieron guardar las preferencias del informe: ${prefsError.message}`);
      setSaving(false);
      return;
    }

    // Revalidación: leo de la BD lo que acabo de escribir. Si no coincide,
    // algo (RLS, trigger) lo rechazó silenciosamente y no debo redirigir.
    const persisted = await getReportPreferences(supabase);
    if (persisted.show_cash !== prefs.show_cash) {
      setError('Las preferencias no quedaron guardadas en la base de datos. Avísame.');
      setSaving(false);
      return;
    }

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
        Configuración
      </h1>
      {hasExisting && (
        <p className="rise-in text-sm text-muted">
          Si cambias el acuerdo, el anterior se conserva: los días pasados se
          siguen calculando con las condiciones que tenían entonces.
        </p>
      )}

      {/* ---------- Acuerdo con el jefe ---------- */}
      <h2 className="rise-in mt-2 text-xs uppercase tracking-widest text-muted">
        Acuerdo con el jefe
      </h2>

      <section className="card rise-in flex flex-col gap-4 p-5">
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

        <Toggle
          label="El datáfono lo cobra el jefe"
          hint="Si está activo, los cobros con tarjeta se descuentan del balance porque el jefe ya los recibió."
          checked={cardGoesToBoss}
          onChange={setCardGoesToBoss}
        />
      </section>

      {/* ---------- Descansos ---------- */}
      <h2 className="rise-in-2 mt-2 text-xs uppercase tracking-widest text-muted">
        Descansos
      </h2>

      <section className="card rise-in-2 flex flex-col gap-4 p-5">
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

      {/* ---------- Preferencias del informe del jefe ---------- */}
      <h2 className="rise-in-3 mt-2 text-xs uppercase tracking-widest text-muted">
        Informe para el jefe
      </h2>

      <section className="card rise-in-3 flex flex-col gap-3 p-5">
        <Toggle
          label="Mostrar ingresos en efectivo"
          hint="Desactívalo si prefieres que el jefe no vea el efectivo."
          checked={prefs.show_cash}
          onChange={(v) => setPrefs({ ...prefs, show_cash: v })}
        />
        <Toggle
          label="Mostrar gastos a cargo del jefe"
          hint="Solo aplica a gastos con un % asumido por el jefe."
          checked={prefs.show_expenses}
          onChange={(v) => setPrefs({ ...prefs, show_expenses: v })}
        />
        <Toggle
          label="Incluir días de descanso en la tabla"
          hint="Si lo desactivas, solo aparecen los días con trabajo."
          checked={prefs.show_rest_days}
          onChange={(v) => setPrefs({ ...prefs, show_rest_days: v })}
        />

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Nombre que aparecerá en el informe (opcional)</span>
          <input
            type="text"
            value={prefs.signature_name ?? ''}
            onChange={(e) => setPrefs({ ...prefs, signature_name: e.target.value })}
            placeholder="Por defecto: tu nombre de cuenta"
            className="amount-input px-4 py-3 text-base"
          />
        </label>
      </section>

      {error && <p className="text-center text-sm text-bad">{error}</p>}

      <button onClick={handleSave} disabled={saving} className="btn-amber py-4 text-lg">
        {saving ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </div>
  );
}