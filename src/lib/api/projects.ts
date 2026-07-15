import { requireSupabase } from '../supabase';
import type { Project } from '../../types';
import { projectToRow, rowToProject, type ProjectRow } from './mappers';

/** All projects visible to the signed-in user (RLS filters by role). */
export async function fetchProjects(): Promise<Project[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('projects')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as ProjectRow[]).map(rowToProject);
}

/** Insert a newly-created project. */
export async function insertProject(project: Project): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('projects').insert(projectToRow(project));
  if (error) throw error;
}

/** Persist an edited project (full-row upsert keeps mapping simple). */
export async function upsertProject(project: Project): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('projects').upsert(projectToRow(project));
  if (error) throw error;
}

export async function deleteProjectRow(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('projects').delete().eq('id', id);
  if (error) throw error;
}

/** Subscribe to any project change; returns an unsubscribe fn. */
export function subscribeProjects(onChange: () => void): () => void {
  const sb = requireSupabase();
  const channel = sb
    .channel('projects-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, onChange)
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}
