import { defineConfig, devices } from '@playwright/test';

// Each project gets its own server and database, because onboarding can
// only happen once per instance. Run `vite build` first (`pnpm e2e` does).
const projects = [
  { name: 'phone', port: 4173, use: { ...devices['Pixel 7'] } },
  {
    name: 'desktop',
    port: 4174,
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: 1280, height: 800 },
      colorScheme: 'dark' as const,
    },
  },
];

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  reporter: process.env.CI === undefined ? 'list' : [['list'], ['github']],
  use: { trace: 'retain-on-failure' },
  projects: projects.map(({ name, port, use }) => ({
    name,
    use: { ...use, baseURL: `http://127.0.0.1:${String(port)}` },
  })),
  webServer: projects.map(({ port }) => ({
    command: `node e2e/serve.ts ${String(port)}`,
    url: `http://127.0.0.1:${String(port)}/readyz`,
    reuseExistingServer: false,
    timeout: 30_000,
  })),
});
