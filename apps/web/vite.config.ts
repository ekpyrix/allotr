import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { serviceWorker } from './build/service-worker.ts';

// In development the API runs on its own port; Vite forwards /v1 to it so
// the browser sees one origin (set ALLOTR_BASE_URL to the Vite URL).
const apiTarget = process.env.ALLOTR_DEV_API ?? 'http://127.0.0.1:8080';

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  resolve: {
    alias: [
      {
        find: '@',
        replacement: fileURLToPath(new URL('./src', import.meta.url)),
      },
    ],
  },
  // The component gallery is a lazy dev-only route; scanning it up front
  // keeps a cold dev server from reloading mid-visit to pre-bundle its
  // imports.
  optimizeDeps: { entries: ['index.html', 'src/routes/dev-components.tsx'] },
  // Libraries every screen needs go in one vendor chunk, cached across
  // releases; ones only some screens load stay with them.
  build: {
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            {
              name: 'vendor',
              test: /node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(?:react|react-dom|scheduler|@tanstack|react-aria-components|react-aria|react-stately|@react-aria|@react-stately|@react-types|@internationalized|@swc|zod|tailwind-merge|clsx|class-variance-authority|use-sync-external-store|tslib|tiny-invariant|tiny-warning|cookie-es|seroval|seroval-plugins|@fontsource-variable)[\\/]/,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/v1': { target: apiTarget } },
  },
  test: {
    include: [
      'src/**/*.test.{ts,tsx}',
      'build/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
  },
});
