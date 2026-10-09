import { defineConfig, devices } from '@playwright/test';

// Each spec file gets its own server and database per size, because
// onboarding can only happen once per instance. Add new spec files to
// `specs`. Run `vite build` first (`pnpm e2e` does).
const sizes = [
  {
    name: 'phone',
    use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
  },
  {
    name: 'tablet',
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: 820, height: 1180 },
    },
  },
  {
    name: 'desktop',
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: 1440, height: 900 },
      colorScheme: 'dark' as const,
    },
  },
];
// The per-screen specs return with their screens (WP3 onwards).
const specs = ['smoke', 'shell', 'keys'];

const projects = sizes.flatMap((size, i) =>
  specs.map((spec, j) => ({
    name: `${size.name} ${spec}`,
    port: Number(process.env.E2E_PORT_BASE ?? 4173) + i * specs.length + j,
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
