import type { Kysely } from 'kysely';
import type { DB } from './db/schema.ts';
import type { Logger } from './logger.ts';
import type { PushSender } from './push/delivery.ts';
import { runReminders } from './reminders.ts';

// The scheduler (docs/architecture.md): one in-process timer that runs the
// reminder job. Each run is idempotent, so a restart, or two runs close
// together, only records what is not recorded yet.

export const REMINDER_INTERVAL_MS = 15 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 10_000;

export function startScheduler(options: {
  db: Kysely<DB>;
  send: PushSender;
  now: () => Date;
  logger: Logger;
  intervalMs?: number;
}): () => void {
  const { db, send, now, logger } = options;
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    runReminders(db, send, now(), logger)
      .then((summary) => {
        if (summary.created > 0) logger.info(summary, 'reminders created');
      })
      .catch((error: unknown) => {
        logger.error({ err: error }, 'reminder job failed');
      })
      .finally(() => {
        running = false;
      });
  };
  const interval = options.intervalMs ?? REMINDER_INTERVAL_MS;
  const first = setTimeout(tick, Math.min(FIRST_RUN_DELAY_MS, interval));
  const every = setInterval(tick, interval);
  // The timers never keep the process alive on their own.
  first.unref();
  every.unref();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
