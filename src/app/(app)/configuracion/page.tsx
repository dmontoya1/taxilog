'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toIsoDate, type VehicleType } from '@/lib/domain/rest-days';
import {
  addEmisora,
  deleteEmisora,
  getEmisoras,
  setEmisoraActive,
  MADRID_EMISORAS,
  type Emisora,
} from '@/lib/domain/emisoras';
import {
  DEFAULT_REPORT_PREFS,
  euro,
  getActiveAgreement,
  getOdometerTotals,
  getReportPreferences,
  km,
  setOdometerTotals,
  formatMinutes,
  type FeeType,
  type OdometerTotals,
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
  const [vehicleType, setVehicleType] = useState<VehicleType>('gasoline');
  const [validFrom, setValidFrom] = useState(() => toIsoDate(new Date()));

  // ---------- Emisoras (gestión inmediata, fuera del versionado del acuerdo) ----------
  const [emisoras, setEmisoras] = useState<Emisora[]>([]);
  const [newEmisora, setNewEmisora] = useState('');
  const [emisoraError, setEmisoraError] = useState<string | null>(null);

  // ---------- Preferencias de informe ----------
  const [prefs, setPrefs] = useState<ReportPreferences>(DEFAULT_REPORT_PREFS);

  // ---------- Acumulado del taxímetro (opcional) ----------
  const ODO_FIELDS = useMemo(
    () =>
      [
        ['total_carreras', 'Carreras totales', '€'],
        ['total_suplementos', 'Suplementos totales', '€'],
        ['dist_total', 'Dist. Total', 'km'],
        ['dist_ocupado', 'Dist. Ocupado', 'km'],
        ['dist_libre', 'Dist. Libre', 'km'],
        ['dist_off', 'Dist. OFF', 'km'],
        ['tiempo_ocupado', 'Tiempo Ocupado', 'min'],
        ['tiempo_on', 'Tiempo ON', 'min'],
        ['num_servicios', 'Nº Servicios', ''],
      ] as Array<[keyof OdometerTotals, string, string]>,
    [],
  );
  const [odo, setOdo] = useState<Record<keyof OdometerTotals, string>>(
    Object.fromEntries(ODO_FIELDS.map(([k]) => [k, ''])) as Record<keyof OdometerTotals, string>,
  );
  const [odoOpen, setOdoOpen] = useState(false);

  const [hasExisting, setHasExisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [current, savedPrefs, totals, emisorasList] = await Promise.all([
        getActiveAgreement(supabase, toIsoDate(new Date())),
        getReportPreferences(supabase),
        getOdometerTotals(supabase),
        getEmisoras(supabase),
      ]);
      if (current) {
        setHasExisting(true);
        setFeeType(current.fee_type);
        setFeeValue(String(current.fee_value));
        setWeekdayRest(current.weekday_rest);
        setParity(current.weekend_work_parity);
        setCardGoesToBoss(current.card_goes_to_boss);
        setVehicleType(current.vehicle_type);
      }
      setEmisoras(emisorasList);
      setPrefs(savedPrefs);
      if (totals) {
        setOdo(
          Object.fromEntries(
            ODO_FIELDS.map(([k]) => [k, totals[k] ? String(totals[k]) : '']),
          ) as Record<keyof OdometerTotals, string>,
        );
        setOdoOpen(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      vehicle_type: vehicleType,
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

    // Acumulado del taxímetro: solo si el usuario abrió la sección y puso algo
    const anyOdo = ODO_FIELDS.some(([k]) => odo[k] !== '');
    if (anyOdo) {
      try {
        await setOdometerTotals(
          supabase,
          userId,
          Object.fromEntries(
            ODO_FIELDS.map(([k]) => [k, Number(odo[k]) || 0]),
          ) as unknown as OdometerTotals,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error guardando el acumulado.');
        setSaving(false);
        return;
      }
    }

    router.replace('/registro');
  }

  async function reloadEmisoras() {
    setEmisoras(await getEmisoras(supabase));
  }

  async function handleAddEmisora(name: string) {
    const clean = name.trim();
    if (!clean) return;
    if (emisoras.some((e) => e.name.toLowerCase() === clean.toLowerCase())) {
      setEmisoraError('Esa emisora ya está en tu lista.');
      return;
    }
    setEmisoraError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      await addEmisora(supabase, userData.user!.id, clean);
      setNewEmisora('');
      await reloadEmisoras();
    } catch (e) {
      setEmisoraError(e instanceof Error ? e.message : 'No se pudo añadir la emisora.');
    }
  }

  async function handleToggleEmisora(em: Emisora) {
    try {
      await setEmisoraActive(supabase, em.id, !em.is_active);
      await reloadEmisoras();
    } catch (e) {
      setEmisoraError(e instanceof Error ? e.message : 'No se pudo actualizar la emisora.');
    }
  }

  async function handleDeleteEmisora(id: string) {
    try {
      await deleteEmisora(supabase, id);
      await reloadEmisoras();
    } catch (e) {
      setEmisoraError(e instanceof Error ? e.message : 'No se pudo borrar la emisora.');
    }
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

      {/* ---------- Vehículo y descansos ---------- */}
      <h2 className="rise-in-2 mt-2 text-xs uppercase tracking-widest text-muted">
        Vehículo y descansos
      </h2>

      <section className="card rise-in-2 flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Tipo de vehículo</span>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['gasoline', 'Gasolina'],
                ['electric', 'Eléctrico'],
                ['eurotaxi', 'Eurotaxi'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setVehicleType(value)}
                className={`rounded-xl border px-2 py-3 text-sm font-semibold transition-colors ${
                  vehicleType === value
                    ? 'border-amber bg-amber-soft text-amber'
                    : 'border-line text-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {vehicleType === 'gasoline' ? (
          <>
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
          </>
        ) : (
          <p className="rounded-xl bg-bg px-4 py-3 text-sm text-muted">
            Sin descanso obligatorio: tú eliges qué días descansas. Cada día puedes marcar
            «Este día descansé» en el registro.
          </p>
        )}

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

      {/* ---------- Emisoras ---------- */}
      <h2 className="mt-2 text-xs uppercase tracking-widest text-muted">Emisoras</h2>

      <section className="card flex flex-col gap-3 p-5">
        <p className="text-xs text-muted">
          Las emisoras con las que trabajas. Al registrar un ingreso por emisora, eliges una de
          estas. Es informativo: la emisora va al jefe igual que el datáfono.
        </p>

        {emisoras.length > 0 && (
          <div className="flex flex-col gap-2">
            {emisoras.map((em) => (
              <div
                key={em.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-bg px-4 py-3"
              >
                <span className={`text-sm ${em.is_active ? '' : 'text-muted line-through'}`}>
                  📻 {em.name}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleToggleEmisora(em)}
                    className="text-xs font-semibold text-muted underline transition-colors hover:text-amber"
                  >
                    {em.is_active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteEmisora(em.id)}
                    aria-label="Borrar emisora"
                    className="text-muted transition-colors hover:text-bad"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {MADRID_EMISORAS.filter(
          (name) => !emisoras.some((e) => e.name.toLowerCase() === name.toLowerCase()),
        ).length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">Añadir rápido (Madrid)</span>
            <div className="flex flex-wrap gap-2">
              {MADRID_EMISORAS.filter(
                (name) => !emisoras.some((e) => e.name.toLowerCase() === name.toLowerCase()),
              ).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => handleAddEmisora(name)}
                  className="rounded-xl border border-line px-3 py-2 text-xs font-semibold text-muted transition-colors hover:border-amber hover:text-amber"
                >
                  + {name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={newEmisora}
            onChange={(e) => setNewEmisora(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddEmisora(newEmisora)}
            placeholder="Otra emisora…"
            className="amount-input min-w-0 flex-1 px-4 py-3 text-base"
          />
          <button
            type="button"
            onClick={() => handleAddEmisora(newEmisora)}
            className="btn-amber shrink-0 px-5 text-xl"
            aria-label="Añadir emisora"
          >
            +
          </button>
        </div>

        {emisoraError && <p className="text-sm text-bad">{emisoraError}</p>}
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

      {/* ---------- Acumulado del taxímetro (opcional) ---------- */}
      <h2 className="mt-2 text-xs uppercase tracking-widest text-muted">
        Datos del taxímetro (opcional)
      </h2>

      <section className="card flex flex-col gap-3 p-5">
        {!odoOpen ? (
          <button
            type="button"
            onClick={() => setOdoOpen(true)}
            className="rounded-xl border border-line px-4 py-3 text-sm font-semibold text-muted transition-colors hover:border-amber hover:text-amber"
          >
            + Añadir totales históricos del taxi
          </button>
        ) : (
          <>
            <p className="text-xs text-muted">
              Totales acumulados del taxímetro. No afectan el cuadre con el jefe;
              son solo tus estadísticas. Cada cierre de día se suma aquí.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {ODO_FIELDS.map(([key, label, unit]) => (
                <label key={key} className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted">
                    {label}
                    {unit && ` (${unit})`}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step={unit === '€' ? '0.01' : unit === 'km' ? '0.1' : '1'}
                    placeholder="—"
                    value={odo[key]}
                    onChange={(e) => setOdo({ ...odo, [key]: e.target.value })}
                    className="amount-input px-3 py-2.5 text-base"
                  />
                </label>
              ))}
            </div>
          </>
        )}
      </section>

      <button onClick={handleSave} disabled={saving} className="btn-amber py-4 text-lg">
        {saving ? 'Guardando…' : 'Guardar cambios'}
      </button>

      {/* ---------- Soporte y feedback ---------- */}
      <div className="mt-2 pb-2 text-center">
        <p className="text-xs text-muted">
          ¿Algo falla, no se entiende, o se te ocurre algo que mejoraría la app?
          <br />
          Cuéntanoslo, nos ayuda muchísimo.
        </p>
        <a
          href="https://wa.me/34642471982?text=Hola%2C%20uso%20TaxiLog%20y%20quiero%20contar%20algo%3A%0A%0A%E2%80%A2%20Qu%C3%A9%20pas%C3%B3%20o%20qu%C3%A9%20me%20gustar%C3%ADa%3A%20%0A%E2%80%A2%20En%20qu%C3%A9%20pantalla%3A%20"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-2 rounded-xl border border-line px-5 py-3 text-sm font-semibold text-muted transition-colors hover:border-[#25D366] hover:text-[#25D366]"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 shrink-0 fill-current"
            aria-hidden="true"
          >
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.855L.057 23.886a.5.5 0 0 0 .612.612l6.044-1.469A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.796 9.796 0 0 1-4.988-1.365l-.358-.213-3.712.902.935-3.624-.233-.373A9.772 9.772 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z" />
          </svg>
          Reportar fallo o sugerir algo
        </a>
      </div>
    </div>
  );
}