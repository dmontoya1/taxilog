'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  euro,
  getActiveAgreement,
  getRangeTransactions,
  getReportPreferences,
  getSettlementDays,
  groupTransactionsByDay,
  monthRange,
  summarizeDays,
  type DayTransactions,
  type SettlementDay,
  type TransactionKind,
} from '@/lib/domain/settlement';

const MONTH_LABEL = new Intl.DateTimeFormat('es-ES', { month: 'short', year: '2-digit' });
const DAY_LABEL = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
});
const TIME_LABEL = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

const KIND_UI: Record<TransactionKind, { icon: string; tint: string; sign: string }> = {
  cash: { icon: '💶', tint: 'text-ok', sign: '+' },
  card: { icon: '💳', tint: 'text-amber', sign: '+' },
  emisora: { icon: '📻', tint: 'text-amber', sign: '+' },
  expense: { icon: '⛽', tint: 'text-bad', sign: '−' },
};

function parseLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Últimos 6 meses como chips de acceso rápido. */
function recentMonths(): Array<{ label: string; from: string; to: string }> {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const [from, to] = monthRange(d.getFullYear(), d.getMonth() + 1);
    return { label: MONTH_LABEL.format(d), from, to };
  });
}

export default function InformesPage() {
  const supabase = useMemo(() => createClient(), []);
  const months = useMemo(recentMonths, []);

  const [from, setFrom] = useState(months[0].from);
  const [to, setTo] = useState(months[0].to);
  const [customRange, setCustomRange] = useState(false);
  const [view, setView] = useState<'resumen' | 'detalle'>('resumen');

  const [days, setDays] = useState<SettlementDay[] | null>(null);
  const [detail, setDetail] = useState<DayTransactions[] | null>(null);
  const [exporting, setExporting] = useState<'boss' | 'detail' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setDays(null);
    setDetail(null);
    try {
      const [d, txs] = await Promise.all([
        getSettlementDays(supabase, from, to),
        getRangeTransactions(supabase, from, to),
      ]);
      setDays(d);
      setDetail(groupTransactionsByDay(txs));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando el informe.');
    }
  }, [supabase, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = days ? summarizeDays(days) : null;
  const owesBoss = (summary?.balance ?? 0) > 0;

  async function getDriverName(): Promise<string> {
    const { data } = await supabase.from('profiles').select('full_name').single();
    return data?.full_name ?? 'Conductor';
  }

  async function handleExportBoss() {
    if (!days || !summary || !detail) return;
    setExporting('boss');
    try {
      const [{ buildReportPdf, sharePdf }, driverName, prefs, agreement] = await Promise.all([
        import('@/lib/report/pdf'),
        getDriverName(),
        getReportPreferences(supabase),
        getActiveAgreement(supabase, to),
      ]);
      const amexTransactions = detail
        .flatMap((d) => d.transactions)
        .filter((t) => t.kind === 'card' && t.is_amex);
      const doc = buildReportPdf({
        driverName,
        from,
        to,
        days,
        summary,
        prefs,
        cardGoesToBoss: agreement?.card_goes_to_boss ?? true,
        amexTransactions,
      });
      await sharePdf(doc, `liquidacion_${from}_${to}.pdf`);
    } catch {
      setError('No se pudo generar el PDF. Inténtalo de nuevo.');
    } finally {
      setExporting(null);
    }
  }

  async function handleExportDetail() {
    if (!detail || !days || !summary) return;
    setExporting('detail');
    try {
      const [{ buildDetailedReportPdf, sharePdf }, driverName] = await Promise.all([
        import('@/lib/report/pdf'),
        getDriverName(),
      ]);
      const doc = buildDetailedReportPdf({
        driverName,
        from,
        to,
        days: detail,
        settlementDays: days,
        summary,
      });
      await sharePdf(doc, `detalle_${from}_${to}.pdf`);
    } catch {
      setError('No se pudo generar el PDF. Inténtalo de nuevo.');
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="rise-in font-[family-name:var(--font-display)] text-2xl font-bold">
        Cuadre
      </h1>

      {/* ---------- Selector de período ---------- */}
      <section className="rise-in flex flex-col gap-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {months.map((m) => {
            const active = !customRange && m.from === from && m.to === to;
            return (
              <button
                key={m.from}
                onClick={() => {
                  setCustomRange(false);
                  setFrom(m.from);
                  setTo(m.to);
                }}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold capitalize transition-colors ${
                  active ? 'border-amber bg-amber-soft text-amber' : 'border-line text-muted'
                }`}
              >
                {m.label}
              </button>
            );
          })}
          <button
            onClick={() => setCustomRange(true)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              customRange ? 'border-amber bg-amber-soft text-amber' : 'border-line text-muted'
            }`}
          >
            Otro rango
          </button>
        </div>

        {customRange && (
          <div className="card grid grid-cols-2 gap-3 p-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Desde</span>
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="amount-input px-3 py-2.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Hasta</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="amount-input px-3 py-2.5 text-sm"
              />
            </label>
          </div>
        )}
      </section>

      {error && <p className="text-center text-sm text-bad">{error}</p>}
      {days === null && !error && <p className="pt-6 text-center text-muted">Calculando…</p>}

      {days !== null && summary !== null && detail !== null && (
        <>
          {/* ---------- Resumen del balance (siempre visible) ---------- */}
          <section className="card rise-in-2 p-5">
            <p className="text-center text-xs uppercase tracking-widest text-muted">
              {summary.balance === 0
                ? 'Período en paz'
                : owesBoss
                  ? 'Entregas al jefe'
                  : 'El jefe te devuelve'}
            </p>
            <p
              className={`taximeter mt-1 text-center text-4xl font-semibold ${
                owesBoss ? 'taximeter--bad' : 'taximeter--ok'
              }`}
            >
              {euro.format(Math.abs(summary.balance))}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <span className="text-muted">Efectivo</span>
              <span className="taximeter text-right">{euro.format(summary.total_cash)}</span>
              <span className="text-muted">Datáfono (jefe)</span>
              <span className="taximeter text-right">{euro.format(summary.total_card)}</span>
              {(summary.total_emisora ?? 0) > 0 && (
                <>
                  <span className="text-muted">Emisoras (jefe)</span>
                  <span className="taximeter text-right">
                    {euro.format(summary.total_emisora ?? 0)}
                  </span>
                </>
              )}
              <span className="text-muted">Cuotas del período</span>
              <span className="taximeter text-right">{euro.format(summary.boss_due)}</span>
              <span className="text-muted">Gastos a cargo del jefe</span>
              <span className="taximeter text-right">
                {euro.format(summary.boss_expense_share)}
              </span>
            </div>
          </section>

          {/* ---------- Exportaciones ---------- */}
          <div className="rise-in-2 grid grid-cols-2 gap-2">
            <button
              onClick={handleExportBoss}
              disabled={exporting !== null || days.length === 0}
              className="btn-amber px-3 py-3.5 text-sm"
            >
              {exporting === 'boss' ? 'Generando…' : '📄 PDF para el jefe'}
            </button>
            <button
              onClick={handleExportDetail}
              disabled={exporting !== null || detail.length === 0}
              className="rounded-[0.85rem] border border-amber px-3 py-3.5 text-sm font-bold text-amber transition-transform active:scale-[0.97] disabled:opacity-50"
            >
              {exporting === 'detail' ? 'Generando…' : '🧾 PDF detallado'}
            </button>
          </div>

          {/* ---------- Conmutador de vista ---------- */}
          <div className="rise-in-3 grid grid-cols-2 gap-2">
            {(
              [
                ['resumen', 'Día a día'],
                ['detalle', 'Cada transacción'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setView(value)}
                className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                  view === value
                    ? 'border-amber bg-amber-soft text-amber'
                    : 'border-line text-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ---------- Vista: día a día (agregado) ---------- */}
          {view === 'resumen' &&
            (days.length === 0 ? (
              <p className="pt-4 text-center text-sm text-muted">
                Sin movimientos en este período. Registra días en la pestaña Día.
              </p>
            ) : (
              <section className="flex flex-col gap-2">
                {days.map((day) => (
                  <div key={day.d} className="card px-4 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold capitalize">
                        {DAY_LABEL.format(parseLocal(day.d))}
                        {day.is_rest && (
                          <span className="ml-2 rounded-full bg-bg px-2 py-0.5 text-xs text-muted">
                            Descanso
                          </span>
                        )}
                        {day.is_exempt && (
                          <span className="ml-2 rounded-full bg-amber-soft px-2 py-0.5 text-xs text-amber">
                            Libre trabajado
                          </span>
                        )}
                      </p>
                      {!day.is_rest && (
                        <span className="taximeter text-sm">{euro.format(day.gross)}</span>
                      )}
                    </div>

                    {!day.is_rest && (
                      <div className={`mt-2 grid gap-1 text-center text-xs ${day.emisora > 0 ? 'grid-cols-5' : 'grid-cols-4'}`}>
                        <div>
                          <p className="text-muted">💶</p>
                          <p className="taximeter mt-0.5">{euro.format(day.cash)}</p>
                        </div>
                        <div>
                          <p className="text-muted">💳</p>
                          <p className="taximeter mt-0.5">{euro.format(day.card)}</p>
                        </div>
                        {day.emisora > 0 && (
                          <div>
                            <p className="text-muted">📻</p>
                            <p className="taximeter mt-0.5">{euro.format(day.emisora)}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-muted">⛽</p>
                          <p className="taximeter mt-0.5">
                            {day.expense_total > 0 ? euro.format(day.expense_total) : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted">Jefe</p>
                          <p className="taximeter mt-0.5">
                            {day.is_exempt ? 'Exento' : euro.format(day.boss_fee)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </section>
            ))}

          {/* ---------- Vista: cada transacción ---------- */}
          {view === 'detalle' &&
            (detail.length === 0 ? (
              <p className="pt-4 text-center text-sm text-muted">
                Sin transacciones en este período.
              </p>
            ) : (
              <section className="flex flex-col gap-3">
                {detail.map((day) => (
                  <div key={day.date} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between px-1">
                      <h3 className="text-sm font-semibold capitalize text-muted">
                        {DAY_LABEL.format(parseLocal(day.date))}
                      </h3>
                      <p className="text-xs text-muted">
                        {day.totalCash > 0 && (
                          <span className="text-ok">💶 {euro.format(day.totalCash)} </span>
                        )}
                        {day.totalCard > 0 && (
                          <span className="text-amber">💳 {euro.format(day.totalCard)} </span>
                        )}
                        {day.totalEmisora > 0 && (
                          <span className="text-amber">📻 {euro.format(day.totalEmisora)} </span>
                        )}
                        {day.totalExpenses > 0 && (
                          <span className="text-bad">⛽ {euro.format(day.totalExpenses)}</span>
                        )}
                      </p>
                    </div>

                    {day.transactions.map((t) => {
                      const ui = KIND_UI[t.kind];
                      return (
                        <div
                          key={`${t.kind}-${t.id}`}
                          className="card flex items-center justify-between px-4 py-2.5"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">{ui.icon}</span>
                            <div>
                              <p className="text-sm font-semibold">
                                {t.label}
                                {t.is_amex && (
                                  <span className="ml-1.5 rounded bg-amber-soft px-1.5 py-0.5 text-xs text-amber">
                                    AMEX
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-muted">
                                {TIME_LABEL.format(new Date(t.createdAt))}
                                {t.notes ? ` · ${t.notes}` : ''}
                              </p>
                            </div>
                          </div>
                          <span className={`taximeter text-sm ${ui.tint}`}>
                            {ui.sign}
                            {euro.format(t.amount)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </section>
            ))}
        </>
      )}
    </div>
  );
}
