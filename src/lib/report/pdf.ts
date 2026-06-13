import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  DayTransactions,
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
}: ReportInput): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const amber: [number, number, number] = [204, 143, 0];
  const dark: [number, number, number] = [25, 27, 31];

  // ---------- Cabecera ----------
  doc.setFillColor(...dark);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(255, 180, 0);
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

  type Col = { header: string; render: (day: SettlementDay) => string; align?: 'right' };
  const columns: Col[] = [
    { header: 'Día', render: (day) => shortDate.format(parseLocal(day.d)) },
  ];
  if (prefs.show_cash) {
    columns.push({ header: 'Efectivo', render: (day) => eur(day.cash), align: 'right' });
  }
  columns.push({ header: 'Datáfono', render: (day) => eur(day.card), align: 'right' });
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
    headStyles: { fillColor: dark, textColor: [255, 180, 0], fontStyle: 'bold' },
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

  const lines: Array<[string, string]> = [];
  if (prefs.show_cash) lines.push(['Total efectivo', eur(summary.total_cash)]);
  lines.push([
    cardGoesToBoss ? 'Total datáfono (recibido por el jefe)' : 'Total datáfono',
    eur(summary.total_card),
  ]);
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

/** Comparte el PDF por el share sheet del sistema (WhatsApp, email…) o lo descarga. */
export async function sharePdf(doc: jsPDF, filename: string): Promise<void> {
  const blob = doc.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });

  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch {
      // Usuario canceló el share: no es un error, no descargamos a la fuerza.
      return;
    }
  }
  doc.save(filename);
}

// =============================================================
// Informe detallado del conductor: cada transacción, por día,
// con código de colores (verde efectivo, ámbar datáfono, rojo gasto).
// =============================================================

const KIND_COLOR: Record<TransactionKind, [number, number, number]> = {
  cash: [22, 130, 80], // verde
  card: [176, 122, 0], // ámbar oscuro (legible sobre blanco)
  expense: [192, 52, 52], // rojo
};

const KIND_LABEL: Record<TransactionKind, string> = {
  cash: 'Efectivo',
  card: 'Datáfono',
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
}

export function buildDetailedReportPdf({
  driverName,
  from,
  to,
  days,
}: DetailedReportInput): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const dark: [number, number, number] = [25, 27, 31];

  // ---------- Cabecera ----------
  doc.setFillColor(...dark);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(255, 180, 0);
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

  // ---------- Cuerpo: separador por día + filas de transacciones ----------
  type RowKind = 'day' | TransactionKind;
  const rowKinds: RowKind[] = [];
  const body: Array<Array<string | { content: string; colSpan: number }>> = [];

  for (const day of days) {
    const totals = [
      day.totalCash > 0 ? `Efectivo ${eur(day.totalCash)}` : null,
      day.totalCard > 0 ? `Datáfono ${eur(day.totalCard)}` : null,
      day.totalExpenses > 0 ? `Gastos ${eur(day.totalExpenses)}` : null,
    ]
      .filter(Boolean)
      .join('  ·  ');

    body.push([
      {
        content: `${fullDay.format(parseLocal(day.date))}   —   ${totals || 'Sin movimientos'}`,
        colSpan: 4,
      },
    ]);
    rowKinds.push('day');

    for (const t of day.transactions) {
      body.push([
        time.format(new Date(t.createdAt)),
        KIND_LABEL[t.kind],
        t.kind === 'expense' ? t.label + (t.notes ? ` — ${t.notes}` : '') : (t.notes ?? ''),
        `${t.kind === 'expense' ? '-' : '+'}${eur(t.amount)}`,
      ]);
      rowKinds.push(t.kind);
    }
  }

  autoTable(doc, {
    startY: 36,
    head: [['Hora', 'Tipo', 'Detalle', 'Importe']],
    body,
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: dark, textColor: [255, 180, 0], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 24 }, 3: { halign: 'right', cellWidth: 28 } },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const kind = rowKinds[data.row.index];
      if (kind === 'day') {
        data.cell.styles.fillColor = [240, 240, 240];
        data.cell.styles.textColor = [40, 40, 40];
        data.cell.styles.fontStyle = 'bold';
        return;
      }
      // Tipo e importe en el color de su categoría
      if (data.column.index === 1 || data.column.index === 3) {
        data.cell.styles.textColor = KIND_COLOR[kind];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

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
