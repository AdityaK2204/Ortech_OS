import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { useAccounts } from '../../store/AccountsContext';
import { useProjects } from '../../store/ProjectsContext';
import {
  TXN_CATEGORIES,
  TXN_STATUS_META,
  categoryLabel,
  formatINR,
  rollup,
} from '../../lib/accounts';
import {
  ReasonPrompt,
  TxnFlags,
  TxnModal,
  TxnStatusPill,
} from '../../components/TxnBits';
import { relativeTime } from '../../lib/progress';
import type { Txn, TxnStatus } from '../../types';

// ---------------------------------------------------------------------------
// Admin oversight — a read-only mirror of every transaction and action,
// filterable by site / supervisor / category / status / date. Admin can't
// run the routine queue (separation of duties), but can:
//   · co-approve threshold-triggered payouts
//   · flag anything for review after the fact (a note, never an edit)
//   · set the co-approval threshold
//   · see money-out per project (cost vs contract)
// ---------------------------------------------------------------------------

export default function AdminAccountsPage() {
  const {
    txns,
    threshold,
    loading,
    coApprove,
    adminFlag,
    setThreshold,
    needsCoApproval,
  } = useAccounts();
  const { projects } = useProjects();

  const [fProject, setFProject] = useState('');
  const [fSupervisor, setFSupervisor] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [detail, setDetail] = useState<Txn | null>(null);
  const [flagFor, setFlagFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const siteName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;

  const supervisors = useMemo(
    () => [...new Set(txns.map((t) => t.supervisorName).filter(Boolean))].sort(),
    [txns]
  );

  const filtered = useMemo(
    () =>
      txns
        .filter((t) => {
          const d = t.submittedAt.slice(0, 10);
          return (
            (!fProject || t.projectId === fProject) &&
            (!fSupervisor || t.supervisorName === fSupervisor) &&
            (!fCategory || t.category === fCategory) &&
            (!fStatus || t.status === fStatus) &&
            (!fFrom || d >= fFrom) &&
            (!fTo || d <= fTo)
          );
        })
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    [txns, fProject, fSupervisor, fCategory, fStatus, fFrom, fTo]
  );

  const awaitingCo = useMemo(() => txns.filter(needsCoApproval), [txns, needsCoApproval]);
  const totals = useMemo(() => rollup(txns), [txns]);
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
      <Link
        to="/dashboard"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-brand-700"
      >
        ← All sites
      </Link>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Accounts — Oversight
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Every transaction, every status change, every payout — read-only mirror.
          </p>
        </div>
        <ThresholdEditor threshold={threshold} onSave={(v) => act(() => setThreshold(v))} />
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

      {/* Co-approval inbox */}
      {awaitingCo.length > 0 && (
        <section className="mb-5 rounded-2xl border border-slate-900/10 bg-slate-900 p-5 text-white shadow-sm">
          <h2 className="mb-1 text-sm font-bold">
            ✍ Awaiting your co-approval ({awaitingCo.length})
          </h2>
          <p className="mb-3 text-xs text-slate-300">
            Approved by the accountant, at or above {formatINR(threshold)} — needs a
            director's signature before payout.
          </p>
          <div className="space-y-2">
            {awaitingCo.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-3 rounded-xl bg-white/10 px-4 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-bold tabular-nums">{formatINR(t.amount)}</span>
                  <span className="ml-2 text-xs text-slate-300">
                    {categoryLabel(t.category)} · {siteName(t.projectId)} · {t.vendorName} · by{' '}
                    {t.supervisorName}
                  </span>
                </div>
                <button
                  onClick={() => setDetail(t)}
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
                >
                  Review
                </button>
                <button
                  onClick={() => act(() => coApprove(t.id))}
                  className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-600"
                >
                  ✍ Co-approve
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Money out per project — cost next to contract value */}
      <section className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-2xl font-bold tabular-nums text-teal-700">
            {formatINR(totals.totalDisbursed)}
          </div>
          <div className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Total money out
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-2">
          <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Money out per project (vs contract value)
          </h3>
          <div className="space-y-2">
            {totals.byProject.length === 0 ? (
              <p className="text-xs text-slate-400">Nothing disbursed yet.</p>
            ) : (
              totals.byProject.map((r) => {
                const p = projects.find((x) => x.id === r.projectId);
                const contract = p?.finance.contractValue ?? 0;
                const pct = contract > 0 ? Math.min(100, (r.amount / contract) * 100) : 0;
                return (
                  <div key={r.projectId}>
                    <div className="mb-0.5 flex items-baseline justify-between text-xs">
                      <span className="font-medium text-slate-600">{siteName(r.projectId)}</span>
                      <span className="tabular-nums text-slate-500">
                        <span className="font-bold text-slate-800">{formatINR(r.amount)}</span>
                        {contract > 0 && <> / {formatINR(contract)} ({pct.toFixed(1)}%)</>}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-teal-600" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="mb-4 flex flex-wrap items-end gap-2.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Filter label="Site">
          <select value={fProject} onChange={(e) => setFProject(e.target.value)} className="ip w-44">
            <option value="">All</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Filter>
        <Filter label="Supervisor">
          <select value={fSupervisor} onChange={(e) => setFSupervisor(e.target.value)} className="ip w-40">
            <option value="">All</option>
            {supervisors.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Filter>
        <Filter label="Category">
          <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} className="ip w-40">
            <option value="">All</option>
            {TXN_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </Filter>
        <Filter label="Status">
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="ip w-36">
            <option value="">All</option>
            {(Object.keys(TXN_STATUS_META) as TxnStatus[]).map((s) => (
              <option key={s} value={s}>{TXN_STATUS_META[s].label}</option>
            ))}
          </select>
        </Filter>
        <Filter label="From">
          <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="ip w-40" />
        </Filter>
        <Filter label="To">
          <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className="ip w-40" />
        </Filter>
      </section>

      {/* Mirror list */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          Loading transactions…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">No transactions match the filters.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-slate-50"
            >
              <button onClick={() => setDetail(t)} className="min-w-0 flex-1 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold tabular-nums text-slate-900">{formatINR(t.amount)}</span>
                  <span className="text-xs font-semibold text-slate-500">
                    {categoryLabel(t.category)}
                  </span>
                  <TxnFlags txn={t} />
                  <TxnStatusPill status={t.status} />
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-400">
                  {siteName(t.projectId)} · {t.supervisorName} · {t.vendorName} ·{' '}
                  {relativeTime(t.submittedAt)}
                </div>
              </button>
              {flagFor === t.id ? (
                <div className="w-full">
                  <ReasonPrompt
                    title="Flag for review — adds a visible note, never edits the record"
                    placeholder="What should be looked into?"
                    confirmLabel="Add flag"
                    tone="slate"
                    onCancel={() => setFlagFor(null)}
                    onConfirm={(note) =>
                      act(async () => {
                        await adminFlag(t.id, note);
                        setFlagFor(null);
                      })
                    }
                  />
                </div>
              ) : (
                <button
                  onClick={() => setFlagFor(t.id)}
                  className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
                >
                  🚩 Flag
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {liveDetail && (
        <TxnModal
          txn={liveDetail}
          siteName={siteName(liveDetail.projectId)}
          onClose={() => setDetail(null)}
        >
          {needsCoApproval(liveDetail) && (
            <button
              onClick={() =>
                act(async () => {
                  await coApprove(liveDetail.id);
                  setDetail(null);
                })
              }
              className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700"
            >
              ✍ Co-approve this payout
            </button>
          )}
        </TxnModal>
      )}
    </Layout>
  );
}

function ThresholdEditor({
  threshold,
  onSave,
}: {
  threshold: number;
  onSave: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(threshold));

  if (!editing) {
    return (
      <button
        onClick={() => {
          setValue(String(threshold));
          setEditing(true);
        }}
        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
        title="Amounts at or above this need director co-approval before payout"
      >
        Co-approval threshold: <span className="font-bold">{formatINR(threshold)}</span> ✎
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="num-input w-32"
      />
      <button
        onClick={() => {
          const v = Number(value);
          if (!Number.isNaN(v) && v >= 0) {
            onSave(v);
            setEditing(false);
          }
        }}
        className="rounded-lg bg-brand-700 px-3 py-2 text-xs font-bold text-white hover:bg-brand-800"
      >
        Save
      </button>
      <button
        onClick={() => setEditing(false)}
        className="text-xs font-semibold text-slate-400 hover:text-slate-700"
      >
        Cancel
      </button>
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-slate-500">{label}</label>
      {children}
    </div>
  );
}
