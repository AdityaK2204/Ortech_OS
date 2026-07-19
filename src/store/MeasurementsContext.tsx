import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  fetchMeasurements,
  insertMeasurements,
  subscribeMeasurements,
} from '../lib/api/measurements';
import { onAuthChange } from '../lib/api/auth';
import { useProjects } from './ProjectsContext';
import { taskIdForMeasurement } from '../lib/measure';
import type {
  DailyPulseEntry,
  DailyPulseInput,
  Measurement,
  MeasurementInput,
} from '../types';

// ---------------------------------------------------------------------------
// Digital Measurement Book store. Measurements are the single source of truth:
// "Submit Day" persists the day's cards AND generates the daily pulse from
// them, so progress / chainage map / geographic map / dashboard / billing all
// update from ONE entry. The supervisor never enters anything twice.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'ortech.measurements.v1';

const TASK_NAMES: Record<string, string> = {
  t1: 'Trenching',
  t3: 'Refilling / Closing',
  t5: 'Chamber Installation',
};

interface SubmitDayExtras {
  projectId: string;
  date: string; // YYYY-MM-DD
  supervisorName: string;
}

interface MeasurementsState {
  measurements: Measurement[];
  loading: boolean;
  forSite: (projectId: string) => Measurement[];
  forPeriod: (projectId: string, from: string, to: string) => Measurement[];
  /** Persist the day's measurement cards + auto-generate the daily pulse. */
  submitDay: (
    inputs: MeasurementInput[],
    extras: SubmitDayExtras
  ) => Promise<Measurement[]>;
}

const MeasurementsContext = createContext<MeasurementsState | undefined>(undefined);

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota errors */
  }
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Derive the daily pulse entries from the day's measurements — the "everything
 * else is generated automatically" step. Linear stretches feed their task's
 * segments (HDD strata marks the span trenchless); chamber work becomes an
 * installed count.
 */
export function entriesFromMeasurements(ms: Measurement[]): DailyPulseEntry[] {
  const entries: DailyPulseEntry[] = [];
  let chamberCount = 0;

  for (const m of ms) {
    const taskId = taskIdForMeasurement(m);
    if (taskId === 't5') {
      chamberCount += 1;
      continue;
    }
    if (!taskId || m.chainageTo <= m.chainageFrom) continue;
    const entry: DailyPulseEntry = {
      taskId,
      taskName: TASK_NAMES[taskId] ?? taskId,
      fromM: m.chainageFrom,
      toM: m.chainageTo,
    };
    if (m.strata === 'hdd') {
      entry.usedHdd = true;
      entry.hddFromM = m.chainageFrom;
      entry.hddToM = m.chainageTo;
    }
    entries.push(entry);
  }

  if (chamberCount > 0) {
    entries.push({ taskId: 't5', taskName: TASK_NAMES.t5, count: chamberCount });
  }
  return entries;
}

function buildPulseInput(
  ms: Measurement[],
  extras: SubmitDayExtras
): DailyPulseInput {
  const photos = ms.flatMap((m) => m.photoNames);
  const remarks = ms
    .map((m) => m.remarks)
    .filter(Boolean)
    .join(' · ')
    .slice(0, 200);
  return {
    projectId: extras.projectId,
    date: extras.date,
    supervisorName: extras.supervisorName,
    entries: entriesFromMeasurements(ms),
    issueFlag: 'none',
    note: remarks || undefined,
    photoNames: photos,
  };
}

function materialize(
  inputs: MeasurementInput[],
  pulseId: string | undefined
): Measurement[] {
  const nowISO = new Date().toISOString();
  return inputs.map((input) => ({
    ...input,
    actualLengthM: Math.max(0, input.chainageTo - input.chainageFrom),
    verificationStatus: 'submitted',
    id: newId(),
    pulseId,
    createdAt: nowISO,
  }));
}

export function MeasurementsProvider({ children }: { children: ReactNode }) {
  const { addPulse } = useProjects();
  const backend = isSupabaseConfigured;

  const [measurements, setMeasurements] = useState<Measurement[]>(() =>
    backend ? [] : loadJSON<Measurement[]>(STORAGE_KEY, [])
  );
  const [loading, setLoading] = useState(backend);

  const reload = useCallback(async () => {
    if (!backend) return;
    try {
      setMeasurements(await fetchMeasurements());
    } catch (e) {
      console.error('Failed to load measurements:', e);
    } finally {
      setLoading(false);
    }
  }, [backend]);

  useEffect(() => {
    if (!backend) return;
    reload();
    // Refetch on session change — the mount-time fetch runs pre-login and RLS
    // returns nothing (deferred: see supabase-js auth-callback guidance).
    const unsubAuth = onAuthChange(() => setTimeout(reload, 0));
    const unsub = subscribeMeasurements(reload);
    return () => {
      unsubAuth();
      unsub();
    };
  }, [backend, reload]);

  const forSite = useCallback(
    (projectId: string) =>
      measurements
        .filter((m) => m.projectId === projectId)
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) || a.chainageFrom - b.chainageFrom
        ),
    [measurements]
  );

  const forPeriod = useCallback(
    (projectId: string, from: string, to: string) =>
      measurements
        .filter(
          (m) => m.projectId === projectId && m.date >= from && m.date <= to
        )
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) || a.chainageFrom - b.chainageFrom
        ),
    [measurements]
  );

  const submitDay = useCallback(
    async (
      inputs: MeasurementInput[],
      extras: SubmitDayExtras
    ): Promise<Measurement[]> => {
      // 1) the daily pulse is GENERATED from the measurements (never re-typed)
      const provisional = materialize(inputs, undefined);
      const pulse = await Promise.resolve(
        addPulse(buildPulseInput(provisional, extras))
      );

      // 2) persist the measurements, linked to their pulse
      const linked = provisional.map((m) => ({ ...m, pulseId: pulse.id }));
      if (backend) {
        setMeasurements((prev) => [...prev, ...linked]); // optimistic
        try {
          await insertMeasurements(linked);
        } catch (e) {
          const ids = new Set(linked.map((m) => m.id));
          setMeasurements((prev) => prev.filter((m) => !ids.has(m.id)));
          throw e;
        }
      } else {
        setMeasurements((prev) => {
          const next = [...prev, ...linked];
          saveJSON(STORAGE_KEY, next);
          return next;
        });
      }
      return linked;
    },
    [backend, addPulse]
  );

  const value = useMemo<MeasurementsState>(
    () => ({ measurements, loading, forSite, forPeriod, submitDay }),
    [measurements, loading, forSite, forPeriod, submitDay]
  );

  return (
    <MeasurementsContext.Provider value={value}>
      {children}
    </MeasurementsContext.Provider>
  );
}

export function useMeasurements(): MeasurementsState {
  const ctx = useContext(MeasurementsContext);
  if (!ctx)
    throw new Error('useMeasurements must be used within MeasurementsProvider');
  return ctx;
}
