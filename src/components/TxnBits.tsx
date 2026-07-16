import { useState } from 'react';
import { useAccounts } from '../store/AccountsContext';
import {
  TXN_STATUS_META,
  categoryLabel,
  formatINR,
  isFlagged,
} from '../lib/accounts';
import { relativeTime } from '../lib/progress';
import type { Txn, TxnReview } from '../types';

// ---------------------------------------------------------------------------
// Shared Accounts UI pieces used by the supervisor, accountant, and admin
// views: status pill, flag badges, and the read-only transaction detail
// (photo, GST breakup, full append-only audit trail).
// ---------------------------------------------------------------------------

export function TxnStatusPill({ status }: { status: Txn['status'] }) {
  const meta = TXN_STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.bg} ${meta.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

export function TxnFlags({ txn }: { txn: Txn }) {
  if (!isFlagged(txn)) return null;
  return (
    <span className="inline-flex gap-1">
      {txn.flaggedDuplicate && (
        <span
          className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700"
          title="Same amount + vendor + site within 72 hours"
        >
          ⚠ DUPLICATE?
        </span>
      )}
      {txn.flaggedDieselAnomaly && (
        <span
          className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700"
          title="Claimed diesel is out of line with the machine's logged usage"
        >
          ⚠ DIESEL
        </span>
      )}
    </span>
  );
}

const ACTION_LABEL: Record<TxnReview['action'], string> = {
  under_review: 'took under review',
  queried: 'queried',
  approved: 'approved',
  rejected: 'rejected',
  clarified: 'clarified',
  admin_flag: 'flagged for review',
};

/** Full read-only record: what was claimed, evidence, and every action taken. */
export function TxnDetail({
  txn,
  siteName,
}: {
  txn: Txn;
  siteName: string;
}) {
  const { reviewsFor, disbursementFor, coApprovalFor } = useAccounts();
  const trail = reviewsFor(txn.id);
  const disb = disbursementFor(txn.id);
  const co = coApprovalFor(txn.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-2xl font-bold tabular-nums text-slate-900">
            {formatINR(txn.amount)}
          </div>
          <div className="text-xs text-slate-500">
            {categoryLabel(txn.category)} · {siteName}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <TxnStatusPill status={txn.status} />
          <TxnFlags txn={txn} />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm">
        <Item label="Vendor / paid to" value={txn.vendorName} />
        <Item
          label="Submitted"
          value={`${txn.supervisorName} · ${relativeTime(txn.submittedAt)}`}
        />
        {txn.gstApplicable && (
          <>
            <Item
              label="GST breakup"
              value={`Base ${formatINR(txn.baseAmount ?? 0)} + GST ${formatINR(txn.gstAmount ?? 0)}`}
            />
            <Item label="Vendor GSTIN" value={txn.vendorGstin || '—'} />
          </>
        )}
        {txn.paymentMethodUsed && (
          <Item
            label="Already paid via"
            value={
              txn.paymentMethodUsed === 'paid_by_supervisor'
                ? 'Supervisor (reimburse)'
                : txn.paymentMethodUsed.toUpperCase()
            }
          />
        )}
        <div className="col-span-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Description
          </dt>
          <dd className="mt-0.5 text-slate-700">{txn.description}</dd>
        </div>
      </dl>

      {/* Bill photos (names in V1 — storage upload arrives with the photo phase) */}
      <div>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Bill / invoice photos
        </div>
        {txn.billPhotoNames.length === 0 ? (
          <p className="text-xs text-rose-500">No photo attached.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {txn.billPhotoNames.map((n, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600"
              >
                📷 {n}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Audit trail */}
      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Audit trail
        </div>
        <ol className="space-y-1.5 text-xs">
          <li className="flex items-baseline gap-2 text-slate-500">
            <span className="h-1.5 w-1.5 shrink-0 translate-y-[1px] rounded-full bg-sky-500" />
            <span>
              <span className="font-semibold text-slate-700">{txn.supervisorName}</span>{' '}
              submitted · {relativeTime(txn.submittedAt)}
            </span>
          </li>
          {trail.map((r) => (
            <li key={r.id} className="flex items-baseline gap-2 text-slate-500">
              <span
                className={`h-1.5 w-1.5 shrink-0 translate-y-[1px] rounded-full ${
                  r.action === 'approved'
                    ? 'bg-emerald-500'
                    : r.action === 'rejected'
                      ? 'bg-rose-500'
                      : r.action === 'admin_flag'
                        ? 'bg-orange-500'
                        : 'bg-amber-500'
                }`}
              />
              <span>
                <span className="font-semibold text-slate-700">{r.reviewerName}</span>{' '}
                {ACTION_LABEL[r.action]}
                {r.reason && <span className="italic"> — "{r.reason}"</span>} ·{' '}
                {relativeTime(r.createdAt)}
              </span>
            </li>
          ))}
          {co && (
            <li className="flex items-baseline gap-2 text-slate-500">
              <span className="h-1.5 w-1.5 shrink-0 translate-y-[1px] rounded-full bg-emerald-600" />
              <span>
                <span className="font-semibold text-slate-700">{co.approvedByName}</span>{' '}
                co-approved (director) · {relativeTime(co.createdAt)}
              </span>
            </li>
          )}
          {disb && (
            <li className="flex items-baseline gap-2 text-slate-500">
              <span className="h-1.5 w-1.5 shrink-0 translate-y-[1px] rounded-full bg-teal-600" />
              <span>
                <span className="font-semibold text-slate-700">{disb.disbursedByName}</span>{' '}
                disbursed {formatINR(disb.amount)} via {disb.method.replace('_', ' ')} · ref{' '}
                <span className="font-mono font-semibold">{disb.referenceNumber}</span>
                {disb.isEmergencyOverride && (
                  <span className="ml-1 rounded bg-rose-100 px-1 py-0.5 text-[10px] font-bold text-rose-700">
                    EMERGENCY OVERRIDE
                  </span>
                )}{' '}
                · {relativeTime(disb.disbursedAt)}
              </span>
            </li>
          )}
        </ol>
      </div>
    </div>
  );
}

export function TxnModal({
  txn,
  siteName,
  onClose,
  children,
}: {
  txn: Txn;
  siteName: string;
  onClose: () => void;
  children?: React.ReactNode; // action bar injected by the caller
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Transaction</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
        <TxnDetail txn={txn} siteName={siteName} />
        {children && <div className="mt-5 border-t border-slate-100 pt-4">{children}</div>}
      </div>
    </div>
  );
}

/** Reason prompt used by reject / query / flag actions. */
export function ReasonPrompt({
  title,
  placeholder,
  confirmLabel,
  tone = 'rose',
  onCancel,
  onConfirm,
}: {
  title: string;
  placeholder: string;
  confirmLabel: string;
  tone?: 'rose' | 'amber' | 'slate';
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const toneCls =
    tone === 'rose'
      ? 'bg-rose-600 hover:bg-rose-700'
      : tone === 'amber'
        ? 'bg-amber-600 hover:bg-amber-700'
        : 'bg-slate-800 hover:bg-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 text-xs font-bold text-slate-700">{title}</div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder={placeholder}
        className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          Cancel
        </button>
        <button
          disabled={!reason.trim()}
          onClick={() => onConfirm(reason.trim())}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold text-white transition disabled:opacity-40 ${toneCls}`}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium text-slate-700">{value}</dd>
    </div>
  );
}
