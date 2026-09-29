import { bundleSchema, exportQuerySchema } from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import { toBeancount } from '../../ledger/export-beancount.ts';
import { toBundle } from '../../ledger/export-bundle.ts';
import { toCsv } from '../../ledger/export-csv.ts';
import { loadSnapshot } from '../../ledger/export-snapshot.ts';
import { userToday } from '../../ledger/store.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import { requireUser } from '../guards.ts';
import { forbidden, problemResponse, unauthenticated } from '../openapi.ts';

// Export of the whole ledger (FR-U3, FR-U4) as a download. The JSON bundle
// imports back with `POST /v1/import`; CSV and Beancount are for other
// tools.

const types = {
  json: 'application/json',
  csv: 'text/csv; charset=utf-8',
  beancount: 'text/plain; charset=utf-8',
} as const;

const exportRoute = createRoute({
  method: 'get',
  path: '/v1/export',
  tags: ['Export'],
  summary: 'Download all ledger data',
  description:
    '`json` is the import bundle (live entries only; undone entries are left out with their undos). `csv` has one row per posting and `beancount` one transaction per entry, undos included. Sent as an attachment named `allotr-export-<today>.<format>`.',
  request: { query: exportQuerySchema },
  responses: {
    200: {
      description: 'The export file.',
      content: {
        [types.json]: { schema: bundleSchema },
        'text/csv': { schema: z.string() },
        'text/plain': { schema: z.string() },
      },
    },
    400: problemResponse('The format is not json, csv or beancount.'),
    401: unauthenticated,
    403: forbidden,
  },
});

export function registerExportRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;
  app.use('/v1/export', requireUser(deps));

  app.openapi(exportRoute, async (c) => {
    const { format } = c.req.valid('query');
    const userId = c.get('user').id;
    const { snapshot, today } = await db.transaction().execute(async (trx) => ({
      snapshot: await loadSnapshot(trx, userId),
      today: await userToday(trx, userId, now()),
    }));
    const body =
      format === 'csv'
        ? toCsv(snapshot)
        : format === 'beancount'
          ? toBeancount(snapshot, today)
          : `${JSON.stringify(toBundle(snapshot), null, 2)}\n`;
    return c.body(body, 200, {
      'content-type': types[format],
      'content-disposition': `attachment; filename="allotr-export-${today}.${format}"`,
      'cache-control': 'no-store',
    });
  });
}
