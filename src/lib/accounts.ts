import type { Txn, TxnCategory, TxnStatus } from '../types';

// ---------------------------------------------------------------------------
// Accounts module — constants & pure helpers shared by every accounts screen.
// ---------------------------------------------------------------------------

export const TXN_CATEGORIES: { value: TxnCategory; label: string }[] = [
  { value: 'diesel', label: 'Diesel' },
  { value: 'materials', label: 'Materials' },
  { value: 'gst_invoice', label: 'GST invoice' },
  { value: 'cash_expense', label: 'Non-GST / cash expense' },
  { value: 'wages_advance', label: 'Wages / labour advance' },
  { value: 'toll_parking', label: 'Toll / parking' },
  { value: 'equipment_rental', label: 'Equipment rental' },
  { value: 'site_consumables', label: 'Site consumables' },
  { value: 'other', label: 'Other' },
];

export function categoryLabel(c: TxnCategory): string {
  return TXN_CATEGORIES.find((x) => x.value === c)?.label ?? c;
}

export const TXN_STATUS_META: Record<
  TxnStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  submitted: { label: 'Submitted', bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  under_review: { label: 'Under Review', bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  queried: { label: 'Queried', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  approved: { label: 'Approved', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
  disbursed: { label: 'Disbursed', bg: 'bg-teal-50', text: 'text-teal-800', dot: 'bg-teal-600' },
  reversed: { label: 'Reversed', bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-400' },
};

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank transfer' },
] as const;

export const PAID_VIA = [
  { value: '', label: 'Not paid yet' },
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'paid_by_supervisor', label: 'Paid by me (reimburse)' },
] as const;

/** Statuses that still need accountant attention (the queue). */
export const QUEUE_STATUSES: TxnStatus[] = ['submitted', 'under_review', 'queried'];

export function isFlagged(t: Txn): boolean {
  return t.flaggedDuplicate || t.flaggedDieselAnomaly;
}

/** Queue sort: flags first, then oldest first. */
export function queueSort(a: Txn, b: Txn): number {
  const fa = isFlagged(a) ? 0 : 1;
  const fb = isFlagged(b) ? 0 : 1;
  if (fa !== fb) return fa - fb;
  return a.submittedAt.localeCompare(b.submittedAt);
}

export function formatINR(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** Simple client-side duplicate check (server trigger is authoritative). */
export function looksDuplicate(txns: Txn[], candidate: { projectId: string; vendorName: string; amount: number }): boolean {
  const cutoff = Date.now() - 72 * 3600 * 1000;
  return txns.some(
    (t) =>
      t.projectId === candidate.projectId &&
      t.vendorName.trim().toLowerCase() === candidate.vendorName.trim().toLowerCase() &&
      t.amount === candidate.amount &&
      t.status !== 'reversed' &&
      new Date(t.submittedAt).getTime() > cutoff
  );
}

/** Running ledger rollups for the accountant / admin views. */
export interface LedgerRollup {
  totalDisbursed: number;
  totalApprovedUnpaid: number;
  totalPending: number;
  byCategory: { category: TxnCategory; amount: number }[];
  byProject: { projectId: string; amount: number }[];
}

export function rollup(txns: Txn[]): LedgerRollup {
  const disbursed = txns.filter((t) => t.status === 'disbursed');
  const approved = txns.filter((t) => t.status === 'approved');
  const pending = txns.filter((t) => QUEUE_STATUSES.includes(t.status));

  const byCat = new Map<TxnCategory, number>();
  const byProj = new Map<string, number>();
  for (const t of disbursed) {
    byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount);
    byProj.set(t.projectId, (byProj.get(t.projectId) ?? 0) + t.amount);
  }

  return {
    totalDisbursed: disbursed.reduce((s, t) => s + t.amount, 0),
    totalApprovedUnpaid: approved.reduce((s, t) => s + t.amount, 0),
    totalPending: pending.reduce((s, t) => s + t.amount, 0),
    byCategory: [...byCat.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    byProject: [...byProj.entries()]
      .map(([projectId, amount]) => ({ projectId, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}
