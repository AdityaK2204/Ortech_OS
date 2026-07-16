import { useMemo, useState } from 'react';
import Layout from '../../components/Layout';
import { useAuth } from '../../auth/AuthContext';
import { useAccounts } from '../../store/AccountsContext';
import { useProjects } from '../../store/ProjectsContext';
import {
  QUEUE_STATUSES,
  categoryLabel,
  formatINR,
  isFlagged,
  queueSort,
  rollup,
} from '../../lib/accounts';
import {
  exportTallyCsv,
  exportTallyXml,
  type TxnWithDate,
} from '../../lib/tallyExport';
import {
  ReasonPrompt,
  TxnFlags,
  TxnModal,
  TxnStatusPill,
} from '../../components/TxnBits';
import { relativeTime } from '../../lib/progress';
import type { PaymentMethod, Txn } from '../../types';

// ---------------------------------------------------------------------------
// Accountant workspace — the one screen the accountant lives in all day.
// Queue (flags first, oldest first) → one-tap approve / query / reject,
// disburse with method + reference, running ledger, Tally export.
// Admins see the same screen plus co-approval and emergency override.
// ---------------------------------------------------------------------------

type View = 'queue' | 'approved' | 'ledger' | 'all';

const VIEWS: { id: View; label: string }[] = [
  { id: 'queue', label: 'Review Queue' },
  { id: 'approved', label: 'To Disburse' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'all', label: 'All Transactions' },
];

export default function AccountsPage() {
  const { user } = useAuth();
  const {
    txns,
    threshold,
    loading,
    review,
    coApprove,
    disburse,
    needsCoApproval,
    coApprovalFor,
    disbursementFor,
    recordExport,
  } = useAccounts();
  const { projects } = useProjects();
  const isDirector = user?.role === 'admin';

  const [view, setView] = useState<View>('queue');
  const [detail, setDetail] = useState<Txn | null>(null);
  const [prompt, setPrompt] = useState<{ id: string; kind: 'reject' | 'query' } | null>(null);
  const [payFor, setPayFor] = useState<Txn | null>(null);
  const [error, setError] = useState<string | null>(null);

  const siteName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;

  const queue = useMemo(
    () => txns.filter((t) => QUEUE_STATUSES.includes(t.status)).sort(queueSort),
    [txns]
  );
  const approved = useMemo(
    () =>
      txns
        .filter((t) => t.status === 'approved')
        .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)),
    [txns]
  );
  const liveDetail = detail ? txns.find((t) => t.id === detail.id) ?? detail : null;

  const act = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Accounts</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            No money leaves without a submitted, approved, photographed record.
          </p>
        </div>
        <div className="text-right text-xs text-slate-400">
          Director co-approval from{' '}
          <span className="font-bold text-slate-600">{formatINR(threshold)}</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

      {/* View strip */}
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
        {VIEWS.map((v) => {
          const active = view === v.id;
          const badge =
            v.id === 'queue' ? queue.length : v.id === 'approved' ? approved.length : 0;
          return (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`relative shrink-0 px-4 py-2.5 text-sm font-semibold transition ${
                active ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {v.label}
              {badge > 0 && (
                <span className="ml-1.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">
                  {badge}
                </span>
              )}
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-700" />
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          Loading transactions…
        </div>
      ) : (
        <>
          {view === 'queue' && (
            <TxnList
              txns={queue}
              siteName={siteName}
              emptyText="Queue clear — every submitted claim has been handled. ✓"
              onOpen={setDetail}
              renderActions={(t) =>
                prompt?.id === t.id ? (
                  <ReasonPrompt
                    title={prompt.kind === 'reject' ? 'Reject — reason required' : 'Query the supervisor'}
                    placeholder={
                      prompt.kind === 'reject'
                        ? 'Why is this claim rejected?'
                        : 'e.g. Photo is blurred — resend the bill'
                    }
                    confirmLabel={prompt.kind === 'reject' ? 'Reject claim' : 'Send query'}
                    tone={prompt.kind === 'reject' ? 'rose' : 'amber'}
                    onCancel={() => setPrompt(null)}
                    onConfirm={(reason) =>
                      act(async () => {
                        await review(t.id, prompt.kind === 'reject' ? 'rejected' : 'queried', reason);
                        setPrompt(null);
                      })
                    }
                  />
                ) : (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        act(() => review(t.id, 'approved'));
                      }}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700"
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPrompt({ id: t.id, kind: 'query' });
                      }}
                      className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 transition hover:bg-amber-100"
                    >
                      ? Query
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPrompt({ id: t.id, kind: 'reject' });
                      }}
                      className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100"
                    >
                      ✕ Reject
                    </button>
                  </div>
                )
              }
            />
          )}

          {view === 'approved' && (
            <TxnList
              txns={approved}
              siteName={siteName}
              emptyText="Nothing waiting for payout."
              onOpen={setDetail}
              renderActions={(t) => {
                const waiting = needsCoApproval(t);
                return (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {waiting ? (
                      isDirector ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            act(() => coApprove(t.id));
                          }}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-700"
                        >
                          ✍ Co-approve (director)
                        </button>
                      ) : (
                        <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">
                          Awaiting director co-approval (≥ {formatINR(threshold)})
                        </span>
                      )
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPayFor(t);
                        }}
                        className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-teal-800"
                      >
                        ₹ Mark disbursed
                      </button>
                    )}
                    {coApprovalFor(t.id) && (
                      <span className="text-[10px] font-semibold text-emerald-600" title="Director co-approved">
                        ✍✓
                      </span>
                    )}
                  </div>
                );
              }}
            />
          )}

          {view === 'ledger' && <LedgerView txns={txns} siteName={siteName} onExport={recordExport} />}

          {view === 'all' && (
            <TxnList
              txns={[...txns].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))}
              siteName={siteName}
              emptyText="No transactions yet."
              onOpen={setDetail}
              renderActions={(t) => {
                const d = disbursementFor(t.id);
                return d ? (
                  <span className="shrink-0 text-[11px] text-slate-400">
                    ref <span className="font-mono font-semibold text-slate-600">{d.referenceNumber}</span>
                  </span>
                ) : null;
              }}
            />
          )}
        </>
      )}

      {liveDetail && (
        <TxnModal txn={liveDetail} siteName={siteName(liveDetail.projectId)} onClose={() => setDetail(null)} />
      )}

      {payFor && (
        <DisburseModal
          txn={payFor}
          onClose={() => setPayFor(null)}
          onConfirm={(method, reference) =>
            act(async () => {
              await disburse(payFor.id, method, reference);
              setPayFor(null);
            })
          }
        />
      )}
    </Layout>
  );
}

// --- transaction list ------------------------------------------------------------

function TxnList({
  txns,
  siteName,
  emptyText,
  onOpen,
  renderActions,
}: {
  txns: Txn[];
  siteName: (id: string) => string;
  emptyText: string;
  onOpen: (t: Txn) => void;
  renderActions: (t: Txn) => React.ReactNode;
}) {
  if (txns.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-sm text-slate-500">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {txns.map((t) => (
        <div
          key={t.id}
          onClick={() => onOpen(t)}
          className={`flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-slate-50 ${
            isFlagged(t) ? 'bg-rose-50/40' : ''
          }`}
        >
          {/* photo hint */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg" title={`${t.billPhotoNames.length} photo(s)`}>
            {t.billPhotoNames.length > 0 ? '📷' : '∅'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold tabular-nums text-slate-900">{formatINR(t.amount)}</span>
              <span className="text-xs font-semibold text-slate-500">{categoryLabel(t.category)}</span>
              <TxnFlags txn={t} />
              <TxnStatusPill status={t.status} />
            </div>
            <div className="mt-0.5 truncate text-xs text-slate-400">
              {siteName(t.projectId)} · {t.supervisorName} · {t.vendorName} ·{' '}
              {relativeTime(t.submittedAt)}
            </div>
          </div>
          <div onClick={(e) => e.stopPropagation()} className="w-full sm:w-auto">
            {renderActions(t)}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- ledger + Tally export ----------------------------------------------------------

function monthStartISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function LedgerView({
  txns,
  siteName,
  onExport,
}: {
  txns: Txn[];
  siteName: (id: string) => string;
  onExport: (format: 'xml' | 'csv', filters: Record<string, unknown>, ids: string[]) => Promise<void>;
}) {
  const { projects } = useProjects();
  const { disbursementFor } = useAccounts();
  const totals = useMemo(() => rollup(txns), [txns]);

  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [projectId, setProjectId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const exportable: TxnWithDate[] = useMemo(
    () =>
      txns
        .filter((t) => t.status === 'disbursed')
        .map((t) => ({
          ...t,
          voucherDate: disbursementFor(t.id)?.disbursedAt ?? t.submittedAt,
        }))
        .filter((t) => {
          const d = t.voucherDate.slice(0, 10);
          return d >= from && d <= to && (!projectId || t.projectId === projectId);
        }),
    [txns, from, to, projectId, disbursementFor]
  );

  const doExport = async (format: 'xml' | 'csv') => {
    setError(null);
    if (exportable.length === 0)
      return setError('No disbursed transactions in the selected period.');
    const filters = { from, to, projectId: projectId || undefined };
    if (format === 'xml') exportTallyXml(exportable, projects, filters);
    else exportTallyCsv(exportable, projects, filters);
    await onExport(format, filters, exportable.map((t) => t.id));
  };

  return (
    <div className="space-y-5">
      {/* Tally export — front and center, not buried in settings */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Export for Tally</h2>
          <span className="text-xs text-slate-400">
            Gateway of Tally → Import Data → Vouchers
          </span>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Disbursed transactions become Tally vouchers — sites map to Cost Centres,
          vendors to Party ledgers, GST split to CGST/SGST.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">From</label>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="ip w-40" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">To</label>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="ip w-40" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">Site</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="ip w-52">
              <option value="">All sites</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => doExport('xml')}
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700"
            >
              ⬇ Tally XML
            </button>
            <button
              onClick={() => doExport('csv')}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              CSV / Excel
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {exportable.length} disbursed transaction{exportable.length === 1 ? '' : 's'} in range.
        </p>
        {error && (
          <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>
        )}
      </section>

      {/* Rollups */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <BigStat label="Total disbursed" value={formatINR(totals.totalDisbursed)} tone="text-teal-700" />
        <BigStat label="Approved, awaiting payout" value={formatINR(totals.totalApprovedUnpaid)} tone="text-emerald-700" />
        <BigStat label="Pending review" value={formatINR(totals.totalPending)} tone="text-amber-700" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <RollupCard
          title="Disbursed by site"
          rows={totals.byProject.map((r) => ({ label: siteName(r.projectId), amount: r.amount }))}
        />
        <RollupCard
          title="Disbursed by category"
          rows={totals.byCategory.map((r) => ({ label: categoryLabel(r.category), amount: r.amount }))}
        />
      </div>
    </div>
  );
}

function BigStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</div>
    </div>
  );
}

function RollupCard({ title, rows }: { title: string; rows: { label: string; amount: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-bold text-slate-900">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">Nothing disbursed yet.</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="mb-0.5 flex items-baseline justify-between text-xs">
                <span className="font-medium text-slate-600">{r.label}</span>
                <span className="font-bold tabular-nums text-slate-800">{formatINR(r.amount)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-teal-600"
                  style={{ width: `${(r.amount / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- disbursement modal ---------------------------------------------------------------

function DisburseModal({
  txn,
  onClose,
  onConfirm,
}: {
  txn: Txn;
  onClose: () => void;
  onConfirm: (method: PaymentMethod, reference: string) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [reference, setReference] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-lg font-bold text-slate-900">Record disbursement</h2>
        <p className="mb-4 text-sm text-slate-500">
          {formatINR(txn.amount)} to <span className="font-semibold">{txn.vendorName}</span>
        </p>

        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Method</label>
        <div className="mb-4 grid grid-cols-3 gap-1.5">
          {(['cash', 'upi', 'bank_transfer'] as PaymentMethod[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`rounded-lg border px-2 py-2 text-xs font-bold capitalize transition ${
                method === m
                  ? 'border-teal-700 bg-teal-700 text-white'
                  : 'border-slate-200 text-slate-600 hover:border-teal-400'
              }`}
            >
              {m.replace('_', ' ')}
            </button>
          ))}
        </div>

        <label className="mb-1.5 block text-xs font-semibold text-slate-600">
          Reference number (required)
        </label>
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="UTR / UPI ref / voucher no."
          className="ip mb-4 font-mono"
        />

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            disabled={!reference.trim()}
            onClick={() => onConfirm(method, reference.trim())}
            className="flex-1 rounded-lg bg-teal-700 py-2.5 text-sm font-bold text-white transition hover:bg-teal-800 disabled:opacity-40"
          >
            Confirm payout
          </button>
        </div>
      </div>
    </div>
  );
}
