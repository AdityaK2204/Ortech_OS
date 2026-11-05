// Security regression test for the SQL migrations (no Docker / Supabase needed).
// Usage: npm run test:db
// Runs the real migrations against PGlite with a minimal Supabase-like stub
// (auth.users, auth.uid(), storage.buckets/objects, roles), then probes
// every hole that 0006 is meant to close.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIG = process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const db = new PGlite();

await db.exec(`
  create role authenticated nologin;
  create role anon nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
  create publication supabase_realtime;
  grant usage on schema auth, storage to authenticated;
  grant execute on function auth.uid() to authenticated;
`);

for (const f of fs.readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(fs.readFileSync(path.join(MIG, f), 'utf8'));
  console.log('applied', f);
}
await db.exec(`
  grant usage on schema public to authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant select, insert on storage.objects to authenticated;
`);

// --- fixtures (as superuser == service role / SQL editor) ---------------
const U = {
  admin: '00000000-0000-0000-0000-00000000000a',
  sup1: '00000000-0000-0000-0000-000000000001',
  sup2: '00000000-0000-0000-0000-000000000002',
  acct: '00000000-0000-0000-0000-00000000000c',
  evil: '00000000-0000-0000-0000-0000000000ee',
};
for (const [k, id] of Object.entries(U)) {
  const meta = k === 'evil' ? `{"role":"admin","supervisor_name":"Manoj"}` : `{"full_name":"${k}"}`;
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)`, [id, `${k}@x`, meta]);
}
await db.exec(`
  update public.profiles set role='admin', active=true where id='${U.admin}';
  update public.profiles set role='supervisor', supervisor_name='Manoj', active=true where id='${U.sup1}';
  update public.profiles set role='supervisor', supervisor_name='Ravi',  active=true where id='${U.sup2}';
  update public.profiles set role='accountant', active=true where id='${U.acct}';
  insert into public.projects (id, name, supervisor_name) values ('p1','Site 1','Manoj'), ('p2','Site 2','Ravi');
`);

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

async function as(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
async function tryq(sql, params) {
  try { return { rows: (await db.query(sql, params)).rows }; } catch (e) { return { err: e.message }; }
}

// 1. sign-up trigger ignores client role / site
{
  const r = (await db.query(`select role, supervisor_name, active from public.profiles where id=$1`, [U.evil])).rows[0];
  ok('sign-up ignores metadata role/site → inactive supervisor, no site', r.role === 'supervisor' && r.supervisor_name === null && r.active === false, JSON.stringify(r));
}
// 2. self-escalation blocked
await as(U.sup1, async () => {
  const a = await tryq(`update public.profiles set role='admin' where id=$1`, [U.sup1]);
  ok('supervisor cannot make self admin', !!a.err, a.err);
  const b = await tryq(`update public.profiles set supervisor_name='Ravi' where id=$1`, [U.sup1]);
  ok('supervisor cannot change own site identity', !!b.err, b.err);
  const c = await tryq(`update public.profiles set full_name='Manoj R' where id=$1`, [U.sup1]);
  ok('supervisor can still edit own display name', !c.err, c.err);
});
await as(U.evil, async () => {
  const a = await tryq(`update public.profiles set active=true where id=$1`, [U.evil]);
  ok('inactive user cannot activate self', !!a.err, a.err);
  const b = await tryq(`select * from public.projects`);
  ok('inactive user sees no projects', b.rows?.length === 0);
});
// 3. admin powers + self-lockout guard
await as(U.admin, async () => {
  const a = await tryq(`update public.profiles set active=true, supervisor_name='Suresh' where id=$1`, [U.evil]);
  ok('admin can activate / assign a user', !a.err, a.err);
  const b = await tryq(`update public.profiles set role='supervisor' where id=$1`, [U.admin]);
  ok('admin cannot demote self', !!b.err, b.err);
});
await db.query(`update public.profiles set active=false where id=$1`, [U.evil]);

// 4. claims always start submitted
const txnSql = `insert into public.transactions (id, project_id, category, amount, vendor_name, description, status, submitted_by, supervisor_name, flagged_duplicate)
  values ($1, $2, 'diesel', $3, 'HP', 'fuel', 'approved', $4, 'Ravi', false) returning status, submitted_by, supervisor_name`;
await as(U.sup1, async () => {
  const a = await tryq(txnSql, ['10000000-0000-0000-0000-000000000001', 'p1', 5000, U.admin]);
  const r = a.rows?.[0];
  ok('pre-approved claim is forced to submitted, real author + site identity', r && r.status === 'submitted' && r.submitted_by === U.sup1 && r.supervisor_name === 'Manoj', a.err ?? JSON.stringify(r));
  const b = await tryq(txnSql, ['10000000-0000-0000-0000-000000000002', 'p2', 5000, U.sup1]);
  ok("supervisor cannot claim on another supervisor's site", !!b.err, b.err);
  const c = await tryq(txnSql, ['10000000-0000-0000-0000-000000000003', 'p1', 5000, U.sup1]);
  const d = (await db.query(`select flagged_duplicate from public.transactions where id='10000000-0000-0000-0000-000000000003'`)).rows[0];
  ok('duplicate flag still fires after the guard', !c.err && d?.flagged_duplicate === true, c.err);
  const e = await tryq(`update public.transactions set status='approved'`);
  ok('supervisor has no UPDATE path to claims', e.err || (await db.query(`select count(*)::int n from public.transactions where status='approved'`)).rows[0].n === 0, e.err);
});
// 5. approval flow still works end-to-end
await as(U.acct, async () => {
  const a = await tryq(`select public.review_transaction('10000000-0000-0000-0000-000000000001', 'approved')`);
  const b = await tryq(`select public.disburse_transaction('10000000-0000-0000-0000-000000000001', 'upi', 'UTR123')`);
  ok('accountant can approve + disburse (< threshold)', !a.err && !b.err, a.err ?? b.err);
});
// 6. measurements always submitted
await as(U.sup1, async () => {
  const a = await tryq(`insert into public.measurements (id, project_id, work_date, chainage_from, chainage_to, actual_length_m, payable_length_m, verification_status)
    values ('20000000-0000-0000-0000-000000000001','p1','2026-11-05',0,50,50,50,'verified') returning verification_status, created_by`);
  const r = a.rows?.[0];
  ok('self-verified measurement forced to submitted', r?.verification_status === 'submitted' && r?.created_by === U.sup1, a.err ?? JSON.stringify(r));
});
// 7. deactivated admin loses everything
await db.query(`update public.profiles set active=false where id=$1`, [U.admin]);
await as(U.admin, async () => {
  const a = await tryq(`select public.is_admin() v`);
  const b = await tryq(`select * from public.projects`);
  ok('disabled admin: is_admin() false, sees no projects', a.rows?.[0].v === false && b.rows?.length === 0);
});
await db.query(`update public.profiles set active=true where id=$1`, [U.admin]);
// 8. storage
const put = (name) => tryq(`insert into storage.objects (bucket_id, name) values ('site-photos', $1)`, [name]);
await as(U.sup1, async () => {
  ok('supervisor can upload to own site folder', !(await put('p1/bills/2026-11-05/a.jpg')).err);
  ok("supervisor cannot upload to another site's folder", !!(await put('p2/bills/2026-11-05/b.jpg')).err);
});
await as(U.sup2, async () => {
  const r = await tryq(`select name from storage.objects`);
  ok("supervisor cannot read another site's photos", r.rows?.length === 0);
});
await as(U.acct, async () => {
  const r = await tryq(`select name from storage.objects`);
  ok('accountant can read bill photos', r.rows?.length === 1);
});
{
  const b = (await db.query(`select public from storage.buckets where id='site-photos'`)).rows[0];
  ok('site-photos bucket exists and is private', b && b.public === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
