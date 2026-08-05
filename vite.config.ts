import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt', // show "update available" toast; field users decide when
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'ORTECH OS — Mission Control',
        short_name: 'ORTECH OS',
        description:
          'Site execution visibility: daily measurements, progress, expenses and accounts for linear infrastructure work.',
        theme_color: '#0f766e',
        background_color: '#f6f7f9',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['business', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell: precache the built JS/CSS/HTML so the app OPENS offline.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Keep the offline install light for field phones: the export engines
        // (exceljs/jspdf, ~1.7 MB) are admin-office features — fetched from the
        // CDN on demand, never precached to a supervisor's device.
        globIgnores: [
          '**/exceljs*',
          '**/jspdf*',
          '**/html2canvas*',
          '**/purify*',
          '**/index.es-*',
        ],
        navigateFallback: '/index.html',
        // Never intercept Supabase/Google APIs — data must stay live or fail
        // honestly (the app's own optimistic/local states handle offline).
        navigateFallbackDenylist: [/^\/supabase/, /^\/auth/],
        runtimeCaching: [
          {
            // Google Maps tiles/scripts: network-first, short cache for flaky signal
            urlPattern: /^https:\/\/maps\.(googleapis|gstatic)\.com\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'gmaps',
              expiration: { maxEntries: 60, maxAgeSeconds: 24 * 3600 },
            },
          },
          {
            // Supabase REST/auth: always network (RLS'd live data), tiny fallback window
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/,
            handler: 'NetworkOnly',
          },
        ],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // exceljs makes big chunks
      },
    }),
  ],
});
