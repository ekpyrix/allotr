import { defineConfig, devices } from '@playwright/test';

// Each spec file gets its own server and database per size, because
// onboarding can only happen once per instance. Add new spec files to
// `specs`. Run `vite build` first (`pnpm e2e` does).
const sizes = [
  { name: 'phone', use: { ...devices['Pixel 7'] } },
  {
    name: 'desktop',
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: 1280, height: 800 },
      colorScheme: 'dark' as const,
    },
  },
];
const specs = [
  'smoke',
  'sign-in',
  'shell',
  'quick-entry',
  'pwa',
  'today',
  'ledger',
  'accounts',
  'settings',
  'splits',
  'cycles',
  'setup',
  'export',
  'delete-account',
  'themes',
  'command-palette',
  'savings',
  'audit',
  'budget',
  'payday',
  'ious',
  'calendar',
];

const projects = sizes.flatMap((size, i) =>
  specs.map((spec, j) => ({
    name: `${size.name} ${spec}`,
    port: 4173 + i * specs.length + j,
    testMatch: `${spec}.spec.ts`,
    use: size.use,
  })),
);

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  reporter: process.env.CI === undefined ? 'list' : [['list'], ['github']],
  use: { trace: 'retain-on-failure' },
  projects: projects.map(({ name, port, testMatch, use }) => ({
    name,
    testMatch,
    use: { ...use, baseURL: `http://127.0.0.1:${String(port)}` },
  })),
  webServer: projects.map(({ port }) => ({
    command: `node e2e/serve.ts ${String(port)}`,
    url: `http://127.0.0.1:${String(port)}/readyz`,
    reuseExistingServer: false,
    timeout: 30_000,
  })),
});
