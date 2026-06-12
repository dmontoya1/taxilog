import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  DayTransactions,
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
}

/** Construye el informe de liquidación para el jefe. Devuelve el documento. */
export function buildReportPdf({ driverName, from, to, days, summary }: ReportInput): jsPDF {
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
    `${driverName} · ${longDate.format(parseLocal(from))} — ${longDate.format(parseLocal(to))}`,
    14,
    21,
  );

  // ---------- Tabla día a día ----------
  autoTable(doc, {
    startY: 36,
    head: [['Día', 'Efectivo', 'Datáfono', 'Bruto', 'Gastos jefe', 'Cuota jefe', 'Estado']],
    body: days.map((day) => [
      shortDate.format(parseLocal(day.d)),
      eur(day.cash),
      eur(day.card),
      eur(day.gross),
      day.boss_expense_share > 0 ? eur(day.boss_expense_share) : '—',
      day.is_rest ? '—' : day.is_exempt ? 'Exento' : eur(day.boss_fee),
      day.is_rest ? 'Descanso' : day.is_exempt ? 'Libre trabajado' : 'Trabajado',
    ]),
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: dark, textColor: [255, 180, 0], fontStyle: 'bold' },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    didParseCell: (data) => {
      // Filas de descanso en gris para lectura rápida
      if (data.section === 'body' && days[data.row.index]?.is_rest) {
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

  const lines: Array<[string, string]> = [
    ['Total efectivo', eur(summary.total_cash)],
    ['Total datáfono (recibido por el jefe)', eur(summary.total_card)],
    ['Total bruto', eur(summary.total_gross)],
    ['Corresponde al jefe (cuotas)', eur(summary.boss_due)],
    ['Gastos asumidos por el jefe', eur(summary.boss_expense_share)],
  ];

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
