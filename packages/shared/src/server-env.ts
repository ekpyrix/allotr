import { z } from 'zod';

// Bootstrap configuration only; everything else lives in the database
// (docs/architecture.md §7).
export const serverEnvSchema = z.object({
  ALLOTR_DATABASE_PATH: z.string().min(1),
  ALLOTR_BASE_URL: z.url({ protocol: /^https?$/ }),
  ALLOTR_SECRET_KEY: z.string().min(32),
  // Loopback by default; the container image listens on all interfaces.
  ALLOTR_HOST: z.string().min(1).default('127.0.0.1'),
  ALLOTR_PORT: z.coerce.number().int().min(0).max(65535).default(8080),
  ALLOTR_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
