import { requireSupabase } from '../supabase';
import type { Profile } from './auth';
import type { Role } from '../../auth/AuthContext';

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  supervisor_name: string | null;
  active?: boolean | null;
}

function map(r: ProfileRow): Profile {
  return {
    id: r.id,
    email: r.email ?? '',
    fullName: r.full_name ?? '',
    role: (r.role as Role) ?? 'supervisor',
    supervisorName: r.supervisor_name ?? undefined,
    active: r.active ?? true,
  };
}

/** All user profiles (admin-only via RLS). */
export async function listProfiles(): Promise<Profile[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .order('role', { ascending: true })
    .order('full_name', { ascending: true });
  if (error) throw error;
  return (data as ProfileRow[]).map(map);
}

export interface ProfilePatch {
  role?: Role;
  supervisorName?: string;
  active?: boolean;
  fullName?: string;
}

/** Update a user's role / supervisor identity / active flag (admin-only). */
export async function updateProfile(id: string, patch: ProfilePatch): Promise<void> {
  const sb = requireSupabase();
  const row: Record<string, unknown> = {};
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.supervisorName !== undefined) row.supervisor_name = patch.supervisorName || null;
  if (patch.active !== undefined) row.active = patch.active;
  if (patch.fullName !== undefined) row.full_name = patch.fullName;
  const { error } = await sb.from('profiles').update(row).eq('id', id);
  if (error) throw error;
}

export interface InviteInput {
  email: string;
  fullName: string;
  role: Role;
  supervisorName?: string;
  password?: string;
}

/**
 * Create a new user account. Requires the optional `admin-users` Edge Function
 * (it uses the service role, which can't live in the browser). Throws a
 * recognizable error if the function isn't deployed so the UI can guide the admin.
 */
export async function inviteUser(input: InviteInput): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.functions.invoke('admin-users', {
    body: { action: 'create', ...input },
  });
  if (error) {
    throw new Error(
      'EDGE_FUNCTION_UNAVAILABLE: ' + (error.message || 'admin-users function not reachable')
    );
  }
}
