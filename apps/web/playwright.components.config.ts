import { defineConfig, devices } from '@playwright/test';

// The component gallery (/dev/components) exists only in development
// builds, so it runs against the Vite dev server, apart from the
// production-build specs in playwright.config.ts.
const port = 5199;

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'components.spec.ts',
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  reporter: process.env.CI === undefined ? 'list' : [['list'], ['github']],
  use: {
    trace: 'retain-on-failure',
    baseURL: `http://127.0.0.1:${String(port)}`,
  },
  projects: [
    { name: 'phone components', use: { ...devices['Pixel 7'] } },
    {
      name: 'desktop components',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: `node ./node_modules/vite/bin/vite.js --port ${String(port)} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${String(port)}/dev/components`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
