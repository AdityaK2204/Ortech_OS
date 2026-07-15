// Supabase Edge Function: admin-users
// Creates new user accounts on behalf of an authenticated ADMIN.
// Uses the service-role key (never exposed to the browser). The caller's JWT is
// verified and their profile.role must be 'admin'.
//
// Deploy:  supabase functions deploy admin-users
// (see ./README.md for the full one-time setup)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const { data: me } = await asCaller
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();
    if (me?.role !== 'admin') return json({ error: 'Admin only' }, 403);

    // 2) create the user with the service role
    const body = await req.json();
    if (body.action !== 'create') return json({ error: 'Unknown action' }, 400);

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const password =
      body.password && String(body.password).length >= 6
        ? String(body.password)
        : crypto.randomUUID().slice(0, 12);

    const { data: created, error } = await admin.auth.admin.createUser({
      email: body.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: body.fullName,
        role: body.role ?? 'supervisor',
        supervisor_name: body.supervisorName,
      },
    });
    if (error) return json({ error: error.message }, 400);

    // The signup trigger creates the profile; ensure role/supervisor are set.
    await admin
      .from('profiles')
      .update({
        role: body.role ?? 'supervisor',
        supervisor_name: body.supervisorName ?? null,
        full_name: body.fullName,
      })
      .eq('id', created.user!.id);

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
