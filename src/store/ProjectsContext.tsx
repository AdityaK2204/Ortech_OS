import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { PROJECTS } from '../data/mockData';
import { mergeSegments } from '../lib/progress';
import { createProject } from '../lib/newProject';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  fetchProjects,
  insertProject,
  upsertProject,
  deleteProjectRow,
  subscribeProjects,
} from '../lib/api/projects';
import { fetchPulses, insertPulse, subscribePulses } from '../lib/api/pulses';
import { onAuthChange } from '../lib/api/auth';
import { applyPatchToProject } from '../lib/projectPatch';
import type {
  DailyPulse,
  DailyPulseInput,
  NewProjectInput,
  Project,
  ProjectPatch,
} from '../types';

const STORAGE_KEY = 'ortech.pulses.v1';
const PROJECTS_KEY = 'ortech.projects.v1';
const EDITS_KEY = 'ortech.edits.v1';
const HIDDEN_KEY = 'ortech.hidden.v1';

interface ProjectsState {
  projects: Project[];
  loading: boolean;
  getProject: (id: string) => Project | undefined;
  pulsesForSite: (id: string) => DailyPulse[];
  addPulse: (input: DailyPulseInput) => DailyPulse | Promise<DailyPulse>;
  addProject: (input: NewProjectInput) => Project | Promise<Project>;
  updateProject: (id: string, patch: ProjectPatch) => void | Promise<void>;
  deleteProject: (id: string) => void | Promise<void>;
}

const ProjectsContext = createContext<ProjectsState | undefined>(undefined);

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
    /* ignore quota / private-mode errors in the prototype */
  }
}

/** Replay a single pulse's effects onto a (mutable, cloned) project. */
function applyPulse(project: Project, pulse: DailyPulse) {
  for (const entry of pulse.entries) {
    const task = project.tasks.find((t) => t.id === entry.taskId);
    if (!task) continue;

    if (task.type === 'linear') {
      if (entry.fromM != null && entry.toM != null && entry.toM > entry.fromM) {
        task.segments = mergeSegments([
          ...(task.segments ?? []),
          { start: entry.fromM, end: entry.toM },
        ]);
      }
      if (
        entry.usedHdd &&
        entry.hddFromM != null &&
        entry.hddToM != null &&
        entry.hddToM > entry.hddFromM
      ) {
        task.hddSegments = mergeSegments([
          ...(task.hddSegments ?? []),
          { start: entry.hddFromM, end: entry.hddToM },
        ]);
      }
    } else {
      // point task: mark the next N undone installations as done
      let remaining = entry.count ?? 0;
      for (const point of task.points ?? []) {
        if (remaining <= 0) break;
        if (!point.done) {
          point.done = true;
          remaining--;
        }
      }
    }
  }
  project.lastUpdate = pulse.submittedAt;
}

const applyPatch = applyPatchToProject;

/**
 * Build the live project list = seed data with every pulse replayed in order.
 *
 * `asOf` (YYYY-MM-DD) replays only pulses up to that date — the foundation for a
 * future timeline slider ("slide to watch the route grow"). Progress is an
 * append-only dated event log, so time-travel is just a filter; no UI yet.
 */
function buildProjects(
  pulses: DailyPulse[],
  customProjects: Project[],
  edits: Record<string, ProjectPatch>,
  hidden: string[],
  asOf?: string
): Project[] {
  // Seed + admin-created sites, minus deleted ones.
  const base: Project[] = JSON.parse(
    JSON.stringify([...PROJECTS, ...customProjects])
  );
  const live = base.filter((p) => !hidden.includes(p.id));
  const byId = new Map(live.map((p) => [p.id, p]));

  // 1) admin edits (metadata/structure) — before progress replay.
  for (const [id, patch] of Object.entries(edits)) {
    const project = byId.get(id);
    if (project) applyPatch(project, patch);
  }
  // 2) supervisor pulses (live progress) on top.
  const replayed = asOf ? pulses.filter((p) => p.date <= asOf) : pulses;
  for (const pulse of replayed) {
    const project = byId.get(pulse.projectId);
    if (project) applyPulse(project, pulse);
  }
  return live;
}

function LocalProjectsProvider({ children }: { children: ReactNode }) {
  const [pulses, setPulses] = useState<DailyPulse[]>(() =>
    loadJSON<DailyPulse[]>(STORAGE_KEY, [])
  );
  const [customProjects, setCustomProjects] = useState<Project[]>(() =>
    loadJSON<Project[]>(PROJECTS_KEY, [])
  );
  const [edits, setEdits] = useState<Record<string, ProjectPatch>>(() =>
    loadJSON<Record<string, ProjectPatch>>(EDITS_KEY, {})
  );
  const [hidden, setHidden] = useState<string[]>(() =>
    loadJSON<string[]>(HIDDEN_KEY, [])
  );

  const projects = useMemo(
    () => buildProjects(pulses, customProjects, edits, hidden),
    [pulses, customProjects, edits, hidden]
  );

  const getProject = useCallback(
    (id: string) => projects.find((p) => p.id === id),
    [projects]
  );

  const pulsesForSite = useCallback(
    (id: string) =>
      pulses
        .filter((p) => p.projectId === id)
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    [pulses]
  );

  const addPulse = useCallback((input: DailyPulseInput): DailyPulse => {
    const pulse: DailyPulse = {
      ...input,
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `pulse-${Date.now()}`,
      submittedAt: new Date().toISOString(),
    };
    setPulses((prev) => {
      const next = [...prev, pulse];
      saveJSON(STORAGE_KEY, next);
      return next;
    });
    return pulse;
  }, []);

  const addProject = useCallback((input: NewProjectInput): Project => {
    const project = createProject(input);
    setCustomProjects((prev) => {
      const next = [...prev, project];
      saveJSON(PROJECTS_KEY, next);
      return next;
    });
    return project;
  }, []);

  const updateProject = useCallback((id: string, patch: ProjectPatch) => {
    setEdits((prev) => {
      const next = { ...prev, [id]: { ...prev[id], ...patch } };
      saveJSON(EDITS_KEY, next);
      return next;
    });
  }, []);

  const deleteProject = useCallback((id: string) => {
    // remove admin-created copies…
    setCustomProjects((prev) => {
      if (!prev.some((p) => p.id === id)) return prev;
      const next = prev.filter((p) => p.id !== id);
      saveJSON(PROJECTS_KEY, next);
      return next;
    });
    // …and tombstone the id (covers seed projects too).
    setHidden((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      saveJSON(HIDDEN_KEY, next);
      return next;
    });
    setEdits((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      saveJSON(EDITS_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo<ProjectsState>(
    () => ({
      projects,
      loading: false,
      getProject,
      pulsesForSite,
      addPulse,
      addProject,
      updateProject,
      deleteProject,
    }),
    [projects, getProject, pulsesForSite, addPulse, addProject, updateProject, deleteProject]
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

// --- Supabase-backed store --------------------------------------------------

function SupabaseProjectsProvider({ children }: { children: ReactNode }) {
  const [rawProjects, setRawProjects] = useState<Project[]>([]);
  const [pulses, setPulses] = useState<DailyPulse[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [ps, pl] = await Promise.all([fetchProjects(), fetchPulses()]);
      setRawProjects(ps);
      setPulses(pl);
    } catch (e) {
      console.error('Failed to load from Supabase:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    // Refetch when the session changes: the first fetch happens pre-login and
    // RLS correctly returns nothing — without this, data only appears after a
    // manual refresh. (Deferred via setTimeout: supabase-js warns against
    // calling client methods directly inside the auth callback.)
    const unsubAuth = onAuthChange(() => setTimeout(reload, 0));
    // Realtime: refetch on any project/pulse change (simple + always correct).
    const unsubA = subscribeProjects(reload);
    const unsubB = subscribePulses(reload);
    return () => {
      unsubAuth();
      unsubA();
      unsubB();
    };
  }, [reload]);

  // Live progress = stored project config with pulses replayed on top.
  const projects = useMemo(() => {
    const base: Project[] = JSON.parse(JSON.stringify(rawProjects));
    const byId = new Map(base.map((p) => [p.id, p]));
    for (const pulse of pulses) {
      const project = byId.get(pulse.projectId);
      if (project) applyPulse(project, pulse);
    }
    return base;
  }, [rawProjects, pulses]);

  const getProject = useCallback(
    (id: string) => projects.find((p) => p.id === id),
    [projects]
  );

  const pulsesForSite = useCallback(
    (id: string) =>
      pulses
        .filter((p) => p.projectId === id)
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    [pulses]
  );

  const addPulse = useCallback(async (input: DailyPulseInput): Promise<DailyPulse> => {
    const pulse: DailyPulse = {
      ...input,
      id: crypto.randomUUID(),
      submittedAt: new Date().toISOString(),
    };
    setPulses((prev) => [...prev, pulse]); // optimistic
    try {
      await insertPulse(pulse);
    } catch (e) {
      setPulses((prev) => prev.filter((p) => p.id !== pulse.id)); // rollback
      throw e;
    }
    return pulse;
  }, []);

  const addProject = useCallback(async (input: NewProjectInput): Promise<Project> => {
    const project = createProject(input);
    setRawProjects((prev) => [...prev, project]); // optimistic
    try {
      await insertProject(project);
    } catch (e) {
      setRawProjects((prev) => prev.filter((p) => p.id !== project.id));
      throw e;
    }
    return project;
  }, []);

  const updateProject = useCallback(
    async (id: string, patch: ProjectPatch): Promise<void> => {
      const current = rawProjects.find((p) => p.id === id);
      if (!current) return;
      const next: Project = JSON.parse(JSON.stringify(current));
      applyPatch(next, patch);
      setRawProjects((prev) => prev.map((p) => (p.id === id ? next : p))); // optimistic
      try {
        await upsertProject(next);
      } catch (e) {
        setRawProjects((prev) => prev.map((p) => (p.id === id ? current : p)));
        throw e;
      }
    },
    [rawProjects]
  );

  const deleteProject = useCallback(
    async (id: string): Promise<void> => {
      const snapshot = rawProjects;
      setRawProjects((prev) => prev.filter((p) => p.id !== id)); // optimistic
      try {
        await deleteProjectRow(id);
      } catch (e) {
        setRawProjects(snapshot);
        throw e;
      }
    },
    [rawProjects]
  );

  const value = useMemo<ProjectsState>(
    () => ({
      projects,
      loading,
      getProject,
      pulsesForSite,
      addPulse,
      addProject,
      updateProject,
      deleteProject,
    }),
    [projects, loading, getProject, pulsesForSite, addPulse, addProject, updateProject, deleteProject]
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function ProjectsProvider({ children }: { children: ReactNode }) {
  return isSupabaseConfigured ? (
    <SupabaseProjectsProvider>{children}</SupabaseProjectsProvider>
  ) : (
    <LocalProjectsProvider>{children}</LocalProjectsProvider>
  );
}

export function useProjects(): ProjectsState {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error('useProjects must be used within ProjectsProvider');
  return ctx;
}
