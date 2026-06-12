import type { SupabaseClient } from '@supabase/supabase-js';

export type FeeType = 'fixed' | 'percentage';

export interface AgreementConfig {
  id: string;
  fee_type: FeeType;
  fee_value: number;
  weekday_rest: 1 | 2 | 3 | 4 | 5;
  weekend_work_parity: 'even' | 'odd';
  valid_from: string;
  valid_to: string | null;
}

export interface SettlementSummary {
  total_cash: number;
  total_card: number;
  total_gross: number;
  boss_due: number;
  boss_received: number;
  boss_expense_share: number;
  /** > 0: el conductor paga al jefe. < 0: el jefe devuelve. */
  balance: number;
}

export interface SettlementDay {
  d: string; // YYYY-MM-DD
  cash: number;
  card: number;
  gross: number;
  expense_total: number;
  boss_expense_share: number;
  is_rest: boolean;
  is_exempt: boolean;
  boss_fee: number;
}

/** Desglose día a día del período. La lógica vive en Postgres (settlement_days). */
export async function getSettlementDays(
  supabase: SupabaseClient,
  from: string,
  to: string,
): Promise<SettlementDay[]> {
  const { data, error } = await supabase.rpc('settlement_days', {
    p_from: from,
    p_to: to,
  });

  if (error) throw new Error(`Error cargando el desglose: ${error.message}`);
  return (data as SettlementDay[]).map((d) => ({
    ...d,
    cash: Number(d.cash),
    card: Number(d.card),
    gross: Number(d.gross),
    expense_total: Number(d.expense_total),
    boss_expense_share: Number(d.boss_expense_share),
    boss_fee: Number(d.boss_fee),
  }));
}

/** Agrega el desglose en cliente: garantiza que tabla, resumen y PDF coinciden. */
export function summarizeDays(days: SettlementDay[]): SettlementSummary {
  const total_cash = days.reduce((s, d) => s + d.cash, 0);
  const total_card = days.reduce((s, d) => s + d.card, 0);
  const boss_due = days.reduce((s, d) => s + d.boss_fee, 0);
  const boss_expense_share = days.reduce((s, d) => s + d.boss_expense_share, 0);
  return {
    total_cash,
    total_card,
    total_gross: total_cash + total_card,
    boss_due: round2(boss_due),
    boss_received: total_card,
    boss_expense_share: round2(boss_expense_share),
    balance: round2(boss_due - total_card - boss_expense_share),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Transacciones crudas del período (informe detallado) ----------

export type TransactionKind = 'cash' | 'card' | 'expense';

export interface RangeTransaction {
  kind: TransactionKind;
  id: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  amount: number;
  label: string;
  notes: string | null;
}

/** Todas las transacciones del rango: ingresos (efectivo/datáfono) y gastos. */
export async function getRangeTransactions(
  supabase: SupabaseClient,
  from: string,
  to: string,
): Promise<RangeTransaction[]> {
  const [inc, exp] = await Promise.all([
    supabase
      .from('income_entries')
      .select('id, entry_date, method, amount, notes, created_at')
      .gte('entry_date', from)
      .lte('entry_date', to),
    supabase
      .from('expenses')
      .select('id, expense_date, amount, boss_share, notes, created_at, category:expense_categories(name)')
      .gte('expense_date', from)
      .lte('expense_date', to),
  ]);

  if (inc.error) throw new Error(`Error cargando ingresos: ${inc.error.message}`);
  if (exp.error) throw new Error(`Error cargando gastos: ${exp.error.message}`);

  type IncRow = {
    id: string;
    entry_date: string;
    method: 'cash' | 'card';
    amount: number;
    notes: string | null;
    created_at: string;
  };
  type ExpRow = {
    id: string;
    expense_date: string;
    amount: number;
    boss_share: number;
    notes: string | null;
    created_at: string;
    category: { name: string } | null;
  };

  const incomes = (inc.data as IncRow[]).map<RangeTransaction>((e) => ({
    kind: e.method,
    id: e.id,
    date: e.entry_date,
    createdAt: e.created_at,
    amount: Number(e.amount),
    label: e.method === 'cash' ? 'Efectivo' : 'Datáfono',
    notes: e.notes,
  }));

  const expenses = (exp.data as unknown as ExpRow[]).map<RangeTransaction>((e) => ({
    kind: 'expense',
    id: e.id,
    date: e.expense_date,
    createdAt: e.created_at,
    amount: Number(e.amount),
    label:
      (e.category?.name ?? 'Gasto') +
      (Number(e.boss_share) > 0 ? ` · jefe ${Number(e.boss_share)}%` : ''),
    notes: e.notes,
  }));

  return [...incomes, ...expenses].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
  );
}

export interface DayTransactions {
  date: string;
  transactions: RangeTransaction[];
  totalCash: number;
  totalCard: number;
  totalExpenses: number;
}

/** Agrupa las transacciones por día, con totales por tipo. */
export function groupTransactionsByDay(txs: RangeTransaction[]): DayTransactions[] {
  const map = new Map<string, RangeTransaction[]>();
  for (const t of txs) {
    const list = map.get(t.date) ?? [];
    list.push(t);
    map.set(t.date, list);
  }
  return [...map.entries()].map(([date, transactions]) => ({
    date,
    transactions,
    totalCash: round2(
      transactions.filter((t) => t.kind === 'cash').reduce((s, t) => s + t.amount, 0),
    ),
    totalCard: round2(
      transactions.filter((t) => t.kind === 'card').reduce((s, t) => s + t.amount, 0),
    ),
    totalExpenses: round2(
      transactions.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0),
    ),
  }));
}

/** Cuadre del período. La lógica vive en Postgres (settlement_summary). */
export async function getSettlement(
  supabase: SupabaseClient,
  from: string, // YYYY-MM-DD
  to: string,
): Promise<SettlementSummary> {
  const { data, error } = await supabase
    .rpc('settlement_summary', { p_from: from, p_to: to })
    .single<SettlementSummary>();

  if (error) throw new Error(`Error calculando el cuadre: ${error.message}`);
  return data;
}

/** Acuerdo vigente en una fecha dada (o null si no hay ninguno). */
export async function getActiveAgreement(
  supabase: SupabaseClient,
  onDate: string,
): Promise<AgreementConfig | null> {
  const { data, error } = await supabase
    .from('agreement_configs')
    .select('*')
    .lte('valid_from', onDate)
    .or(`valid_to.is.null,valid_to.gte.${onDate}`)
    .order('valid_from', { ascending: false })
    .limit(1)
    .maybeSingle<AgreementConfig>();

  if (error) throw new Error(`Error leyendo el acuerdo: ${error.message}`);
  return data;
}

/** Rango [primer día, último día] del mes en formato ISO local. */
export function monthRange(year: number, month: number): [string, string] {
  const last = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return [`${year}-${mm}-01`, `${year}-${mm}-${String(last).padStart(2, '0')}`];
}

export const euro = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});
