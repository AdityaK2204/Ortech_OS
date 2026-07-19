import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import { useAuth } from '../../auth/AuthContext';
import { useProjects } from '../../store/ProjectsContext';
import { useMeasurements } from '../../store/MeasurementsContext';
import { formatMeters } from '../../lib/progress';
import {
  MEASUREMENT_TYPES,
  PAYABLE_ITEMS,
  RESTORATION_ITEMS,
  STRATA_META,
  actualLength,
  summarize,
} from '../../lib/measure';
import type {
  MeasurementInput,
  MeasurementType,
  PayableItem,
  Strata,
} from '../../types';

// ---------------------------------------------------------------------------
// Digital Measurement Book — Daily Measurements.
// Designed for a supervisor on site, in sunlight, on a phone: big touch
// targets, zero manual calculation, one work stretch = one card. Submit Day
// stores every card and generates the daily pulse (progress, maps, dashboard
// and the measurement sheet all update from this single entry).
// ---------------------------------------------------------------------------

interface CardDraft {
  key: string;
  landmark: string;
  fromM: string;
  toM: string;
  depthCm: string;
  strata: Strata;
  measurementType: MeasurementType;
  payableItems: PayableItem[];
  photoNames: string[];
  remarks: string;
  gps?: { lat: number; lng: number; accuracyM?: number };
  gpsState: 'idle' | 'locating' | 'ok' | 'unavailable';
}

let keySeed = 0;
const newKey = () => `mc${keySeed++}`;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function blankCard(prevTo?: string): CardDraft {
  return {
    key: newKey(),
    landmark: '',
    fromM: prevTo ?? '',
    toM: '',
    depthCm: '',
    strata: 'non_rocky',
    measurementType: 'normal_trenching',
    payableItems: [],
    photoNames: [],
    remarks: '',
    gpsState: 'idle',
  };
}

export default function DailyMeasurementsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getProject } = useProjects();
  const { submitDay, forSite } = useMeasurements();
  const project = id ? getProject(id) : undefined;

  const [date, setDate] = useState(todayISO());
  const [cards, setCards] = useState<CardDraft[]>([blankCard()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // capture GPS once for the day's first card (evidence, optional in V1)
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    setCards((prev) =>
      prev.map((c, i) => (i === 0 ? { ...c, gpsState: 'locating' } : c))
    );
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setCards((prev) =>
          prev.map((c, i) =>
            i === 0
              ? {
                  ...c,
                  gps: {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracyM: Math.round(pos.coords.accuracy),
                  },
                  gpsState: 'ok',
                }
              : c
          )
        ),
      () =>
        setCards((prev) =>
          prev.map((c, i) => (i === 0 ? { ...c, gpsState: 'unavailable' } : c))
        ),
      { enableHighAccuracy: true, timeout: 8000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const existingToday = useMemo(
    () => (project ? forSite(project.id).filter((m) => m.date === date) : []),
    [project, forSite, date]
  );

  if (!project) {
    return (
      <Layout>
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-slate-600">Site not found.</p>
          <Link to="/my-sites" className="mt-2 inline-block text-sm font-semibold text-brand-700">
            ← Back to my sites
          </Link>
        </div>
      </Layout>
    );
  }

  const total = project.totalLengthMeters;
  const targetM = project.finance.day.projectedQty;

  const patch = (key: string, p: Partial<CardDraft>) =>
    setCards((prev) => prev.map((c) => (c.key === key ? { ...c, ...p } : c)));

  const togglePayable = (key: string, item: PayableItem) =>
    setCards((prev) =>
      prev.map((c) =>
        c.key === key
          ? {
              ...c,
              payableItems: c.payableItems.includes(item)
                ? c.payableItems.filter((i) => i !== item)
                : [...c.payableItems, item],
            }
          : c
      )
    );

  const addCard = () => {
    const last = cards[cards.length - 1];
    setCards((prev) => [...prev, blankCard(last?.toM || undefined)]);
  };

  const removeCard = (key: string) =>
    setCards((prev) => (prev.length > 1 ? prev.filter((c) => c.key !== key) : prev));

  const lengthOf = (c: CardDraft): number => {
    const from = Number(c.fromM);
    const to = Number(c.toM);
    if (c.fromM === '' || c.toM === '' || Number.isNaN(from) || Number.isNaN(to)) return 0;
    return actualLength(from, to);
  };

  const draftSummary = summarize(
    cards.map((c) => ({
      actualLengthM: lengthOf(c),
      payableLengthM: lengthOf(c),
      photoNames: c.photoNames,
    }))
  );
  const doneToday =
    draftSummary.actualLengthM +
    existingToday.reduce((s, m) => s + m.actualLengthM, 0);

  const submit = async () => {
    setError(null);

    const built: MeasurementInput[] = [];
    for (const [i, c] of cards.entries()) {
      const from = Number(c.fromM);
      const to = Number(c.toM);
      if (c.fromM === '' || c.toM === '' || Number.isNaN(from) || Number.isNaN(to))
        return setError(`Measurement #${i + 1}: enter the From and To chainage.`);
      if (from < 0 || to > total)
        return setError(`Measurement #${i + 1}: chainage must be within 0–${total} m.`);
      if (to <= from)
        return setError(`Measurement #${i + 1}: To must be greater than From.`);

      const len = actualLength(from, to);
      built.push({
        projectId: project.id,
        supervisorName: user?.supervisorName ?? user?.name ?? 'Supervisor',
        date,
        landmark: c.landmark.trim() || undefined,
        chainageFrom: from,
        chainageTo: to,
        depthCm: c.depthCm === '' ? undefined : Number(c.depthCm),
        actualLengthM: len,
        payableLengthM: len,
        strata: c.strata,
        measurementType: c.measurementType,
        payableItems: c.payableItems,
        remarks: c.remarks.trim() || undefined,
        photoNames: c.photoNames,
        gps: c.gps,
        verificationStatus: 'submitted',
      });
    }

    setBusy(true);
    try {
      await submitDay(built, {
        projectId: project.id,
        date,
        supervisorName: user?.supervisorName ?? user?.name ?? 'Supervisor',
      });
      navigate(`/my-sites/${project.id}`);
    } catch (err) {
      setError((err as Error).message || 'Failed to submit the day.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <Link
        to={`/my-sites/${project.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-brand-700"
      >
        ← {project.name}
      </Link>

      {/* Header: project · date · target vs completed */}
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Daily Measurements
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          One stretch of work = one card. Everything else is generated automatically.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Project
            </div>
            <div className="mt-0.5 truncate text-sm font-bold text-slate-800">
              {project.name}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Date
            </div>
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-semibold outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Today's Target
            </div>
            <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-800">
              {targetM > 0 ? formatMeters(targetM) : '—'}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Today's Completed
            </div>
            <div
              className={`mt-0.5 text-sm font-bold tabular-nums ${
                targetM > 0 && doneToday >= targetM ? 'text-emerald-600' : 'text-slate-800'
              }`}
            >
              {formatMeters(doneToday)}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-5 pb-56">
        {cards.map((c, idx) => {
          const len = lengthOf(c);
          return (
            <section
              key={c.key}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900">
                  Measurement #{idx + 1}
                </h2>
                {cards.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCard(c.key)}
                    className="text-xs font-semibold text-rose-500 hover:text-rose-700"
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* 1 — Location */}
              <SectionLabel>📍 Location</SectionLabel>
              <input
                value={c.landmark}
                onChange={(e) => patch(c.key, { landmark: e.target.value })}
                placeholder="Landmark — e.g. Near Electric Pole (optional)"
                className="ip"
              />
              <div className="mt-1.5 text-xs text-slate-400">
                {c.gpsState === 'locating' && 'Capturing GPS…'}
                {c.gpsState === 'ok' && c.gps && (
                  <span className="text-emerald-600">
                    GPS captured · {c.gps.lat.toFixed(5)}, {c.gps.lng.toFixed(5)}
                    {c.gps.accuracyM != null && ` (±${c.gps.accuracyM} m)`}
                  </span>
                )}
                {c.gpsState === 'unavailable' && 'GPS unavailable — landmark only.'}
                {c.gpsState === 'idle' && idx > 0 && 'GPS from first card applies to the day.'}
              </div>

              {/* 2 — Chainage */}
              <SectionLabel className="mt-4">📏 Chainage</SectionLabel>
              <div className="grid grid-cols-3 gap-3">
                <Field label="From (m)">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={c.fromM}
                    min={0}
                    max={total}
                    onChange={(e) => patch(c.key, { fromM: e.target.value })}
                    className="num-input text-lg font-bold"
                  />
                </Field>
                <Field label="To (m)">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={c.toM}
                    min={0}
                    max={total}
                    onChange={(e) => patch(c.key, { toM: e.target.value })}
                    className="num-input text-lg font-bold"
                  />
                </Field>
                <Field label="Depth (cm)">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={c.depthCm}
                    min={0}
                    onChange={(e) => patch(c.key, { depthCm: e.target.value })}
                    className="num-input text-lg font-bold"
                  />
                </Field>
              </div>
              <div
                className={`mt-2 rounded-lg px-3 py-2 text-sm font-bold tabular-nums ${
                  len > 0
                    ? 'bg-brand-50 text-brand-800'
                    : 'bg-slate-50 text-slate-400'
                }`}
              >
                Actual Length&ensp;=&ensp;{len > 0 ? `${len} m` : '— enter From & To'}
              </div>

              {/* 3 — Strata: large touch buttons */}
              <SectionLabel className="mt-4">⛰ Strata</SectionLabel>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STRATA_META.map((s) => {
                  const active = c.strata === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => patch(c.key, { strata: s.value })}
                      className={`rounded-xl border-2 px-3 py-3.5 text-sm font-bold transition active:scale-[0.98] ${
                        active
                          ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300'
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
              {len > 0 && (
                <p className="mt-1.5 text-xs text-slate-500">
                  → <span className="font-semibold">{STRATA_META.find((s) => s.value === c.strata)?.label}</span>{' '}
                  <span className="font-bold tabular-nums">{len} m</span> filled automatically.
                </p>
              )}

              {/* Measurement type */}
              <SectionLabel className="mt-4">🛠 Measurement Type</SectionLabel>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {MEASUREMENT_TYPES.map((t) => {
                  const active = c.measurementType === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => patch(c.key, { measurementType: t.value })}
                      className={`rounded-lg border px-2 py-2.5 text-xs font-semibold transition active:scale-[0.98] ${
                        active
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* 4 — Other payable items: multi-select */}
              <SectionLabel className="mt-4">💰 Other Payable Items</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {[...PAYABLE_ITEMS, ...RESTORATION_ITEMS].map((item) => {
                  const on = c.payableItems.includes(item.value);
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => togglePayable(c.key, item.value)}
                      className={`rounded-full border px-3.5 py-2 text-xs font-bold transition active:scale-[0.97] ${
                        on
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-400'
                      }`}
                    >
                      {on ? '☑' : '☐'} {item.label}
                    </button>
                  );
                })}
              </div>

              {/* 5 — Photos */}
              <SectionLabel className="mt-4">📷 Photos</SectionLabel>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={(e) =>
                  patch(c.key, {
                    photoNames: e.target.files
                      ? Array.from(e.target.files).map((f) => f.name)
                      : [],
                  })
                }
                className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2.5 file:text-sm file:font-bold file:text-brand-700 hover:file:bg-brand-100"
              />
              {c.photoNames.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  {c.photoNames.length} photo(s) — tied to {c.fromM || '?'}–{c.toM || '?'} m on {date}
                </p>
              )}

              {/* 6 — Remarks */}
              <SectionLabel className="mt-4">✍ Remarks</SectionLabel>
              <input
                value={c.remarks}
                onChange={(e) => patch(c.key, { remarks: e.target.value })}
                maxLength={120}
                placeholder="e.g. HDD / HARD ROCK · Road Crossing · Near School · Culvert"
                className="ip"
              />
            </section>
          );
        })}

        <button
          type="button"
          onClick={addCard}
          className="w-full rounded-2xl border-2 border-dashed border-slate-300 py-4 text-sm font-bold text-slate-500 transition hover:border-brand-400 hover:text-brand-700 active:scale-[0.99]"
        >
          ＋ New Measurement
        </button>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}
      </div>

      {/* Sticky: Today's Summary + Submit Day */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <div className="mb-2.5 grid grid-cols-4 gap-2 text-center">
            <SummaryStat label="Measurements" value={String(draftSummary.count)} />
            <SummaryStat
              label="Verified Length"
              value={`${draftSummary.actualLengthM} m`}
            />
            <SummaryStat label="Photos" value={String(draftSummary.photos)} />
            <SummaryStat
              label="Est. Payable"
              value={`${draftSummary.payableLengthM} m`}
            />
          </div>
          <div className="flex items-center gap-3">
            <Link
              to={`/my-sites/${project.id}`}
              className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="flex-1 rounded-xl bg-brand-700 py-3 text-base font-bold text-white shadow-sm transition hover:bg-brand-800 active:scale-[0.99] disabled:opacity-60"
            >
              {busy ? 'Submitting…' : 'Submit Day'}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function SectionLabel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 ${className}`}
    >
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-bold tabular-nums text-slate-900">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
    </div>
  );
}
