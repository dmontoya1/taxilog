'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { isRestDay, parseLocalDate, toIsoDate } from '@/lib/domain/rest-days';
import {
  euro,
  getActiveAgreement,
  getSettlement,
  monthRange,
  type AgreementConfig,
  type SettlementSummary,
} from '@/lib/domain/settlement';
import { useCountUp } from '../use-count-up';

const DAY_LABEL = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

type Method = 'cash' | 'card';

interface IncomeEntry {
  id: string;
  method: Method;
  amount: number;
  notes: string | null;
  created_at: string;
}

interface DayExpense {
  id: string;
  amount: number;
  boss_share: number;
  notes: string | null;
  created_at: string;
  category: { name: string } | null;
}

/** Movimiento unificado del día para la lista (ingresos + gastos). */
type Movement =
  | { kind: 'cash' | 'card'; id: string; amount: number; label: string; createdAt: string }
  | { kind: 'expense'; id: string; amount: number; label: string; createdAt: string };

const MOVEMENT_STYLE: Record<
  Movement['kind'],
  { icon: string; tint: string; sign: string }
> = {
  cash: { icon: '💶', tint: 'text-ok', sign: '+' },
  card: { icon: '💳', tint: 'text-amber', sign: '+' },
  expense: { icon: '⛽', tint: 'text-bad', sign: '−' },
};

export default function RegistroPage() {
  const supabase = useMemo(() => createClient(), []);

  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [method, setMethod] = useState<Method>('cash');
  const [amount, setAmount] = useState('');

  const [entries, setEntries] = useState<IncomeEntry[]>([]);
  const [dayExpenses, setDayExpenses] = useState<DayExpense[]>([]);
  const [isRest, setIsRest] = useState(false);
  const [isFeeExempt, setIsFeeExempt] = useState(false);

  const [agreement, setAgreement] = useState<AgreementConfig | null | undefined>();
  const [settlement, setSettlement] = useState<SettlementSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localDay = parseLocalDate(date);
  const suggestedRest =
    agreement != null &&
    isRestDay(localDay, {
      weekdayRest: agreement.weekday_rest,
      weekendWorkParity: agreement.weekend_work_parity,
    });

  // ---------- Carga del día seleccionado ----------
  const refreshSettlement = useCallback(async () => {
    const d = parseLocalDate(date);
    const [from, to] = monthRange(d.getFullYear(), d.getMonth() + 1);
    setSettlement(await getSettlement(supabase, from, to));
  }, [supabase, date]);

  const loadDay = useCallback(async () => {
    setError(null);
    try {
      const [ag, entriesRes, expensesRes, flagsRes] = await Promise.all([
        getActiveAgreement(supabase, date),
        supabase
          .from('income_entries')
          .select('id, method, amount, notes, created_at')
          .eq('entry_date', date)
          .order('created_at', { ascending: false }),
        supabase
          .from('expenses')
          .select('id, amount, boss_share, notes, created_at, category:expense_categories(name)')
          .eq('expense_date', date)
          .order('created_at', { ascending: false }),
        supabase
          .from('daily_records')
          .select('is_rest_day, is_fee_exempt')
          .eq('work_date', date)
          .maybeSingle(),
      ]);

      setAgreement(ag);
      setEntries((entriesRes.data as IncomeEntry[]) ?? []);
      setDayExpenses((expensesRes.data as unknown as DayExpense[]) ?? []);
      setIsRest(flagsRes.data?.is_rest_day ?? false);
      setIsFeeExempt(flagsRes.data?.is_fee_exempt ?? false);

      await refreshSettlement();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando los datos.');
    }
  }, [supabase, date, refreshSettlement]);

  useEffect(() => {
    void loadDay();
  }, [loadDay]);

  // ---------- Añadir una transacción ----------
  async function handleAddEntry() {
    const value = Number(amount);
    if (!value || value <= 0) {
      setError('Indica el monto de la carrera o cobro.');
      return;
    }
    setSaving(true);
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from('income_entries').insert({
      user_id: userData.user!.id,
      entry_date: date,
      method,
      amount: value,
    });

    if (insertError) {
      setError('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
      setSaving(false);
      return;
    }

    setAmount('');
    setSaving(false);
    await loadDay();
  }

  async function handleDeleteEntry(kind: Movement['kind'], id: string) {
    const table = kind === 'expense' ? 'expenses' : 'income_entries';
    await supabase.from(table).delete().eq('id', id);
    await loadDay();
  }

  // ---------- Flags del día: persisten al instante ----------
  async function persistFlags(rest: boolean, exempt: boolean) {
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from('daily_records').upsert(
      {
        user_id: userData.user!.id,
        work_date: date,
        is_rest_day: rest,
        is_fee_exempt: !rest && exempt,
      },
      { onConflict: 'user_id,work_date' },
    );
    await refreshSettlement();
  }

  // ---------- Totales y vista previa de cuota ----------
  const totalCash = entries
    .filter((e) => e.method === 'cash')
    .reduce((s, e) => s + Number(e.amount), 0);
  const totalCard = entries
    .filter((e) => e.method === 'card')
    .reduce((s, e) => s + Number(e.amount), 0);
  const gross = totalCash + totalCard;

  const dayFee =
    isRest || isFeeExempt || !agreement
      ? 0
      : agreement.fee_type === 'fixed'
        ? agreement.fee_value
        : (gross * agreement.fee_value) / 100;

  const movements: Movement[] = [
    ...entries.map<Movement>((e) => ({
      kind: e.method,
      id: e.id,
      amount: Number(e.amount),
      label: e.method === 'cash' ? 'Efectivo' : 'Datáfono',
      createdAt: e.created_at,
    })),
    ...dayExpenses.map<Movement>((e) => ({
      kind: 'expense',
      id: e.id,
      amount: Number(e.amount),
      label: e.category?.name ?? 'Gasto',
      createdAt: e.created_at,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const animatedBalance = useCountUp(settlement?.balance ?? 0);

  if (agreement === undefined) {
    return <p className="pt-10 text-center text-muted">Cargando…</p>;
  }

  if (agreement === null) {
    return (
      <div className="card rise-in mt-8 p-6 text-center">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold">
          Falta un paso
        </h2>
        <p className="mt-2 text-sm text-muted">
          Antes de registrar tu primer día, configura el acuerdo con tu jefe:
          cuánto le corresponde y qué días descansas.
        </p>
        <Link href="/configuracion" className="btn-amber mt-5 inline-block px-6 py-3">
          Configurar acuerdo
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ---------- Balance del mes ---------- */}
      <section className="card rise-in p-5 text-center">
        <p className="text-xs uppercase tracking-widest text-muted">
          Balance del mes con el jefe
        </p>
        <p
          className={`taximeter mt-1 text-4xl font-semibold ${
            (settlement?.balance ?? 0) > 0 ? 'taximeter--bad' : 'taximeter--ok'
          }`}
        >
          {euro.format(Math.abs(animatedBalance))}
        </p>
        <p className="mt-1 text-sm text-muted">
          {(settlement?.balance ?? 0) > 0
            ? 'le debes al jefe'
            : (settlement?.balance ?? 0) < 0
              ? 'el jefe te debe'
              : 'estáis en paz'}
        </p>
      </section>

      {/* ---------- Fecha y estado del día ---------- */}
      <section className="card rise-in-2 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-[family-name:var(--font-display)] text-lg font-bold capitalize">
              {DAY_LABEL.format(localDay)}
            </p>
            {suggestedRest && !isRest && (
              <p className="mt-0.5 text-xs text-amber">
                Según tu acuerdo, este día te tocaba descansar
              </p>
            )}
          </div>
          <input
            type="date"
            value={date}
            max={toIsoDate(new Date())}
            onChange={(e) => setDate(e.target.value)}
            className="amount-input px-3 py-2 text-sm"
          />
        </div>

        <label className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-bg px-4 py-3">
          <span className="text-sm">Este día descansé</span>
          <input
            type="checkbox"
            checked={isRest}
            onChange={(e) => {
              setIsRest(e.target.checked);
              void persistFlags(e.target.checked, isFeeExempt);
            }}
            className="h-5 w-5 accent-[var(--amber)]"
          />
        </label>

        {suggestedRest && !isRest && (
          <label className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-amber-soft px-4 py-3">
            <span className="text-sm">
              Día libre trabajado
              <span className="block text-xs text-muted">
                Sin cuota al jefe: todo el día queda para ti
              </span>
            </span>
            <input
              type="checkbox"
              checked={isFeeExempt}
              onChange={(e) => {
                setIsFeeExempt(e.target.checked);
                void persistFlags(isRest, e.target.checked);
              }}
              className="h-5 w-5 accent-[var(--amber)]"
            />
          </label>
        )}
      </section>

      {/* ---------- Añadir transacción ---------- */}
      {!isRest && (
        <section className="card rise-in-3 flex flex-col gap-4 p-5">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['cash', '💶 Efectivo'],
                ['card', '💳 Datáfono'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMethod(value)}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                  method === value
                    ? 'border-amber bg-amber-soft text-amber'
                    : 'border-line text-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddEntry()}
              className="amount-input min-w-0 flex-1 px-4 py-4 text-2xl"
            />
            <button
              onClick={handleAddEntry}
              disabled={saving}
              className="btn-amber shrink-0 px-6 text-2xl"
              aria-label="Añadir transacción"
            >
              +
            </button>
          </div>

          {/* ---------- Totales del día ---------- */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-bg px-2 py-3">
              <p className="text-xs text-muted">💶 Efectivo</p>
              <p className="taximeter mt-1 text-sm">{euro.format(totalCash)}</p>
            </div>
            <div className="rounded-xl bg-bg px-2 py-3">
              <p className="text-xs text-muted">💳 Datáfono</p>
              <p className="taximeter mt-1 text-sm">{euro.format(totalCard)}</p>
            </div>
            <div className="rounded-xl bg-bg px-2 py-3">
              <p className="text-xs text-muted">Cuota jefe</p>
              <p className="taximeter mt-1 text-sm">
                {isFeeExempt ? 'Exento' : euro.format(dayFee)}
              </p>
            </div>
          </div>
        </section>
      )}

      {error && <p className="text-center text-sm text-bad">{error}</p>}

      {/* ---------- Movimientos del día ---------- */}
      {movements.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm uppercase tracking-widest text-muted">
            Movimientos del día
          </h2>
          {movements.map((m) => {
            const style = MOVEMENT_STYLE[m.kind];
            return (
              <div
                key={`${m.kind}-${m.id}`}
                className="card flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{style.icon}</span>
                  <div>
                    <p className="text-sm font-semibold">{m.label}</p>
                    <p className="text-xs text-muted">
                      {new Date(m.createdAt).toLocaleTimeString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`taximeter text-base ${style.tint}`}>
                    {style.sign}
                    {euro.format(m.amount)}
                  </span>
                  <button
                    onClick={() => handleDeleteEntry(m.kind, m.id)}
                    aria-label="Eliminar movimiento"
                    className="text-muted transition-colors hover:text-bad"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
