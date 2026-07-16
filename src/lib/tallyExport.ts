import { categoryLabel } from './accounts';
import type { Project, Txn } from '../types';

// ---------------------------------------------------------------------------
// Tally-ready export (Phase 1 — zero extra infrastructure).
//
//   ORTECH OS field   →  Tally field
//   Category          →  Voucher type (Purchase for GST invoices, Payment else)
//   Site / project    →  Cost Centre (1:1 — site-level spend flows into Tally)
//   Vendor            →  Party ledger
//   Amount/GST split  →  Amount + CGST/SGST ledgers
//   Description       →  Narration
//   Disbursement date →  Voucher date
//
// The XML imports via Gateway of Tally → Import Data → Vouchers.
// ---------------------------------------------------------------------------

export interface TallyFilters {
  from: string; // YYYY-MM-DD
  to: string;
  projectId?: string;
  category?: string;
  supervisorName?: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Tally voucher dates are YYYYMMDD. */
function tallyDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '');
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function filename(filters: TallyFilters, ext: string): string {
  return `Tally_${filters.from}_to_${filters.to}${filters.projectId ? `_${filters.projectId}` : ''}.${ext}`;
}

/** Effective voucher date: the disbursement date (fall back to submission). */
export type TxnWithDate = Txn & { voucherDate: string };

function voucherXml(t: TxnWithDate, siteName: string): string {
  const isGst = t.gstApplicable && (t.gstAmount ?? 0) > 0;
  const vchType = isGst ? 'Purchase' : 'Payment';
  const base = isGst ? (t.baseAmount ?? t.amount - (t.gstAmount ?? 0)) : t.amount;
  const gst = isGst ? (t.gstAmount ?? 0) : 0;
  const half = Math.round((gst / 2) * 100) / 100;
  const narration = `${categoryLabel(t.category)} — ${t.description}${t.supervisorName ? ` (by ${t.supervisorName})` : ''}`;

  // Ledger lines: expense (debit, with cost centre) [+ CGST + SGST], party (credit)
  const lines: string[] = [];
  lines.push(`
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${esc(categoryLabel(t.category))}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>-${base.toFixed(2)}</AMOUNT>
          <CATEGORYALLOCATIONS.LIST>
            <CATEGORY>Primary Cost Category</CATEGORY>
            <COSTCENTREALLOCATIONS.LIST>
              <NAME>${esc(siteName)}</NAME>
              <AMOUNT>-${base.toFixed(2)}</AMOUNT>
            </COSTCENTREALLOCATIONS.LIST>
          </CATEGORYALLOCATIONS.LIST>
        </ALLLEDGERENTRIES.LIST>`);
  if (isGst) {
    for (const ledger of ['CGST', 'SGST'] as const) {
      lines.push(`
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${ledger}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>-${half.toFixed(2)}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>`);
    }
  }
  lines.push(`
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${esc(t.vendorName)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${t.amount.toFixed(2)}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>`);

  return `
      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="${vchType}" ACTION="Create">
          <DATE>${tallyDate(t.voucherDate)}</DATE>
          <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>
          <VOUCHERNUMBER>${esc(t.id.slice(0, 8).toUpperCase())}</VOUCHERNUMBER>
          <PARTYLEDGERNAME>${esc(t.vendorName)}</PARTYLEDGERNAME>
          <NARRATION>${esc(narration)}</NARRATION>${
            t.vendorGstin ? `\n          <PARTYGSTIN>${esc(t.vendorGstin)}</PARTYGSTIN>` : ''
          }${lines.join('')}
        </VOUCHER>
      </TALLYMESSAGE>`;
}

/** Tally XML voucher import file for the given (already filtered) txns. */
export function exportTallyXml(
  txns: TxnWithDate[],
  projects: Project[],
  filters: TallyFilters
): void {
  const siteName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>${txns.map((t) => voucherXml(t, siteName(t.projectId))).join('')}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
`;
  download(xml, filename(filters, 'xml'), 'application/xml');
}

/** CSV fallback for accountants who review before import. */
export function exportTallyCsv(
  txns: TxnWithDate[],
  projects: Project[],
  filters: TallyFilters
): void {
  const siteName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = [
    'Voucher Date',
    'Voucher Type',
    'Voucher No',
    'Party Ledger (Vendor)',
    'Vendor GSTIN',
    'Cost Centre (Site)',
    'Category',
    'Base Amount',
    'GST Amount',
    'Total Amount',
    'Narration',
    'Submitted By',
    'Status',
  ];
  const rows = txns.map((t) => {
    const isGst = t.gstApplicable && (t.gstAmount ?? 0) > 0;
    return [
      t.voucherDate.slice(0, 10),
      isGst ? 'Purchase' : 'Payment',
      t.id.slice(0, 8).toUpperCase(),
      t.vendorName,
      t.vendorGstin ?? '',
      siteName(t.projectId),
      categoryLabel(t.category),
      (isGst ? (t.baseAmount ?? t.amount - (t.gstAmount ?? 0)) : t.amount).toFixed(2),
      (isGst ? (t.gstAmount ?? 0) : 0).toFixed(2),
      t.amount.toFixed(2),
      t.description,
      t.supervisorName,
      t.status,
    ];
  });
  const csv = [head, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  download(csv, filename(filters, 'csv'), 'text/csv;charset=utf-8');
}
