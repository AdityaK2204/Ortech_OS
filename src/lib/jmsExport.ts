// exceljs + jspdf are ~1 MB minified — loaded on demand (dynamic import) so
// field phones never download the billing-export engine with the app shell.
import type * as ExcelJS from 'exceljs';
import {
  PAYABLE_ITEMS,
  RESTORATION_ITEMS,
  STRATA_META,
  toJmsRow,
  type JmsRow,
} from './measure';
import type { Measurement, PayableItem, Project, Strata } from '../types';

// ---------------------------------------------------------------------------
// Joint Measurement Sheet export — Excel / PDF / CSV.
// The Excel layout mirrors the company's existing JMS: yellow merged title
// block, grouped "Strata" / "Other Payable Items" / "Restoration" headers,
// bordered grid, totals row. The billing engineer downloads it; the
// supervisor never sees Excel.
// ---------------------------------------------------------------------------

export interface ExportPeriod {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

const STRATA_COLS = STRATA_META.map((s) => ({ key: s.value, label: s.label }));
const ITEM_COLS = PAYABLE_ITEMS;
const RESTO_COLS = RESTORATION_ITEMS;

// Fixed columns before the grouped ones.
const LEAD_COLS = [
  { header: 'S No', width: 6 },
  { header: 'Landmark / Location', width: 30 },
  { header: 'From', width: 9 },
  { header: 'To', width: 9 },
  { header: 'Depth', width: 8 },
  { header: 'Actual Length', width: 12 },
  { header: 'Payable Length', width: 12 },
];
const REMARKS_COL = { header: 'Remarks', width: 24 };

const TOTAL_COLS =
  LEAD_COLS.length + STRATA_COLS.length + ITEM_COLS.length + RESTO_COLS.length + 1;

function rows(measurements: Measurement[]): JmsRow[] {
  return measurements.map((m, i) => toJmsRow(m, i + 1));
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function baseFilename(project: Project, period: ExportPeriod): string {
  const slug = project.name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `JMS_${slug}_${period.from}_to_${period.to}`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --- Excel (.xlsx) — identical to the existing Joint Measurement Sheet ------

export async function exportExcel(
  project: Project,
  measurements: Measurement[],
  period: ExportPeriod
): Promise<void> {
  const mod = await import('exceljs');
  const Excel = (mod.default ?? mod) as typeof ExcelJS;
  const wb = new Excel.Workbook();
  wb.creator = 'ORTECH OS';
  const ws = wb.addWorksheet('JMS', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  const thin: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  };
  const yellow: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFFF00' },
  };
  const headerGray: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF2F2F2' },
  };
  const center: Partial<ExcelJS.Alignment> = {
    horizontal: 'center',
    vertical: 'middle',
    wrapText: true,
  };

  // --- Title block: yellow, merged, same wording as the existing sheet ------
  const titleLines = [
    'JOINT MEASUREMENT SHEET',
    'OF',
    project.name.toUpperCase(),
    'WITH EXTRA PAYABLE ITEMS',
  ];
  titleLines.forEach((text, i) => {
    const r = ws.getRow(i + 1);
    ws.mergeCells(i + 1, 1, i + 1, TOTAL_COLS);
    const cell = r.getCell(1);
    cell.value = text;
    cell.fill = yellow;
    cell.font = { bold: true, size: i === 0 ? 14 : i === 2 ? 12 : 11, name: 'Calibri' };
    cell.alignment = center;
    cell.border = thin;
    r.height = i === 0 ? 22 : 18;
  });

  // Period line
  ws.mergeCells(5, 1, 5, TOTAL_COLS);
  const periodCell = ws.getCell(5, 1);
  periodCell.value = `Client: ${project.client}   ·   Location: ${project.location}   ·   Period: ${fmtDate(period.from)} to ${fmtDate(period.to)}`;
  periodCell.font = { italic: true, size: 10 };
  periodCell.alignment = center;
  periodCell.border = thin;

  // --- Two-row column header with merged groups -----------------------------
  const H1 = 6;
  const H2 = 7;
  let col = 1;

  const styleHeader = (cell: ExcelJS.Cell, size = 10) => {
    cell.alignment = center;
    cell.font = { bold: true, size };
    cell.fill = headerGray;
    cell.border = thin;
  };

  // lead columns; "From"/"To" sit under a merged "Chainage" group header
  for (const c of LEAD_COLS) {
    if (c.header === 'From') {
      // merged "Chainage" over the two chainage columns
      ws.mergeCells(H1, col, H1, col + 1);
      const gc = ws.getCell(H1, col);
      gc.value = 'Chainage';
      styleHeader(gc);
      const f = ws.getCell(H2, col);
      f.value = 'From';
      styleHeader(f);
      ws.getColumn(col).width = c.width;
      col++;
      continue;
    }
    if (c.header === 'To') {
      const t = ws.getCell(H2, col);
      t.value = 'To';
      styleHeader(t);
      ws.getColumn(col).width = c.width;
      col++;
      continue;
    }
    ws.mergeCells(H1, col, H2, col);
    const cell = ws.getCell(H1, col);
    cell.value = c.header;
    styleHeader(cell);
    ws.getColumn(col).width = c.width;
    col++;
  }

  // grouped headers: Strata / Other Payable Items / Restoration
  const groups: { label: string; cols: { label: string }[] }[] = [
    { label: 'Strata', cols: STRATA_COLS },
    { label: 'Other Payable Items', cols: ITEM_COLS },
    { label: 'Restoration', cols: RESTO_COLS },
  ];
  for (const g of groups) {
    ws.mergeCells(H1, col, H1, col + g.cols.length - 1);
    const gc = ws.getCell(H1, col);
    gc.value = g.label;
    styleHeader(gc);
    for (const c of g.cols) {
      const cell = ws.getCell(H2, col);
      cell.value = c.label;
      styleHeader(cell, 9);
      ws.getColumn(col).width = 8;
      col++;
    }
  }

  // remarks (merged vertically)
  ws.mergeCells(H1, col, H2, col);
  const rc = ws.getCell(H1, col);
  rc.value = REMARKS_COL.header;
  styleHeader(rc);
  ws.getColumn(col).width = REMARKS_COL.width;

  // --- Data rows -------------------------------------------------------------
  const data = rows(measurements);
  let rowIdx = H2 + 1;
  for (const r of data) {
    const values: (string | number)[] = [
      r.sNo,
      r.landmark,
      r.from,
      r.to,
      r.depthCm,
      r.actualM,
      r.payableM,
      ...STRATA_COLS.map((s) => r.strata[s.key as Strata]),
      ...ITEM_COLS.map((i) => r.items[i.value as PayableItem]),
      ...RESTO_COLS.map((i) => r.items[i.value as PayableItem]),
      r.remarks,
    ];
    const row = ws.getRow(rowIdx);
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v === '' ? null : v;
      cell.border = thin;
      cell.font = { size: 10 };
      cell.alignment =
        i === 1 || i === values.length - 1
          ? { vertical: 'middle', wrapText: true }
          : center;
    });
    rowIdx++;
  }

  // --- Totals row --------------------------------------------------------------
  const sum = (fn: (r: JmsRow) => number | '') =>
    data.reduce((s, r) => s + (Number(fn(r)) || 0), 0);
  const totals: (string | number)[] = [
    '',
    'TOTAL',
    '',
    '',
    '',
    sum((r) => r.actualM),
    sum((r) => r.payableM),
    ...STRATA_COLS.map((s) => sum((r) => r.strata[s.key as Strata])),
    ...ITEM_COLS.map((i) => sum((r) => r.items[i.value as PayableItem])),
    ...RESTO_COLS.map((i) => sum((r) => r.items[i.value as PayableItem])),
    '',
  ];
  const totalRow = ws.getRow(rowIdx);
  totals.forEach((v, i) => {
    const cell = totalRow.getCell(i + 1);
    cell.value = v === '' ? null : v;
    cell.border = thin;
    cell.font = { bold: true, size: 10 };
    cell.fill = yellow;
    cell.alignment = center;
  });

  const buffer = await wb.xlsx.writeBuffer();
  download(
    new Blob([buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${baseFilename(project, period)}.xlsx`
  );
}

// --- CSV ----------------------------------------------------------------------

export function exportCsv(
  project: Project,
  measurements: Measurement[],
  period: ExportPeriod
): void {
  const head = [
    'S No',
    'Landmark / Location',
    'From',
    'To',
    'Depth',
    'Actual Length',
    'Payable Length',
    ...STRATA_COLS.map((s) => s.label),
    ...ITEM_COLS.map((i) => i.label),
    ...RESTO_COLS.map((i) => i.label),
    'Remarks',
  ];
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head.map(esc).join(',')];
  for (const r of rows(measurements)) {
    lines.push(
      [
        r.sNo,
        r.landmark,
        r.from,
        r.to,
        r.depthCm,
        r.actualM,
        r.payableM,
        ...STRATA_COLS.map((s) => r.strata[s.key as Strata]),
        ...ITEM_COLS.map((i) => r.items[i.value as PayableItem]),
        ...RESTO_COLS.map((i) => r.items[i.value as PayableItem]),
        r.remarks,
      ]
        .map(esc)
        .join(',')
    );
  }
  download(
    new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }),
    `${baseFilename(project, period)}.csv`
  );
}

// --- PDF ------------------------------------------------------------------------

export async function exportPdf(
  project: Project,
  measurements: Measurement[],
  period: ExportPeriod
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // Yellow title block
  doc.setFillColor(255, 255, 0);
  doc.rect(10, 8, pageW - 20, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('JOINT MEASUREMENT SHEET', pageW / 2, 14, { align: 'center' });
  doc.setFontSize(9);
  doc.text('OF', pageW / 2, 18.5, { align: 'center' });
  doc.setFontSize(11);
  doc.text(project.name.toUpperCase(), pageW / 2, 23, { align: 'center' });
  doc.setFontSize(9);
  doc.text('WITH EXTRA PAYABLE ITEMS', pageW / 2, 27.5, { align: 'center' });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.text(
    `Client: ${project.client}  ·  Location: ${project.location}  ·  Period: ${fmtDate(period.from)} to ${fmtDate(period.to)}`,
    pageW / 2,
    34,
    { align: 'center' }
  );

  const data = rows(measurements);
  const head = [
    [
      'S No',
      'Landmark / Location',
      'From',
      'To',
      'Depth',
      'Actual',
      'Payable',
      ...STRATA_COLS.map((s) => s.label),
      ...ITEM_COLS.map((i) => i.label),
      ...RESTO_COLS.map((i) => i.label),
      'Remarks',
    ],
  ];
  const body = data.map((r) => [
    r.sNo,
    r.landmark,
    r.from,
    r.to,
    r.depthCm,
    r.actualM,
    r.payableM,
    ...STRATA_COLS.map((s) => r.strata[s.key as Strata]),
    ...ITEM_COLS.map((i) => r.items[i.value as PayableItem]),
    ...RESTO_COLS.map((i) => r.items[i.value as PayableItem]),
    r.remarks,
  ]);
  const sum = (fn: (r: JmsRow) => number | '') =>
    data.reduce((s, r) => s + (Number(fn(r)) || 0), 0);
  body.push([
    '',
    'TOTAL',
    '',
    '',
    '',
    sum((r) => r.actualM),
    sum((r) => r.payableM),
    ...STRATA_COLS.map((s) => sum((r) => r.strata[s.key as Strata])),
    ...ITEM_COLS.map((i) => sum((r) => r.items[i.value as PayableItem])),
    ...RESTO_COLS.map((i) => sum((r) => r.items[i.value as PayableItem])),
    '',
  ]);

  autoTable(doc, {
    head,
    body,
    startY: 38,
    styles: { fontSize: 6.5, cellPadding: 1, halign: 'center', lineWidth: 0.1 },
    headStyles: { fillColor: [242, 242, 242], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'left', cellWidth: 34 } },
    didParseCell: (hook) => {
      if (hook.section === 'body' && hook.row.index === body.length - 1) {
        hook.cell.styles.fillColor = [255, 255, 0];
        hook.cell.styles.fontStyle = 'bold';
      }
    },
  });

  doc.save(`${baseFilename(project, period)}.pdf`);
}
