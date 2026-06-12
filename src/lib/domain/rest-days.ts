/**
 * Reglas de días de descanso.
 *
 * - Lunes a viernes: descansa el día fijo configurado (weekdayRest, ISO 1-5).
 * - Sábado y domingo: cada día se evalúa POR SEPARADO contra la paridad del
 *   día del mes. 'even' = trabaja solo días pares; 'odd' = solo impares.
 *   Sin desempate: un finde 31/1 (ambos impares) significa descanso doble
 *   para quien trabaja el par, y doblete para quien trabaja el impar.
 *
 * Funciones puras sin dependencias: la fecha siempre se interpreta en local.
 */

export type WeekendParity = 'even' | 'odd';

export interface RestConfig {
  /** Día fijo de descanso, ISO: 1=lunes … 5=viernes */
  weekdayRest: 1 | 2 | 3 | 4 | 5;
  /** Paridad del día del mes que SÍ se trabaja en fin de semana */
  weekendWorkParity: WeekendParity;
}

/** Día de la semana ISO (1=lunes … 7=domingo) de una fecha local. */
export function isoWeekday(date: Date): number {
  const js = date.getDay(); // 0=domingo … 6=sábado
  return js === 0 ? 7 : js;
}

/** ¿Es sábado o domingo? */
export function isWeekend(date: Date): boolean {
  return isoWeekday(date) >= 6;
}

/**
 * ¿Es día de descanso según el acuerdo?
 * No contempla excepciones (días exentos trabajados): eso es un override
 * que vive en el registro diario, no en la regla.
 */
export function isRestDay(date: Date, config: RestConfig): boolean {
  if (isWeekend(date)) {
    const dayParity: WeekendParity = date.getDate() % 2 === 0 ? 'even' : 'odd';
    return dayParity !== config.weekendWorkParity;
  }
  return isoWeekday(date) === config.weekdayRest;
}

/** Construye una fecha local sin sorpresas de zona horaria. */
export function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

/** Parsea 'YYYY-MM-DD' como fecha LOCAL (new Date('YYYY-MM-DD') sería UTC). */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return localDate(y, m, d);
}

/** Formatea una fecha local como 'YYYY-MM-DD'. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  isRest: boolean;
}

/** Calendario esperado del mes completo según el acuerdo (para la UI). */
export function monthSchedule(
  year: number,
  month: number, // 1-12
  config: RestConfig,
): CalendarDay[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => {
    const date = localDate(year, month, i + 1);
    return { date: toIsoDate(date), isRest: isRestDay(date, config) };
  });
}
