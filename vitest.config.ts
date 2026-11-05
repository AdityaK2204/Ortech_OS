import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts so unit tests don't load the PWA plugin.
// envDir points at a folder with no .env, so tests ALWAYS run in local demo
// mode and can never reach the real Supabase project.
export default defineConfig({
  envDir: './src/lib/__tests__',
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
});
