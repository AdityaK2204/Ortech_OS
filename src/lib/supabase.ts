import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Supabase browser client. Reads the public URL + anon key from Vite env.
// If they're absent, the app runs in LOCAL mode (localStorage) so nothing
// breaks before the backend is provisioned — this is the "incremental,
// keep app working" contract. Once you paste your project's URL + anon key
// into .env, the app switches to the Supabase backend automatically.
// ---------------------------------------------------------------------------

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

/** True when Supabase env vars are present → use the real backend. */
export const isSupabaseConfigured = url.length > 0 && anonKey.length > 0;

/**
 * The shared client (null when not configured). RLS enforces access per the
 * signed-in user, so the anon key is safe to ship in the browser bundle.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

/** Narrowing helper for call sites that require a configured client. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.'
    );
  }
  return supabase;
}
