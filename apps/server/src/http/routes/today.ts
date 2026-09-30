import {
  ledgerSettingsSchema,
  todaySchema,
  updateLedgerSettingsBodySchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  readLedgerSettings,
  updateLedgerSettings,
} from '../../ledger/ledger-settings.ts';
import { todayFigures } from '../../ledger/today.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import { requireUser } from '../guards.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';

// Today's figures and the settings they depend on (FR-C2, FR-C4, FR-C5,
// FR-X2).

const signedIn = { 401: unauthenticated, 403: forbidden };

const todayRoute = createRoute({
  method: 'get',
  path: '/v1/today',
  tags: ['Today'],
  summary: "Today's figures",
  description:
    "Derived from the ledger by entry date for the user's calendar day, so a back-dated entry changes them at once. Amounts are in the default currency; currencies without a rate are left out and listed in `missingRates`.",
  responses: {
    200: json(todaySchema, "Today's figures."),
    ...signedIn,
  },
});

const getSettingsRoute = createRoute({
  method: 'get',
  path: '/v1/settings/ledger',
  tags: ['Settings'],
  summary: 'Ledger settings',
  responses: {
    200: json(ledgerSettingsSchema, 'Current ledger settings.'),
    ...signedIn,
  },
});

const patchSettingsRoute = createRoute({
  method: 'patch',
  path: '/v1/settings/ledger',
  tags: ['Settings'],
  summary: 'Change ledger settings',
  description:
    'Switching the default currency changes how figures are reported, never the entries. `paydayRule` is `fixed` (the default: `paydayDay` of the month), `last-working-day` (the last Monday to Friday of the month) or `manual` (set `paydayOverride` each cycle; `paydayDay` stands in until then). `paydayOverride: null` clears the override.',
  request: {
    body: {
      content: {
        'application/json': { schema: updateLedgerSettingsBodySchema },
      },
    },
  },
  responses: {
    200: json(ledgerSettingsSchema, 'Settings after the change.'),
    400: problemResponse(
      'The request is invalid, or the locale (`invalid_locale`) or time zone (`invalid_time_zone`) is unknown.',
    ),
    ...signedIn,
  },
});

export function registerTodayRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;
  app.use('/v1/today', requireUser(deps));
  app.use('/v1/settings/*', requireUser(deps));

  app.openapi(todayRoute, async (c) =>
    c.json(await todayFigures(db, c.get('user').id, now()), 200),
  );

  app.openapi(getSettingsRoute, async (c) =>
    c.json(await readLedgerSettings(db, c.get('user').id), 200),
  );

  app.openapi(patchSettingsRoute, async (c) =>
    c.json(
      await updateLedgerSettings(
        db,
        c.get('user').id,
        c.req.valid('json'),
        now(),
      ),
      200,
    ),
  );
}
