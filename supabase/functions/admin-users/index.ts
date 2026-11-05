// Supabase Edge Function: admin-users
// Creates new user accounts on behalf of an authenticated ADMIN.
// Uses the service-role key (never exposed to the browser). The caller's JWT is
// verified and their profile must be an ACTIVE admin.
//
// Deploy:  supabase functions deploy admin-users
// (see ./README.md for the full one-time setup)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ROLES = ['admin', 'supervisor', 'accountant'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1) verify the caller and that they are an admin (RLS-safe read)
    const authHeader = req.headers.get('Authorization') ?? '';
    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await asCaller.auth.getUser();
    if (!userData.user) return json({ error: 'Not authenticated' }, 401);

    // is_admin() also requires the caller's account to be active.
    const { data: isAdmin, error: roleErr } = await asCaller.rpc('is_admin');
    if (roleErr || isAdmin !== true) return json({ error: 'Admin only' }, 403);

    // 2) validate the request
    const body = await req.json();
    if (body.action !== 'create') return json({ error: 'Unknown action' }, 400);

    const email = String(body.email ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return json({ error: 'Enter a valid email address' }, 400);

    const role = body.role ?? 'supervisor';
    if (!ALLOWED_ROLES.includes(role)) return json({ error: 'Unknown role' }, 400);

    const fullName = String(body.fullName ?? '').trim() || email;
    const supervisorName =
      role === 'supervisor' && body.supervisorName ? String(body.supervisorName).trim() : null;

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const password =
      body.password && String(body.password).length >= 8
        ? String(body.password)
        : crypto.randomUUID().replace(/-/g, '').slice(0, 14);

    // 3) create the user with the service role
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) return json({ error: error.message }, 400);

    // The sign-up trigger creates an INACTIVE supervisor profile with no site
    // (it never trusts client metadata). Set the real role/site and activate.
    const { error: profileErr } = await admin
      .from('profiles')
      .update({ role, supervisor_name: supervisorName, full_name: fullName, active: true })
      .eq('id', created.user!.id);
    if (profileErr) return json({ error: profileErr.message }, 500);

    return json({ ok: true, userId: created.user!.id, tempPassword: password }, 200);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
