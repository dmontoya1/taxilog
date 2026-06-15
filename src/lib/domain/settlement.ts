import type { SupabaseClient } from '@supabase/supabase-js';
import type { VehicleType } from './rest-days';

export type FeeType = 'fixed' | 'percentage';

/** Método de ingreso. 'card' (datáfono) y 'emisora' van al jefe. */
export type IncomeMethod = 'cash' | 'card' | 'emisora';

export interface OdometerTotals {
  total_carreras: number;
  total_suplementos: number;
  dist_total: number;
  dist_ocupado: number;
  dist_libre: number;
  dist_off: number;
  tiempo_ocupado: number; // minutos
  tiempo_on: number; // minutos
  num_servicios: number;
}

/** Lecturas del taxímetro al cerrar el día (las "P" del recibo). */
export interface DayClosure {
  p_num_servicios: number | null;
  p_carreras: number | null;
  p_suplementos: number | null;
  p_dist_total: number | null;
  p_dist_ocupado: number | null;
  p_dist_libre: number | null;
  p_dist_off: number | null;
  p_tiempo_ocupado: number | null;
  p_tiempo_on: number | null;
}

export interface AgreementConfig {
  id: string;
  fee_type: FeeType;
  fee_value: number;
  weekday_rest: 1 | 2 | 3 | 4 | 5;
  weekend_work_parity: 'even' | 'odd';
  card_goes_to_boss: boolean;
  vehicle_type: VehicleType;
  valid_from: string;
  valid_to: string | null;
}

export interface SettlementSummary {
  total_cash: number;
  total_card: number;
  total_emisora?: number;
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
  card: number;         // datáfono SOLO
  emisora: number;      // emisora SOLO
  card_to_boss: number; // (datáfono si card_goes_to_boss) + emisora
  gross: number;
  expense_total: number;
  boss_expense_share: number;
  is_rest: boolean;
  is_exempt: boolean;
  boss_fee: number;
}

export interface ReportPreferences {
  show_cash: boolean;
  show_expenses: boolean;
  show_rest_days: boolean;
  signature_name: string | null;
}

export const DEFAULT_REPORT_PREFS: ReportPreferences = {
  show_cash: true,
  show_expenses: true,
  show_rest_days: true,
  signature_name: null,
};

export async function getReportPreferences(
  supabase: SupabaseClient,
): Promise<ReportPreferences> {
  const { data } = await supabase
    .from('report_preferences')
    .select('show_cash, show_expenses, show_rest_days, signature_name')
    .maybeSingle<ReportPreferences>();
  return data ?? DEFAULT_REPORT_PREFS;
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
    emisora: Number(d.emisora),
    card_to_boss: Number(d.card_to_boss),
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
  const total_emisora = days.reduce((s, d) => s + d.emisora, 0);
  const card_to_boss = days.reduce((s, d) => s + d.card_to_boss, 0);
  const boss_due = days.reduce((s, d) => s + d.boss_fee, 0);
  const boss_expense_share = days.reduce((s, d) => s + d.boss_expense_share, 0);
  return {
    total_cash,
    total_card,
    total_emisora,
    total_gross: total_cash + total_card + total_emisora,
    boss_due: round2(boss_due),
    boss_received: round2(card_to_boss),
    boss_expense_share: round2(boss_expense_share),
    balance: round2(boss_due - card_to_boss - boss_expense_share),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Transacciones crudas del período (informe detallado) ----------

export type TransactionKind = 'cash' | 'card' | 'emisora' | 'expense';

export interface RangeTransaction {
  kind: TransactionKind;
  id: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  amount: number;
  label: string;
  notes: string | null;
  is_amex?: boolean;
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
      .select('id, entry_date, method, amount, notes, created_at, is_amex, emisora:emisoras(name)')
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
    method: IncomeMethod;
    amount: number;
    notes: string | null;
    created_at: string;
    is_amex: boolean;
    emisora: { name: string } | null;
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

  const incomeLabel: Record<IncomeMethod, string> = {
    cash: 'Efectivo',
    card: 'Datáfono',
    emisora: 'Emisora',
  };

  const incomes = (inc.data as unknown as IncRow[]).map<RangeTransaction>((e) => ({
    kind: e.method,
    id: e.id,
    date: e.entry_date,
    createdAt: e.created_at,
    amount: Number(e.amount),
    label:
      e.method === 'emisora' && e.emisora?.name
        ? `${incomeLabel[e.method]} · ${e.emisora.name}`
        : e.method === 'card' && e.is_amex
          ? 'Datáfono · AMEX'
          : incomeLabel[e.method],
    notes: e.notes,
    is_amex: e.method === 'card' ? e.is_amex : undefined,
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
  totalEmisora: number;
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
    totalEmisora: round2(
      transactions.filter((t) => t.kind === 'emisora').reduce((s, t) => s + t.amount, 0),
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

// ---------- Taxímetro: acumulado histórico y cierre de día ----------

export async function getOdometerTotals(
  supabase: SupabaseClient,
): Promise<OdometerTotals | null> {
  const { data, error } = await supabase
    .from('odometer_totals')
    .select(
      'total_carreras, total_suplementos, dist_total, dist_ocupado, dist_libre, dist_off, tiempo_ocupado, tiempo_on, num_servicios',
    )
    .maybeSingle<OdometerTotals>();
  if (error) throw new Error(`Error leyendo el acumulado: ${error.message}`);
  return data
    ? {
        total_carreras: Number(data.total_carreras),
        total_suplementos: Number(data.total_suplementos),
        dist_total: Number(data.dist_total),
        dist_ocupado: Number(data.dist_ocupado),
        dist_libre: Number(data.dist_libre),
        dist_off: Number(data.dist_off),
        tiempo_ocupado: Number(data.tiempo_ocupado),
        tiempo_on: Number(data.tiempo_on),
        num_servicios: Number(data.num_servicios),
      }
    : null;
}

/** Siembra el acumulado inicial (onboarding). Upsert: reemplaza valores. */
export async function setOdometerTotals(
  supabase: SupabaseClient,
  userId: string,
  totals: OdometerTotals,
): Promise<void> {
  const { error } = await supabase
    .from('odometer_totals')
    .upsert({ user_id: userId, ...totals, updated_at: new Date().toISOString() }, {
      onConflict: 'user_id',
    });
  if (error) throw new Error(`Error guardando el acumulado: ${error.message}`);
}

/** Lectura del cierre de un día concreto (si existe). */
export async function getDayClosure(
  supabase: SupabaseClient,
  date: string,
): Promise<(DayClosure & { day_closed: boolean }) | null> {
  const { data, error } = await supabase
    .from('daily_records')
    .select(
      'day_closed, p_num_servicios, p_carreras, p_suplementos, p_dist_total, p_dist_ocupado, p_dist_libre, p_dist_off, p_tiempo_ocupado, p_tiempo_on',
    )
    .eq('work_date', date)
    .maybeSingle<DayClosure & { day_closed: boolean }>();
  if (error) throw new Error(`Error leyendo el cierre: ${error.message}`);
  return data;
}

/** Cierra el día vía RPC: guarda lecturas y actualiza el acumulado atómicamente. */
export async function closeDay(
  supabase: SupabaseClient,
  date: string,
  c: DayClosure,
): Promise<void> {
  const { error } = await supabase.rpc('close_day', {
    p_date: date,
    a_num_servicios: c.p_num_servicios,
    a_carreras: c.p_carreras,
    a_suplementos: c.p_suplementos,
    a_dist_total: c.p_dist_total,
    a_dist_ocupado: c.p_dist_ocupado,
    a_dist_libre: c.p_dist_libre,
    a_dist_off: c.p_dist_off,
    a_tiempo_ocupado: c.p_tiempo_ocupado,
    a_tiempo_on: c.p_tiempo_on,
  });
  if (error) throw new Error(`Error cerrando el día: ${error.message}`);
}

/** Formatea minutos como "Xh Ymin" para mostrar tiempos del taxímetro. */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

export const km = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 1,
});