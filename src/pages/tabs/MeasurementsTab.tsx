import { useMemo, useState } from 'react';
import { useMeasurements } from '../../store/MeasurementsContext';
import { exportCsv, exportExcel, exportPdf } from '../../lib/jmsExport';
import {
  measurementTypeLabel,
  payableItemLabel,
  strataLabel,
  summarize,
} from '../../lib/measure';
import { formatMeters } from '../../lib/progress';
import type { Measurement, Project } from '../../types';

// ---------------------------------------------------------------------------
// Measurements tab (admin) — the Digital Measurement Book, read side.
// Every card the supervisors submitted, grouped by day, plus "Export
// Measurement Sheet" by billing period: the generated file is the company's
// Joint Measurement Sheet, ready for the billing engineer.
// ---------------------------------------------------------------------------

function monthStartISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function MeasurementsTab({ project }: { project: Project }) {
  const { forSite, forPeriod, loading } = useMeasurements();
  const all = forSite(project.id);

  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inPeriod = useMemo(
    () => forPeriod(project.id, from, to),
    [forPeriod, project.id, from, to]
  );
  const periodSummary = summarize(inPeriod);

  const byDate = useMemo(() => {
    const map = new Map<string, Measurement[]>();
    for (const m of all) {
      const list = map.get(m.date) ?? [];
      list.push(m);
      map.set(m.date, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [all]);

  const doExport = async (format: 'xlsx' | 'pdf' | 'csv') => {
    setError(null);
    if (inPeriod.length === 0)
      return setError('No measurements in the selected period.');
    setBusy(true);
    try {
      const period = { from, to };
      if (format === 'xlsx') await exportExcel(project, inPeriod, period);
      else if (format === 'pdf') exportPdf(project, inPeriod, period);
      else exportCsv(project, inPeriod, period);
    } catch (e) {
      setError((e as Error).message || 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Export Measurement Sheet */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            Export Measurement Sheet
          </h2>
          <span className="text-xs text-slate-400">Joint Measurement Sheet format</span>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Pick the billing period — every measurement in it becomes one row, ready
          for billing. No re-typing, no Excel assembly.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">
              From
            </label>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="ip w-40"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">
              To
            </label>
            <input
              type="date"
              value={to}
              min={from}
              max={todayISO()}
              onChange={(e) => setTo(e.target.value)}
              className="ip w-40"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => doExport('xlsx')}
              disabled={busy}
              className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60"
            >
              ⬇ Excel (.xlsx)
            </button>
            <button
              onClick={() => doExport('pdf')}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              PDF
            </button>
            <button
              onClick={() => doExport('csv')}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              CSV
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-4">
          <Stat label="Measurements in period" value={String(periodSummary.count)} />
          <Stat label="Actual length" value={formatMeters(periodSummary.actualLengthM)} />
          <Stat label="Payable length" value={formatMeters(periodSummary.payableLengthM)} />
          <Stat label="Photos" value={String(periodSummary.photos)} />
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {error}
          </p>
        )}
      </section>

      {/* Measurement book, grouped by day */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          Loading measurements…
        </div>
      ) : byDate.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            No measurements yet. They appear here the moment a supervisor submits a
            day in the Digital Measurement Book.
          </p>
        </div>
      ) : (
        byDate.map(([date, ms]) => {
          const day = summarize(ms);
          return (
            <section
              key={date}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
                <div className="text-sm font-bold text-slate-800">
                  {new Date(date).toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </div>
                <div className="text-xs tabular-nums text-slate-500">
                  {day.count} measurement{day.count === 1 ? '' : 's'} ·{' '}
                  {formatMeters(day.actualLengthM)} · {day.photos} photo(s)
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {ms.map((m) => (
                  <div key={m.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-bold tabular-nums text-slate-900">
                        {m.chainageFrom}–{m.chainageTo} m
                      </span>
                      <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-700">
                        {m.actualLengthM} m
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                          m.strata === 'hdd'
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {strataLabel(m.strata)}
                      </span>
                      {m.measurementType !== 'normal_trenching' && (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
                          {measurementTypeLabel(m.measurementType)}
                        </span>
                      )}
                      {m.depthCm != null && (
                        <span className="text-xs text-slate-500">
                          depth {m.depthCm} cm
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      {m.landmark && <span>📍 {m.landmark}</span>}
                      {m.payableItems.length > 0 && (
                        <span>
                          💰 {m.payableItems.map(payableItemLabel).join(', ')}
                        </span>
                      )}
                      {m.photoNames.length > 0 && (
                        <span>📷 {m.photoNames.length}</span>
                      )}
                      {m.gps && (
                        <span className="text-emerald-600">
                          GPS {m.gps.lat.toFixed(4)}, {m.gps.lng.toFixed(4)}
                        </span>
                      )}
                      {m.remarks && (
                        <span className="italic">"{m.remarks}"</span>
                      )}
                      <span className="text-slate-400">by {m.supervisorName}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-bold tabular-nums text-slate-900">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
    </div>
  );
}
