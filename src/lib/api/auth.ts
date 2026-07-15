import { requireSupabase } from '../supabase';
import type { Role } from '../../auth/AuthContext';

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  supervisorName?: string;
  active: boolean;
}

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  supervisor_name: string | null;
  active?: boolean | null;
}

function rowToProfile(r: ProfileRow): Profile {
  return {
    id: r.id,
    email: r.email ?? '',
    fullName: r.full_name ?? '',
    role: (r.role as Role) ?? 'supervisor',
    supervisorName: r.supervisor_name ?? undefined,
    active: r.active ?? true,
  };
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/**
 * Register a new user. `meta` is stored on the auth user and read by the
 * DB trigger to create the matching profile (role defaults to supervisor).
 * Returns whether a session was granted immediately (email-confirmation off)
 * or the user must confirm via email first.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
  meta: { full_name: string; role: 'admin' | 'supervisor'; supervisor_name?: string }
): Promise<{ session: unknown | null }> {
  const sb = requireSupabase();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: meta },
  });
  if (error) throw error;
  return { session: data.session };
}

export async function signOut(): Promise<void> {
  const sb = requireSupabase();
  await sb.auth.signOut();
}

/** The profile (role + supervisor identity) for the current session, if any. */
export async function fetchMyProfile(): Promise<Profile | null> {
  const sb = requireSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', auth.user.id)
    .single();
  if (error) return null;
  return rowToProfile(data as ProfileRow);
}

/** Fire `cb` whenever the auth session changes; returns an unsubscribe fn. */
export function onAuthChange(cb: () => void): () => void {
  const sb = requireSupabase();
  const { data } = sb.auth.onAuthStateChange(() => cb());
  return () => data.subscription.unsubscribe();
}
