'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  closeDay,
  euro,
  getDayClosure,
  type DayClosure,
} from '@/lib/domain/settlement';

interface Props {
  date: string;
  registeredTotal: number; // suma de efectivo+datáfono+emisora ya registrados
  onClose: () => void;
  onClosed: () => void | Promise<void>;
}

type FieldKey = keyof DayClosure;

const FIELDS: Array<{ key: FieldKey; label: string; unit: string; step: string }> = [
  { key: 'p_num_servicios', label: 'Nº de servicios', unit: '', step: '1' },
  { key: 'p_carreras', label: 'Carreras', unit: '€', step: '0.01' },
  { key: 'p_suplementos', label: 'Suplementos', unit: '€', step: '0.01' },
  { key: 'p_dist_total', label: 'Dist. Total', unit: 'km', step: '0.1' },
  { key: 'p_dist_ocupado', label: 'Dist. Ocupado', unit: 'km', step: '0.1' },
  { key: 'p_dist_libre', label: 'Dist. Libre', unit: 'km', step: '0.1' },
  { key: 'p_dist_off', label: 'Dist. OFF', unit: 'km', step: '0.1' },
  { key: 'p_tiempo_ocupado', label: 'Tiempo Ocupado', unit: 'min', step: '1' },
  { key: 'p_tiempo_on', label: 'Tiempo ON', unit: 'min', step: '1' },
];

export function CloseDaySheet({ date, registeredTotal, onClose, onClosed }: Props) {
  const supabase = createClient();
  const [values, setValues] = useState<Record<FieldKey, string>>(
    Object.fromEntries(FIELDS.map((f) => [f.key, ''])) as Record<FieldKey, string>,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Precarga si el día ya estaba cerrado (para editar)
  useEffect(() => {
    (async () => {
      const existing = await getDayClosure(supabase, date);
      if (existing?.day_closed) {
        setValues(
          Object.fromEntries(
            FIELDS.map((f) => [f.key, existing[f.key] != null ? String(existing[f.key]) : '']),
          ) as Record<FieldKey, string>,
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  function num(key: FieldKey): number | null {
    const v = values[key];
    return v === '' ? null : Number(v);
  }

  const pCarreras = num('p_carreras');
  // Comparación informativa: taxímetro vs lo registrado. No bloquea nada.
  const diff = pCarreras != null ? pCarreras - registeredTotal : null;

  async function handleSave(skip: boolean) {
    setSaving(true);
    setError(null);

    const payload: DayClosure = skip
      ? (Object.fromEntries(FIELDS.map((f) => [f.key, null])) as unknown as DayClosure)
      : (Object.fromEntries(FIELDS.map((f) => [f.key, num(f.key)])) as unknown as DayClosure);

    try {
      await closeDay(supabase, date, payload);
      await onClosed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cerrar el día.');
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />

        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold">
          Cerrar día
        </h2>
        <p className="mt-1 text-sm text-muted">
          Datos del recibo del taxímetro. Son opcionales: puedes saltarlos.
        </p>

        {/* Comparación P Carreras vs registrado */}
        {pCarreras != null && (
          <div className="mt-4 rounded-xl bg-bg p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Registrado por ti</span>
              <span className="taximeter">{euro.format(registeredTotal)}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted">Carreras (taxímetro)</span>
              <span className="taximeter">{euro.format(pCarreras)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-line pt-2">
              <span className="text-muted">Diferencia</span>
              <span
                className={`taximeter ${
                  Math.abs(diff ?? 0) < 0.01 ? 'text-ok' : 'text-amber'
                }`}
              >
                {(diff ?? 0) >= 0 ? '+' : ''}
                {euro.format(diff ?? 0)}
              </span>
            </div>
            {Math.abs(diff ?? 0) >= 0.01 && (
              <p className="mt-2 text-xs text-muted">
                No tiene por qué cuadrar exactamente: propinas, redondeos o carreras
                sin registrar explican la diferencia. Este dato no cambia tu balance.
              </p>
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">
                {f.label}
                {f.unit && ` (${f.unit})`}
              </span>
              <input
                type="number"
                inputMode="decimal"
                step={f.step}
                min="0"
                placeholder="—"
                value={values[f.key]}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                className="amount-input px-3 py-2.5 text-base"
              />
            </label>
          ))}
        </div>

        {error && <p className="mt-3 text-center text-sm text-bad">{error}</p>}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="rounded-[0.85rem] border border-line py-3.5 text-sm font-semibold text-muted"
          >
            Cerrar sin datos
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="btn-amber py-3.5 text-sm"
          >
            {saving ? 'Guardando…' : 'Guardar cierre'}
          </button>
        </div>
      </div>
    </div>
  );
}
