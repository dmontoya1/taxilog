import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  DayTransactions,
  RangeTransaction,
  ReportPreferences,
  SettlementDay,
  SettlementSummary,
  TransactionKind,
} from '@/lib/domain/settlement';

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);

const longDate = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' });
const shortDate = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
});

function parseLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export interface ReportInput {
  driverName: string;
  from: string; // YYYY-MM-DD
  to: string;
  days: SettlementDay[];
  summary: SettlementSummary;
  prefs: ReportPreferences;
  cardGoesToBoss: boolean;
  amexTransactions?: RangeTransaction[];
}

/** Construye el informe de liquidación para el jefe. Devuelve el documento. */
export function buildReportPdf({
  driverName,
  from,
  to,
  days,
  summary,
  prefs,
  cardGoesToBoss,
  amexTransactions = [],
}: ReportInput): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const amber: [number, number, number] = [204, 143, 0];
  const dark: [number, number, number] = [25, 27, 31];

  // ---------- Cabecera ----------
  doc.setFillColor(...dark);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Informe de liquidación', 14, 13);
  doc.setTextColor(230, 230, 230);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `${prefs.signature_name ?? driverName} · ${longDate.format(parseLocal(from))} — ${longDate.format(parseLocal(to))}`,
    14,
    21,
  );

  // ---------- Tabla día a día (columnas dinámicas según preferencias) ----------
  const visibleDays = prefs.show_rest_days ? days : days.filter((d) => !d.is_rest);

  const hasEmisora = days.some((d) => d.emisora > 0);
  type Col = { header: string; render: (day: SettlementDay) => string; align?: 'right' };
  const columns: Col[] = [
    { header: 'Día', render: (day) => shortDate.format(parseLocal(day.d)) },
  ];
  if (prefs.show_cash) {
    columns.push({ header: 'Efectivo', render: (day) => eur(day.cash), align: 'right' });
  }
  columns.push({ header: 'Datáfono', render: (day) => eur(day.card), align: 'right' });
  if (hasEmisora) {
    columns.push({ header: 'Emisora', render: (day) => day.emisora > 0 ? eur(day.emisora) : '—', align: 'right' });
  }
  if (prefs.show_cash) {
    columns.push({ header: 'Bruto', render: (day) => eur(day.gross), align: 'right' });
  }
  if (prefs.show_expenses) {
    columns.push({
      header: 'Gastos jefe',
      render: (day) => (day.boss_expense_share > 0 ? eur(day.boss_expense_share) : '—'),
      align: 'right',
    });
  }
  columns.push({
    header: 'Cuota jefe',
    render: (day) => (day.is_rest ? '—' : day.is_exempt ? 'Exento' : eur(day.boss_fee)),
    align: 'right',
  });
  columns.push({
    header: 'Estado',
    render: (day) => (day.is_rest ? 'Descanso' : day.is_exempt ? 'Libre trabajado' : 'Trabajado'),
  });

  const columnStyles: Record<number, { halign: 'right' }> = {};
  columns.forEach((c, i) => {
    if (c.align === 'right') columnStyles[i] = { halign: 'right' };
  });

  autoTable(doc, {
    startY: 36,
    head: [columns.map((c) => c.header)],
    body: visibleDays.map((day) => columns.map((c) => c.render(day))),
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: dark, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles,
    didParseCell: (data) => {
      if (data.section === 'body' && visibleDays[data.row.index]?.is_rest) {
        data.cell.styles.textColor = [150, 150, 150];
      }
    },
  });

  // ---------- Resumen ----------
  const afterTable =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
  let y = afterTable + 10;

  if (y > 240) {
    doc.addPage();
    y = 20;
  }

  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Resumen del período', 14, y);

  const daysWorked = days.filter((d) => !d.is_rest && !d.is_exempt).length;

  const lines: Array<[string, string]> = [];
  lines.push(['Días trabajados', `${daysWorked}`]);
  if (prefs.show_cash) lines.push(['Total efectivo', eur(summary.total_cash)]);
  lines.push([
    cardGoesToBoss ? 'Total datáfono (recibido por el jefe)' : 'Total datáfono',
    eur(summary.total_card),
  ]);
  if ((summary.total_emisora ?? 0) > 0) {
    lines.push(['Total emisoras (recibido por el jefe)', eur(summary.total_emisora ?? 0)]);
  }
  if (prefs.show_cash) lines.push(['Total bruto', eur(summary.total_gross)]);
  lines.push(['Corresponde al jefe (cuotas)', eur(summary.boss_due)]);
  if (prefs.show_expenses && summary.boss_expense_share > 0) {
    lines.push(['Gastos asumidos por el jefe', eur(summary.boss_expense_share)]);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  lines.forEach(([label, value], i) => {
    const ly = y + 8 + i * 6;
    doc.text(label, 14, ly);
    doc.text(value, 140, ly, { align: 'right' });
  });

  // ---------- Balance final ----------
  const by = y + 8 + lines.length * 6 + 6;
  const owesBoss = summary.balance > 0;
  const boxBg: [number, number, number] = owesBoss ? [255, 240, 214] : [222, 247, 233];
  const boxText: [number, number, number] = owesBoss ? amber : [22, 130, 80];

  doc.setFillColor(...boxBg);
  doc.roundedRect(14, by - 6, 126, 14, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...boxText);
  doc.text(
    summary.balance === 0
      ? 'Período en paz: nadie debe nada.'
      : owesBoss
        ? `El conductor entrega al jefe: ${eur(summary.balance)}`
        : `El jefe devuelve al conductor: ${eur(Math.abs(summary.balance))}`,
    18,
    by + 3,
  );

  // ---------- Sección AMEX (si hay pagos pendientes) ----------
  if (amexTransactions.length > 0) {
    const amexY = by + 20;
    const needsNewPage = amexY > 230;
    let ay = needsNewPage ? 20 : amexY;
    if (needsNewPage) doc.addPage();

    doc.setTextColor(40, 40, 40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Pagos AMEX (pendientes de liquidar)', 14, ay);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('Estos pagos tardan más en llegar. No se incluyen en el balance hasta que liquiden.', 14, ay + 6);

    autoTable(doc, {
      startY: ay + 10,
      head: [['Fecha', 'Importe', 'Notas']],
      body: amexTransactions.map((t) => [
        longDate.format(parseLocal(t.date)),
        eur(t.amount),
        t.notes ?? '—',
      ]),
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: [176, 122, 0], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right', cellWidth: 28 } },
    });

    const amexAfter =
      (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? ay + 30;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(176, 122, 0);
    const amexTotal = amexTransactions.reduce((s, t) => s + t.amount, 0);
    doc.text(`Total AMEX: ${eur(amexTotal)}`, 14, amexAfter + 6);
  }

  // ---------- Pie ----------
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    `Generado con TaxiLog · ${new Date().toLocaleDateString('es-ES')}`,
    14,
    doc.internal.pageSize.height - 10,
  );

  return doc;
}

/** Descarga el PDF directamente en el dispositivo. */
export async function sharePdf(doc: jsPDF, filename: string): Promise<void> {
  doc.save(filename);
}

// =============================================================
// Informe detallado del conductor: cada transacción, por día,
// con código de colores (verde efectivo, ámbar datáfono, rojo gasto).
// =============================================================

const KIND_COLOR: Record<TransactionKind, [number, number, number]> = {
  cash: [22, 130, 80], // verde
  card: [176, 122, 0], // ámbar oscuro (legible sobre blanco)
  emisora: [120, 86, 200], // morado (distinto del datáfono)
  expense: [192, 52, 52], // rojo
};

const KIND_LABEL: Record<TransactionKind, string> = {
  cash: 'Efectivo',
  card: 'Datáfono',
  emisora: 'Emisora',
  expense: 'Gasto',
};

const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const fullDay = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
});

export interface DetailedReportInput {
  driverName: string;
  from: string;
  to: string;
  days: DayTransactions[];
  settlementDays: SettlementDay[];
  summary: SettlementSummary;
}

const PAGE_BOTTOM = 275;
const INCOME_COLORS = {
  cash: KIND_COLOR.cash,
  card: KIND_COLOR.card,
  emisora: KIND_COLOR.emisora,
} as const;

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_BOTTOM) {
    doc.addPage();
    return 20;
  }
  return y;
}

function drawSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title, 14, y);
  return y + 6;
}

function drawKeyValueLines(
  doc: jsPDF,
  lines: Array<[string, string]>,
  y: number,
): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  lines.forEach(([label, value], i) => {
    const ly = y + i * 5.5;
    doc.setTextColor(80, 80, 80);
    doc.text(label, 14, ly);
    doc.setTextColor(40, 40, 40);
    doc.text(value, 196, ly, { align: 'right' });
  });
  return y + lines.length * 5.5 + 4;
}

function pct(part: number, total: number): string {
  if (total <= 0) return '0 %';
  return `${Math.round((part / total) * 100)} %`;
}

function drawStackedBar(
  doc: jsPDF,
  x: number,
  y: number,
  maxWidth: number,
  height: number,
  segments: Array<{ value: number; color: [number, number, number] }>,
  total: number,
): void {
  if (total <= 0) {
    doc.setFillColor(230, 230, 230);
    doc.rect(x, y, maxWidth, height, 'F');
    return;
  }
  let offset = 0;
  for (const seg of segments) {
    if (seg.value <= 0) continue;
    const w = (seg.value / total) * maxWidth;
    doc.setFillColor(...seg.color);
    doc.rect(x + offset, y, w, height, 'F');
    offset += w;
  }
}

function drawMethodLegend(
  doc: jsPDF,
  x: number,
  y: number,
  items: Array<{ label: string; value: number; color: [number, number, number]; total: number }>,
): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  let cy = y;
  for (const item of items) {
    if (item.value <= 0) continue;
    doc.setFillColor(...item.color);
    doc.rect(x, cy - 2.5, 3, 3, 'F');
    doc.setTextColor(60, 60, 60);
    doc.text(
      `${item.label}: ${eur(item.value)} (${pct(item.value, item.total)})`,
      x + 5,
      cy,
    );
    cy += 4.5;
  }
  return cy + 2;
}

export function buildDetailedReportPdf({
  driverName,
  from,
  to,
  days,
  settlementDays,
  summary,
}: DetailedReportInput): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const dark: [number, number, number] = [25, 27, 31];

  const daysWorked = settlementDays.filter((d) => !d.is_rest && !d.is_exempt);
  const restDays = settlementDays.filter((d) => d.is_rest).length;
  const exemptDays = settlementDays.filter((d) => d.is_exempt && !d.is_rest).length;
  const totalExpenses = days.reduce((s, d) => s + d.totalExpenses, 0);
  const driverExpenses = Math.max(0, totalExpenses - summary.boss_expense_share);
  const driverNet = summary.total_gross - summary.boss_due - driverExpenses;
  const avgPerWorkedDay =
    daysWorked.length > 0 ? summary.total_gross / daysWorked.length : 0;
  const totalTransactions = days.reduce((s, d) => s + d.transactions.length, 0);
  const incomeTransactions = days.reduce(
    (s, d) => s + d.transactions.filter((t) => t.kind !== 'expense').length,
    0,
  );

  const chartDays = settlementDays.filter((d) => d.gross > 0);
  const maxGross = Math.max(...chartDays.map((d) => d.gross), 1);

  const workedWithGross = daysWorked.filter((d) => d.gross > 0);
  const bestDay =
    workedWithGross.length > 0
      ? workedWithGross.reduce((a, b) => (b.gross > a.gross ? b : a))
      : null;
  const worstDay =
    workedWithGross.length > 0
      ? workedWithGross.reduce((a, b) => (b.gross < a.gross ? b : a))
      : null;

  // ---------- Cabecera ----------
  doc.setFillColor(...dark);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Detalle de movimientos', 14, 13);
  doc.setTextColor(230, 230, 230);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `${driverName} · ${longDate.format(parseLocal(from))} — ${longDate.format(parseLocal(to))}`,
    14,
    21,
  );

  let y = 38;

  // ---------- Resumen del período ----------
  y = drawSectionTitle(doc, 'Resumen del período', y);
  y = drawKeyValueLines(doc, [
    ['Días trabajados', `${daysWorked.length}`],
    ['Días de descanso', `${restDays}`],
    ['Días libres trabajados (exentos)', `${exemptDays}`],
    ['Total bruto', eur(summary.total_gross)],
    ['Total efectivo', eur(summary.total_cash)],
    ['Total datáfono', eur(summary.total_card)],
    ...(summary.total_emisora && summary.total_emisora > 0
      ? [['Total emisoras', eur(summary.total_emisora)] as [string, string]]
      : []),
    ['Total gastos', eur(totalExpenses)],
    ['Cuota del jefe', eur(summary.boss_due)],
    ['Gastos a tu cargo', eur(driverExpenses)],
    ['Ingreso neto estimado', eur(driverNet)],
    ['Media diaria (días trabajados)', eur(avgPerWorkedDay)],
    ['Transacciones (carreras + gastos)', `${totalTransactions}`],
    ['Carreras registradas', `${incomeTransactions}`],
  ], y);

  // ---------- Desglose por método ----------
  y = ensureSpace(doc, y, 28);
  y = drawSectionTitle(doc, 'Desglose por método de ingreso', y);
  const methodTotal = summary.total_gross;
  const methodSegments = [
    { value: summary.total_cash, color: INCOME_COLORS.cash },
    { value: summary.total_card, color: INCOME_COLORS.card },
    { value: summary.total_emisora ?? 0, color: INCOME_COLORS.emisora },
  ];
  drawStackedBar(doc, 14, y, 182, 6, methodSegments, methodTotal);
  y += 10;
  y = drawMethodLegend(doc, 14, y, [
    { label: 'Efectivo', value: summary.total_cash, color: INCOME_COLORS.cash, total: methodTotal },
    { label: 'Datáfono', value: summary.total_card, color: INCOME_COLORS.card, total: methodTotal },
    {
      label: 'Emisora',
      value: summary.total_emisora ?? 0,
      color: INCOME_COLORS.emisora,
      total: methodTotal,
    },
  ]);

  // ---------- Estadísticas comparativas ----------
  y = ensureSpace(doc, y, 34);
  y = drawSectionTitle(doc, 'Estadísticas comparativas', y);
  y = drawKeyValueLines(
    doc,
    [
      [
        'Mejor día',
        bestDay
          ? `${shortDate.format(parseLocal(bestDay.d))} · ${eur(bestDay.gross)}`
          : '—',
      ],
      [
        'Peor día (trabajado)',
        worstDay
          ? `${shortDate.format(parseLocal(worstDay.d))} · ${eur(worstDay.gross)}`
          : '—',
      ],
      ['Media por día trabajado', eur(avgPerWorkedDay)],
      ['Balance con el jefe', eur(summary.balance)],
      ['Carreras en el período', `${incomeTransactions}`],
    ],
    y,
  );

  // ---------- Gráfico: ingresos diarios ----------
  if (chartDays.length > 0) {
    const chartHeight = 8 + chartDays.length * 6;
    y = ensureSpace(doc, y, chartHeight + 8);
    y = drawSectionTitle(doc, 'Ingresos diarios', y);

    const barX = 38;
    const barMaxW = 132;
    const barH = 4;

    for (const day of chartDays) {
      y = ensureSpace(doc, y, 7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(60, 60, 60);
      doc.text(shortDate.format(parseLocal(day.d)), 14, y + 3);

      const segments = [
        { value: day.cash, color: INCOME_COLORS.cash },
        { value: day.card, color: INCOME_COLORS.card },
        { value: day.emisora, color: INCOME_COLORS.emisora },
      ];
      const scale = day.gross / maxGross;
      const barW = barMaxW * scale;
      drawStackedBar(doc, barX, y, barW, barH, segments, day.gross);

      doc.setTextColor(40, 40, 40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(eur(day.gross), 196, y + 3, { align: 'right' });
      y += 6;
    }
    y += 4;
  }

  // ---------- Tabla de transacciones (nueva página) ----------
  doc.addPage();
  y = 20;
  y = drawSectionTitle(doc, 'Movimientos por día', y);

  type RowKind = 'day' | TransactionKind;
  const rowKinds: RowKind[] = [];
  const body: Array<Array<string | { content: string; colSpan: number }>> = [];

  for (const day of days) {
    const totals = [
      day.totalCash > 0 ? `Efectivo ${eur(day.totalCash)}` : null,
      day.totalCard > 0 ? `Datáfono ${eur(day.totalCard)}` : null,
      day.totalEmisora > 0 ? `Emisora ${eur(day.totalEmisora)}` : null,
      day.totalExpenses > 0 ? `Gastos ${eur(day.totalExpenses)}` : null,
    ]
      .filter(Boolean)
      .join('  ·  ');

    const dayGross = day.totalCash + day.totalCard + day.totalEmisora;
    const settlement = settlementDays.find((d) => d.d === day.date);
    const statusTag = settlement?.is_rest
      ? ' · Descanso'
      : settlement?.is_exempt
        ? ' · Libre trabajado'
        : '';

    body.push([
      {
        content: `${fullDay.format(parseLocal(day.date))}${statusTag}   —   ${totals || 'Sin movimientos'}${dayGross > 0 ? `   ·   Bruto ${eur(dayGross)}` : ''}`,
        colSpan: 4,
      },
    ]);
    rowKinds.push('day');

    for (const t of day.transactions) {
      body.push([
        time.format(new Date(t.createdAt)),
        t.kind === 'emisora' ? t.label : KIND_LABEL[t.kind],
        t.kind === 'expense' ? t.label + (t.notes ? ` — ${t.notes}` : '') : (t.notes ?? ''),
        `${t.kind === 'expense' ? '-' : '+'}${eur(t.amount)}`,
      ]);
      rowKinds.push(t.kind);
    }
  }

  autoTable(doc, {
    startY: y,
    head: [['Hora', 'Tipo', 'Detalle', 'Importe']],
    body,
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: dark, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 28 }, 3: { halign: 'right', cellWidth: 28 } },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const kind = rowKinds[data.row.index];
      if (kind === 'day') {
        data.cell.styles.fillColor = [240, 240, 240];
        data.cell.styles.textColor = [40, 40, 40];
        data.cell.styles.fontStyle = 'bold';
        return;
      }
      if (data.column.index === 1 || data.column.index === 3) {
        data.cell.styles.textColor = KIND_COLOR[kind];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawPage: () => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Generado con TaxiLog · ${new Date().toLocaleDateString('es-ES')}`,
        14,
        doc.internal.pageSize.height - 10,
      );
    },
  });

  return doc;
}
