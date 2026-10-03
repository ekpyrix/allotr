// Starts the API server with the built web app on a fresh temporary
// database, for one Playwright project. Usage: node e2e/serve.ts <port>
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = process.argv[2] ?? '4173';
const dir = mkdtempSync(join(tmpdir(), 'allotr-e2e-'));
const server = spawn(
  process.execPath,
  [join(import.meta.dirname, '../../server/src/main.ts')],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      ALLOTR_DATABASE_PATH: join(dir, 'allotr.db'),
      ALLOTR_BASE_URL: `http://127.0.0.1:${port}`,
      ALLOTR_SECRET_KEY: 'fake-secret-key-for-e2e-tests-0123456789',
      ALLOTR_PORT: port,
      ALLOTR_LOG_LEVEL: 'warn',
      // Reminders appear within a second, so specs need not wait a quarter hour.
      ALLOTR_REMINDER_INTERVAL_SECONDS: '1',
    },
  },
);

function stop() {
  server.kill('SIGTERM');
}
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
server.once('exit', (code) => {
  rmSync(dir, { recursive: true, force: true });
  process.exit(code ?? 0);
});
