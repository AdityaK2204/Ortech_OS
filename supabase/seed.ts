/**
 * Seed a fresh Supabase project with ORTECH OS demo data.
 *
 *   1. copy .env.example → .env and fill in:
 *        VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (service role — server only!)
 *   2. run the SQL in supabase/migrations/0001_init.sql (SQL Editor or `supabase db push`)
 *   3. npm run db:seed
 *
 * Creates one admin + one login per site supervisor, and upserts every seed
 * project. Idempotent: re-running updates projects and skips existing users.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { PROJECTS, getSupervisors } from '../src/data/mockData';
import { projectToRow } from '../src/lib/api/mappers';

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DEFAULT_PASSWORD = process.env.SEED_PASSWORD ?? 'ortech123';

if (!url || !serviceKey) {
  console.error(
    'Missing env. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env before seeding.'
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function emailFor(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/(^\.|\.$)/g, '')}@ortech.os`;
}

async function createUser(
  email: string,
  meta: { full_name: string; role: 'admin' | 'supervisor'; supervisor_name?: string }
) {
  const { error } = await admin.auth.admin.createUser({
    email,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
    user_metadata: meta,
  });
  if (error && !/already been registered|already exists/i.test(error.message)) {
    throw error;
  }
  console.log(`  user: ${email} (${meta.role})`);
}

async function main() {
  console.log('→ Creating users…');
  await createUser('admin@ortech.os', { full_name: 'Rakesh (Director)', role: 'admin' });
  for (const s of getSupervisors()) {
    await createUser(emailFor(s.name), {
      full_name: s.name,
      role: 'supervisor',
      supervisor_name: s.name,
    });
  }

  console.log('→ Upserting projects…');
  const rows = PROJECTS.map((p) => projectToRow(p, true));
  const { error } = await admin.from('projects').upsert(rows);
  if (error) throw error;
  console.log(`  ${rows.length} projects upserted`);

  console.log(`\n✓ Seed complete. Login password for every account: "${DEFAULT_PASSWORD}"`);
  console.log('  Admin:      admin@ortech.os');
  console.log('  Supervisor: e.g. ' + emailFor(getSupervisors()[0].name));
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
