import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useAccounts } from '../../store/AccountsContext';
import {
  PAID_VIA,
  TXN_CATEGORIES,
  formatINR,
} from '../../lib/accounts';
import {
  ReasonPrompt,
  TxnFlags,
  TxnModal,
  TxnStatusPill,
} from '../../components/TxnBits';
import { relativeTime } from '../../lib/progress';
import type { Project, Txn, TxnCategory, TxnInput } from '../../types';

// ---------------------------------------------------------------------------
// Supervisor "Expenses" tab — lives inside the supervisor workspace next to
// Daily Pulse. Submit an expense claim in under 90 seconds (photo required),
// then track every claim's status without a single phone call.
// ---------------------------------------------------------------------------

export default function ExpensesTab({ project }: { project: Project }) {
  const { user } = useAuth();
  const { forSite, submitTxn, clarify } = useAccounts();
  const claims = useMemo(
    () =>
      forSite(project.id)
        .filter(
          (t) =>
            !t.supervisorName ||
            t.supervisorName === (user?.supervisorName ?? user?.name)
        )
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    [forSite, project.id, user]
  );

  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<Txn | null>(null);
  const [clarifying, setClarifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // keep the modal's txn fresh after a clarify updates the store
  const liveDetail = detail ? claims.find((t) => t.id === detail.id) ?? detail : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Expense claims</h2>
          <p className="text-xs text-slate-500">
            Every rupee needs a submitted, photographed claim. Track them all here.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-800 active:scale-[0.99]"
        >
          ＋ New Expense
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

      {claims.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            No expense claims yet. Tap <span className="font-semibold">New Expense</span>{' '}
            the next time money leaves your pocket on site.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {claims.map((t) => (
            <button
              key={t.id}
              onClick={() => setDetail(t)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold tabular-nums text-slate-900">
                    {formatINR(t.amount)}
                  </span>
                  <span className="text-xs text-slate-500">{t.vendorName}</span>
                  <TxnFlags txn={t} />
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-400">
                  {t.description} · {relativeTime(t.submittedAt)}
                </div>
              </div>
              <TxnStatusPill status={t.status} />
            </button>
          ))}
        </div>
      )}

      {showForm && (
        <ExpenseForm
          project={project}
          onClose={() => setShowForm(false)}
          onSubmit={async (input) => {
            setError(null);
            try {
              await submitTxn(input);
              setShowForm(false);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      )}

      {liveDetail && (
        <TxnModal txn={liveDetail} siteName={project.name} onClose={() => { setDetail(null); setClarifying(false); }}>
          {liveDetail.status === 'queried' &&
            (clarifying ? (
              <ReasonPrompt
                title="Answer the accountant's query"
                placeholder="Add the missing detail or context…"
                confirmLabel="Send clarification"
                tone="slate"
                onCancel={() => setClarifying(false)}
                onConfirm={async (note) => {
                  try {
                    await clarify(liveDetail.id, note);
                    setClarifying(false);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              />
            ) : (
              <button
                onClick={() => setClarifying(true)}
                className="w-full rounded-lg bg-amber-600 py-2.5 text-sm font-bold text-white transition hover:bg-amber-700"
              >
                Answer query
              </button>
            ))}
        </TxnModal>
      )}
    </div>
  );
}

// --- submission form -----------------------------------------------------------

function ExpenseForm({
  project,
  onClose,
  onSubmit,
}: {
  project: Project;
  onClose: () => void;
  onSubmit: (input: TxnInput) => Promise<void>;
}) {
  const { user } = useAuth();
  const [category, setCategory] = useState<TxnCategory>('diesel');
  const [amount, setAmount] = useState('');
  const [hasGst, setHasGst] = useState(false);
  const [gstAmount, setGstAmount] = useState('');
  const [gstin, setGstin] = useState('');
  const [vendor, setVendor] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [paidVia, setPaidVia] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amt = Number(amount);
    if (!amount || Number.isNaN(amt) || amt <= 0)
      return setError('Enter the amount.');
    if (!vendor.trim()) return setError('Who was this paid to?');
    if (!description.trim()) return setError('Describe what the payment was for.');
    if (photos.length === 0)
      return setError('A photo of the bill / receipt is required — no photo, no money.');
    const gst = hasGst ? Number(gstAmount) : 0;
    if (hasGst && (Number.isNaN(gst) || gst <= 0 || gst >= amt))
      return setError('Enter the GST portion of the total amount.');

    setBusy(true);
    try {
      await onSubmit({
        projectId: project.id,
        supervisorName: user?.supervisorName ?? user?.name ?? 'Supervisor',
        category,
        amount: amt,
        gstApplicable: hasGst,
        baseAmount: hasGst ? amt - gst : undefined,
        gstAmount: hasGst ? gst : undefined,
        vendorName: vendor.trim(),
        vendorGstin: hasGst && gstin.trim() ? gstin.trim().toUpperCase() : undefined,
        description: description.trim(),
        billPhotoNames: photos,
        paymentMethodUsed: (paidVia || undefined) as TxnInput['paymentMethodUsed'],
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">New expense — {project.name}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        <Field label="Category">
          <div className="grid grid-cols-3 gap-1.5">
            {TXN_CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`rounded-lg border px-2 py-2 text-[11px] font-semibold transition active:scale-[0.98] ${
                  category === c.value
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Amount (₹)">
          <input
            type="number"
            inputMode="decimal"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 4500"
            className="num-input text-lg font-bold"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={hasGst}
            onChange={(e) => setHasGst(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Has GST invoice
        </label>
        {hasGst && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="GST portion (₹)">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={gstAmount}
                onChange={(e) => setGstAmount(e.target.value)}
                placeholder="e.g. 686"
                className="num-input"
              />
            </Field>
            <Field label="Vendor GSTIN (optional)">
              <input
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                placeholder="22AAAAA0000A1Z5"
                className="ip font-mono"
              />
            </Field>
          </div>
        )}

        <Field label="Vendor / paid to">
          <input
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="e.g. Sharma Fuel Station"
            className="ip"
          />
        </Field>

        <Field label="What was this for?">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={200}
            placeholder="In your own words…"
            className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </Field>

        <Field label="Photo of bill / invoice (required)">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) =>
              setPhotos(e.target.files ? Array.from(e.target.files).map((f) => f.name) : [])
            }
            className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2.5 file:text-sm file:font-bold file:text-brand-700 hover:file:bg-brand-100"
          />
          {photos.length > 0 && (
            <p className="mt-1 text-xs text-emerald-600">{photos.length} photo(s) attached ✓</p>
          )}
        </Field>

        <Field label="Already paid via">
          <select className="ip" value={paidVia} onChange={(e) => setPaidVia(e.target.value)}>
            {PAID_VIA.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-brand-700 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-800 active:scale-[0.99] disabled:opacity-60"
        >
          {busy ? 'Submitting…' : 'Submit claim'}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}
