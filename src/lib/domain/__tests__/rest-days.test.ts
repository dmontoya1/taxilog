import { describe, expect, it } from 'vitest';
import {
  currentWorkday,
  isRestDay,
  localDate,
  monthSchedule,
  parseLocalDate,
  type RestConfig,
} from '../rest-days';

// Config del papá de Dani: descansa lunes, trabaja el día PAR del finde.
const papa: RestConfig = { weekdayRest: 1, weekendWorkParity: 'even', vehicleType: 'gasoline' };
// Conductor opuesto: descansa miércoles, trabaja el día IMPAR del finde.
const otro: RestConfig = { weekdayRest: 3, weekendWorkParity: 'odd', vehicleType: 'gasoline' };

describe('día fijo de descanso entre semana', () => {
  it('descansa su lunes', () => {
    // Lunes 9 de junio de 2025
    expect(isRestDay(localDate(2025, 6, 9), papa)).toBe(true);
  });

  it('trabaja los demás días de semana', () => {
    expect(isRestDay(localDate(2025, 6, 10), papa)).toBe(false); // martes
    expect(isRestDay(localDate(2025, 6, 13), papa)).toBe(false); // viernes
  });

  it('respeta un día fijo distinto (miércoles)', () => {
    expect(isRestDay(localDate(2025, 6, 11), otro)).toBe(true); // miércoles
    expect(isRestDay(localDate(2025, 6, 9), otro)).toBe(false); // lunes
  });
});

describe('fin de semana por paridad del día del mes', () => {
  it('ejemplo de Dani: sábado 15 descansa, domingo 16 trabaja (paridad par)', () => {
    // Noviembre 2025: sábado 15, domingo 16
    expect(isRestDay(localDate(2025, 11, 15), papa)).toBe(true);
    expect(isRestDay(localDate(2025, 11, 16), papa)).toBe(false);
  });

  it('el conductor de paridad impar hace lo inverso ese finde', () => {
    expect(isRestDay(localDate(2025, 11, 15), otro)).toBe(false);
    expect(isRestDay(localDate(2025, 11, 16), otro)).toBe(true);
  });

  it('finde 31/1: quien trabaja el PAR descansa ambos días', () => {
    // Enero 31 de 2026 es sábado; febrero 1 es domingo. Ambos impares.
    expect(isRestDay(localDate(2026, 1, 31), papa)).toBe(true);
    expect(isRestDay(localDate(2026, 2, 1), papa)).toBe(true);
  });

  it('finde 31/1: quien trabaja el IMPAR trabaja ambos días', () => {
    expect(isRestDay(localDate(2026, 1, 31), otro)).toBe(false);
    expect(isRestDay(localDate(2026, 2, 1), otro)).toBe(false);
  });

  it('finde 30/31: un día cada uno, sin doble descanso', () => {
    // Mayo 2026: sábado 30, domingo 31
    expect(isRestDay(localDate(2026, 5, 30), papa)).toBe(false); // 30 par → trabaja
    expect(isRestDay(localDate(2026, 5, 31), papa)).toBe(true); // 31 impar → descansa
  });
});

describe('tipo de vehículo: solo gasolina descansa obligatorio', () => {
  it('eléctrico nunca tiene descanso obligatorio', () => {
    const electrico: RestConfig = { weekdayRest: 1, weekendWorkParity: 'even', vehicleType: 'electric' };
    expect(isRestDay(localDate(2025, 6, 9), electrico)).toBe(false); // su "lunes de descanso"
    expect(isRestDay(localDate(2025, 11, 15), electrico)).toBe(false); // finde
  });

  it('eurotaxi nunca tiene descanso obligatorio', () => {
    const euro: RestConfig = { weekdayRest: 1, weekendWorkParity: 'even', vehicleType: 'eurotaxi' };
    expect(isRestDay(localDate(2025, 6, 9), euro)).toBe(false);
    expect(isRestDay(localDate(2026, 1, 31), euro)).toBe(false);
  });
});

describe('corte de jornada a las 6:00 (currentWorkday)', () => {
  it('a las 05:59 la jornada es el día anterior', () => {
    expect(currentWorkday(new Date(2026, 5, 14, 5, 59))).toBe('2026-06-13');
  });

  it('a las 06:00 la jornada es el mismo día', () => {
    expect(currentWorkday(new Date(2026, 5, 14, 6, 0))).toBe('2026-06-14');
  });

  it('a las 23:59 la jornada es el mismo día', () => {
    expect(currentWorkday(new Date(2026, 5, 14, 23, 59))).toBe('2026-06-14');
  });

  it('a las 03:00 del día 1 retrocede al último día del mes anterior', () => {
    expect(currentWorkday(new Date(2026, 5, 1, 3, 0))).toBe('2026-05-31');
  });
});

describe('utilidades de fecha', () => {
  it('parseLocalDate interpreta YYYY-MM-DD en local, no UTC', () => {
    const d = parseLocalDate('2026-01-31');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(31);
  });

  it('monthSchedule de junio 2025 marca 4 lunes + findes correctos para papá', () => {
    const schedule = monthSchedule(2025, 6, papa);
    expect(schedule).toHaveLength(30);
    const restDates = schedule.filter((d) => d.isRest).map((d) => d.date);
    // Lunes: 2, 9, 16, 23, 30. Sábados/domingos impares: 1, 7, 15, 21, 29.
    expect(restDates).toEqual([
      '2025-06-01',
      '2025-06-02',
      '2025-06-07',
      '2025-06-09',
      '2025-06-15',
      '2025-06-16',
      '2025-06-21',
      '2025-06-23',
      '2025-06-29',
      '2025-06-30',
    ]);
  });
});
