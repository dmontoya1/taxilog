'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { currentWorkday, isRestDay, parseLocalDate } from '@/lib/domain/rest-days';
import { getEmisoras, type Emisora } from '@/lib/domain/emisoras';
import {
  euro,
  getActiveAgreement,
  getSettlement,
  monthRange,
  type AgreementConfig,
  type IncomeMethod,
  type SettlementSummary,
} from '@/lib/domain/settlement';
import { useCountUp } from '../use-count-up';
import { CloseDaySheet } from './close-day-sheet';
import { useToast } from '@/components/ui/toast';

const DAY_LABEL = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

interface IncomeEntry {
  id: string;
  method: IncomeMethod;
  amount: number;
  notes: string | null;
  created_at: string;
  emisora_id: string | null;
  is_amex: boolean;
  emisora: { name: string } | null;
}

interface DayExpense {
  id: string;
  amount: number;
  boss_share: number;
  notes: string | null;
  created_at: string;
  category: { name: string } | null;
}

type MovementKind = IncomeMethod | 'expense';

interface Movement {
  kind: MovementKind;
  id: string;
  amount: number;
  label: string;
  createdAt: string;
  is_amex?: boolean;
}

const MOVEMENT_STYLE: Record<MovementKind, { icon: string; tint: string; sign: string }> = {
  cash: { icon: '💶', tint: 'text-ok', sign: '+' },
  card: { icon: '💳', tint: 'text-amber', sign: '+' },
  emisora: { icon: '📻', tint: 'text-amber', sign: '+' },
  expense: { icon: '⛽', tint: 'text-bad', sign: '−' },
};

const METHOD_TABS: Array<[IncomeMethod, string]> = [
  ['cash', '💶 Efectivo'],
  ['card', '💳 Datáfono'],
  ['emisora', '📻 Emisora'],
];

export default function RegistroPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [date, setDate] = useState(() => currentWorkday());
  const [method, setMethod] = useState<IncomeMethod>('cash');
  const [amount, setAmount] = useState('');
  const [emisoraId, setEmisoraId] = useState('');
  const [isAmex, setIsAmex] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [entries, setEntries] = useState<IncomeEntry[]>([]);
  const [dayExpenses, setDayExpenses] = useState<DayExpense[]>([]);
  const [emisoras, setEmisoras] = useState<Emisora[]>([]);
  const [isRest, setIsRest] = useState(false);
  const [isFeeExempt, setIsFeeExempt] = useState(false);
  const [dayClosed, setDayClosed] = useState(false);

  const [stickyMethod] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('taxilog-sticky-method') === 'true',
  );

  const [agreement, setAgreement] = useState<AgreementConfig | null | undefined>();
  const [settlement, setSettlement] = useState<SettlementSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCloseSheet, setShowCloseSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { success, error: toastError, subscriptionStatus, openUpgradeModal } = useToast();

  const activeEmisoras = emisoras.filter((e) => e.is_active);

  const localDay = parseLocalDate(date);
  const suggestedRest =
    agreement != null &&
    isRestDay(localDay, {
      weekdayRest: agreement.weekday_rest,
      weekendWorkParity: agreement.weekend_work_parity,
      vehicleType: agreement.vehicle_type,
    });

  const refreshSettlement = useCallback(async () => {
    const d = parseLocalDate(date);
    const [from, to] = monthRange(d.getFullYear(), d.getMonth() + 1);
    setSettlement(await getSettlement(supabase, from, to));
  }, [supabase, date]);

  const loadDay = useCallback(async () => {
    setError(null);
    try {
      const [ag, entriesRes, expensesRes, flagsRes, emisorasList] = await Promise.all([
        getActiveAgreement(supabase, date),
        supabase
          .from('income_entries')
          .select('id, method, amount, notes, created_at, emisora_id, is_amex, emisora:emisoras(name)')
          .eq('entry_date', date)
          .order('created_at', { ascending: false }),
        supabase
          .from('expenses')
          .select('id, amount, boss_share, notes, created_at, category:expense_categories(name)')
          .eq('expense_date', date)
          .order('created_at', { ascending: false }),
        supabase
          .from('daily_records')
          .select('is_rest_day, is_fee_exempt, day_closed')
          .eq('work_date', date)
          .maybeSingle(),
        getEmisoras(supabase),
      ]);

      setAgreement(ag);
      setEntries((entriesRes.data as unknown as IncomeEntry[]) ?? []);
      setDayExpenses((expensesRes.data as unknown as DayExpense[]) ?? []);
      setIsRest(flagsRes.data?.is_rest_day ?? false);
      setIsFeeExempt(flagsRes.data?.is_fee_exempt ?? false);
      setDayClosed(flagsRes.data?.day_closed ?? false);
      setEmisoras(emisorasList);

      await refreshSettlement();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando los datos.');
    }
  }, [supabase, date, refreshSettlement]);

  useEffect(() => {
    void loadDay();
  }, [loadDay]);

  function resetForm() {
    setAmount('');
    setEmisoraId('');
    setIsAmex(false);
    if (!stickyMethod) setMethod('cash');
    setEditingId(null);
  }

  function startEditEntry(entry: IncomeEntry) {
    setEditingId(entry.id);
    setMethod(entry.method);
    setAmount(String(entry.amount));
    setEmisoraId(entry.emisora_id ?? '');
    setIsAmex(entry.is_amex);
    setError(null);
  }

  function handleQuickAmount(val: number, isAdditive: boolean) {
    if (isAdditive) {
      const current = Number(amount) || 0;
      setAmount((current + val).toFixed(2).replace(/\.00$/, ''));
    } else {
      setAmount(String(val));
    }
  }

  async function handleSaveEntry() {
    const value = Number(amount);
    if (!value || value <= 0) {
      toastError('Indica el monto de la carrera o cobro.');
      setError('Indica el monto de la carrera o cobro.');
      return;
    }
    if (method === 'emisora') {
      if (activeEmisoras.length === 0) {
        toastError('No tienes emisoras configuradas. Añádelas en Configuración.');
        setError('No tienes emisoras configuradas. Añádelas en Configuración.');
        return;
      }
      if (!emisoraId) {
        toastError('Elige la emisora de la carrera.');
        setError('Elige la emisora de la carrera.');
        return;
      }
    }
    setSaving(true);
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    const emisora_id = method === 'emisora' ? emisoraId : null;
    const is_amex = method === 'card' ? isAmex : false;

    const isEdit = !!editingId;
    const { error: saveError } = editingId
      ? await supabase
          .from('income_entries')
          .update({ method, amount: value, emisora_id, is_amex })
          .eq('id', editingId)
      : await supabase.from('income_entries').insert({
          user_id: userData.user!.id,
          entry_date: date,
          method,
          amount: value,
          emisora_id,
          is_amex,
        });

    if (saveError) {
      toastError('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
      setError('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
      setSaving(false);
      return;
    }

    success(isEdit ? '¡Movimiento actualizado con éxito!' : '¡Cobro guardado con éxito!');
    resetForm();
    setSaving(false);
    await loadDay();
  }

  function handleEditMovement(kind: MovementKind, id: string) {
    if (kind === 'expense') {
      // Los gastos se editan en su pantalla, con su categoría y % del jefe.
      router.push(`/gastos?date=${date}`);
      return;
    }
    const entry = entries.find((e) => e.id === id);
    if (entry) startEditEntry(entry);
  }

  async function handleDeleteMovement(kind: MovementKind, id: string) {
    const table = kind === 'expense' ? 'expenses' : 'income_entries';
    if (editingId === id) resetForm();
    const { error: delError } = await supabase.from(table).delete().eq('id', id);
    if (delError) {
      toastError('No se pudo eliminar el movimiento.');
    } else {
      success('Movimiento eliminado.');
    }
    await loadDay();
  }

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

  const totalCash = entries
    .filter((e) => e.method === 'cash')
    .reduce((s, e) => s + Number(e.amount), 0);
  const totalCard = entries
    .filter((e) => e.method === 'card')
    .reduce((s, e) => s + Number(e.amount), 0);
  const totalEmisora = entries
    .filter((e) => e.method === 'emisora')
    .reduce((s, e) => s + Number(e.amount), 0);
  const gross = totalCash + totalCard + totalEmisora;

  const dayFee =
    isRest || isFeeExempt || !agreement
      ? 0
      : agreement.fee_type === 'fixed'
        ? agreement.fee_value
        : (gross * agreement.fee_value) / 100;

  const incomeLabel: Record<IncomeMethod, string> = {
    cash: 'Efectivo',
    card: 'Datáfono',
    emisora: 'Emisora',
  };

  const movements: Movement[] = [
    ...entries.map<Movement>((e) => ({
      kind: e.method,
      id: e.id,
      amount: Number(e.amount),
      label:
        e.method === 'emisora' && e.emisora?.name
          ? `${incomeLabel[e.method]} · ${e.emisora.name}`
          : incomeLabel[e.method],
      createdAt: e.created_at,
      is_amex: e.method === 'card' ? e.is_amex : undefined,
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
            {dayClosed && (
              <p className="mt-0.5 text-xs text-ok">✓ Día cerrado</p>
            )}
          </div>
          <input
            type="date"
            value={date}
            max={currentWorkday()}
            onChange={(e) => {
              resetForm();
              setDate(e.target.value);
            }}
            className="amount-input px-3 py-2 text-sm"
          />
        </div>

        <p className="mt-2 text-xs text-muted">
          La jornada va de 6:00 a 6:00. Las carreras de 00:00 a 06:00 cuentan al día anterior.
        </p>

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

      {/* ---------- Añadir / editar transacción ---------- */}
      {!isRest && (
        <section className="card rise-in-3 flex flex-col gap-4 p-5">
          {editingId && (
            <div className="flex items-center justify-between text-xs text-amber">
              <span>Editando movimiento</span>
              <button type="button" onClick={resetForm} className="text-muted underline">
                Cancelar
              </button>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {METHOD_TABS.map(([value, label]) => {
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setMethod(value);
                    if (value !== 'emisora') setEmisoraId('');
                    if (value !== 'card') setIsAmex(false);
                  }}
                  className={`rounded-xl border px-2 py-3 text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
                    method === value
                      ? 'border-amber bg-amber-soft text-amber'
                      : 'border-line text-muted'
                  }`}
                >
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {method === 'card' && (
            <label className="flex items-center justify-between gap-3 rounded-xl bg-bg px-4 py-3">
              <span className="text-sm">
                Pago con American Express (AMEX)
              </span>
              <input
                type="checkbox"
                checked={isAmex}
                onChange={(e) => setIsAmex(e.target.checked)}
                className="h-5 w-5 accent-[var(--amber)]"
              />
            </label>
          )}

          {method === 'emisora' &&
            (activeEmisoras.length > 0 ? (
              <select
                value={emisoraId}
                onChange={(e) => setEmisoraId(e.target.value)}
                className="amount-input px-3 py-3 text-base"
              >
                <option value="">Elige la emisora…</option>
                {activeEmisoras.map((em) => (
                  <option key={em.id} value={em.id}>
                    {em.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted">
                No tienes emisoras configuradas.{' '}
                <Link href="/configuracion" className="text-amber underline">
                  Añádelas en Configuración
                </Link>
                .
              </p>
            ))}

          {/* Botones de acceso rápido para ingresos */}
          <div className="flex flex-wrap gap-1.5 text-xs pt-1">
            <button
              type="button"
              onClick={() => handleQuickAmount(5, true)}
              className="rounded-full bg-surface-2 border border-line px-3 py-1.5 hover:border-amber hover:text-amber active:scale-95 transition-all text-muted font-semibold cursor-pointer"
            >
              +5€
            </button>
            <button
              type="button"
              onClick={() => handleQuickAmount(10, true)}
              className="rounded-full bg-surface-2 border border-line px-3 py-1.5 hover:border-amber hover:text-amber active:scale-95 transition-all text-muted font-semibold cursor-pointer"
            >
              +10€
            </button>
            <button
              type="button"
              onClick={() => handleQuickAmount(20, true)}
              className="rounded-full bg-surface-2 border border-line px-3 py-1.5 hover:border-amber hover:text-amber active:scale-95 transition-all text-muted font-semibold cursor-pointer"
            >
              +20€
            </button>
            <button
              type="button"
              onClick={() => handleQuickAmount(33, false)}
              className="rounded-full bg-surface-2 border border-line px-3 py-1.5 hover:border-amber hover:text-amber active:scale-95 transition-all text-muted font-semibold cursor-pointer"
            >
              ✈️ Aero 33€
            </button>
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
              onKeyDown={(e) => e.key === 'Enter' && handleSaveEntry()}
              className="amount-input min-w-0 flex-1 px-4 py-4 text-2xl"
            />
            <button
              onClick={handleSaveEntry}
              disabled={saving}
              className="btn-amber shrink-0 px-6 text-2xl"
              aria-label={editingId ? 'Guardar cambios' : 'Añadir transacción'}
            >
              {editingId ? '✓' : '+'}
            </button>
          </div>

          {/* ---------- Totales del día ---------- */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="rounded-xl bg-bg px-1 py-3">
              <p className="text-xs text-muted">💶</p>
              <p className="taximeter mt-1 text-xs">{euro.format(totalCash)}</p>
            </div>
            <div className="rounded-xl bg-bg px-1 py-3">
              <p className="text-xs text-muted">💳</p>
              <p className="taximeter mt-1 text-xs">{euro.format(totalCard)}</p>
            </div>
            <div className="rounded-xl bg-bg px-1 py-3">
              <p className="text-xs text-muted">📻</p>
              <p className="taximeter mt-1 text-xs">{euro.format(totalEmisora)}</p>
            </div>
            <div className="rounded-xl bg-bg px-1 py-3">
              <p className="text-xs text-muted">Jefe</p>
              <p className="taximeter mt-1 text-xs">
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
                className={`card flex items-center justify-between px-4 py-3 ${
                  editingId === m.id ? 'border-amber' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{style.icon}</span>
                  <div>
                    <p className="text-sm font-semibold">
                      {m.label}
                      {m.is_amex && (
                        <span className="ml-1.5 rounded bg-amber-soft px-1.5 py-0.5 text-xs text-amber">
                          AMEX
                        </span>
                      )}
                    </p>
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
                    onClick={() => handleEditMovement(m.kind, m.id)}
                    aria-label="Editar movimiento"
                    className="text-muted transition-colors hover:text-amber"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteMovement(m.kind, m.id)}
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

      {/* ---------- Cerrar día ---------- */}
      {!isRest && (
        <button
          onClick={() => setShowCloseSheet(true)}
          className={`mt-2 rounded-[0.85rem] border py-4 text-base font-bold transition-transform active:scale-[0.98] ${
            dayClosed
              ? 'border-ok text-ok'
              : 'border-amber text-amber'
          }`}
        >
          {dayClosed ? '✓ Editar cierre del día' : '🏁 Cerrar día'}
        </button>
      )}

      {showCloseSheet && (
        <CloseDaySheet
          date={date}
          registeredTotal={gross}
          onClose={() => setShowCloseSheet(false)}
          onClosed={async () => {
            setShowCloseSheet(false);
            await loadDay();
          }}
        />
      )}
    </div>
  );
}
