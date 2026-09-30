import {
  accountHistoryQuerySchema,
  accountHistorySchema,
  accountListSchema,
  accountSchema,
  archiveAccountBodySchema,
  archiveImpactSchema,
  createAccountBodySchema,
  idParamSchema,
  listAccountsQuerySchema,
  reconcileBodySchema,
  reconcileResultSchema,
  updateAccountBodySchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  accountHistory,
  archiveAccount,
  archiveImpact,
  createAccount,
  getAccount,
  listAccounts,
  updateAccount,
} from '../../ledger/accounts.ts';
import { reconcileAccount } from '../../ledger/reconcile.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import { requireUser } from '../guards.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';

// Ledger accounts: where money sits (FR-L2, FR-L3, FR-L8).

const tags = ['Ledger accounts'];
const invalid = problemResponse('The request is invalid.');
const notFound = problemResponse('There is no such account.');
const signedIn = { 401: unauthenticated, 403: forbidden };

const listRoute = createRoute({
  method: 'get',
  path: '/v1/accounts',
  tags,
  summary: 'List accounts with their balances',
  request: { query: listAccountsQuerySchema },
  responses: {
    200: json(
      accountListSchema,
      'Open accounts, and archived ones on request, with totals per budget group.',
    ),
    400: invalid,
    ...signedIn,
  },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/v1/accounts',
  tags,
  summary: 'Open an account',
  description:
    'The currency is fixed at creation. An opening balance is posted against Equity:Opening.',
  request: {
    body: {
      content: { 'application/json': { schema: createAccountBodySchema } },
    },
  },
  responses: {
    201: json(accountSchema, 'The new account.'),
    400: invalid,
    ...signedIn,
    409: problemResponse('Another open account has this name.'),
  },
});

const getRoute = createRoute({
  method: 'get',
  path: '/v1/accounts/{id}',
  tags,
  summary: 'One account',
  request: { params: idParamSchema },
  responses: {
    200: json(accountSchema, 'The account.'),
    ...signedIn,
    404: notFound,
  },
});

const updateRoute = createRoute({
  method: 'patch',
  path: '/v1/accounts/{id}',
  tags,
  summary: 'Rename an account or move it on or off budget',
  description:
    'A change of budget group takes effect today and is recorded as a dated system transaction.',
  request: {
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: updateAccountBodySchema } },
    },
  },
  responses: {
    200: json(accountSchema, 'The account after the change.'),
    400: invalid,
    ...signedIn,
    404: notFound,
    409: problemResponse(
      'The name is taken, or the account is archived (code `account_archived`).',
    ),
  },
});

const archiveRoute = createRoute({
  method: 'post',
  path: '/v1/accounts/{id}/archive',
  tags,
  summary: 'Archive an account',
  description:
    'Only at zero balance. Otherwise the answer is `account_not_empty`, unless `settle` transfers the balance to another account in the same currency or writes it off first.',
  request: {
    params: idParamSchema,
    body: {
      required: false,
      content: { 'application/json': { schema: archiveAccountBodySchema } },
    },
  },
  responses: {
    200: json(accountSchema, 'The archived account.'),
    400: invalid,
    ...signedIn,
    404: notFound,
    409: problemResponse(
      'The account still holds money (code `account_not_empty`), or the transfer target is archived.',
    ),
  },
});

const archiveImpactRoute = createRoute({
  method: 'get',
  path: '/v1/accounts/{id}/archive-impact',
  tags,
  summary: "What archiving would do to today's figure",
  description:
    "For each way of clearing the balance before archiving, how much today's left-today figure would drop, from the same projection as `/v1/today` with the settling entry added. A write-off from an on-budget account counts as spending; a transfer to an off-budget account lowers the allowance. `leftToday` is the figure now and each option's `leftTodayAfter` the figure once it is recorded. Nothing is recorded.",
  request: { params: idParamSchema },
  responses: {
    200: json(archiveImpactSchema, "The drop in today's figure per option."),
    ...signedIn,
    404: notFound,
  },
});

const historyRoute = createRoute({
  method: 'get',
  path: '/v1/accounts/{id}/history',
  tags,
  summary: "An account's balance day by day",
  description:
    "The end-of-day balance in the account's currency for each of the last `days` days (7 to 365, 30 by default), today included, oldest first. Derived from the ledger by entry date, so a back-dated entry changes it at once.",
  request: { params: idParamSchema, query: accountHistoryQuerySchema },
  responses: {
    200: json(accountHistorySchema, 'One point per day.'),
    400: invalid,
    ...signedIn,
    404: notFound,
  },
});

const reconcileRoute = createRoute({
  method: 'post',
  path: '/v1/accounts/{id}/reconcile',
  tags,
  summary: "Reconcile an account with the bank's balance",
  description:
    "Compares the bank's balance with the ledger's at the end of `on` (today by default). Give either `balance` (negative for money owed) or, for a debt, `amountOwed` as the statement shows it (positive; compared as its negative). A match is recorded as the account's last reconciled date. A difference is only reported (`reconciled: false`) unless `adjust` is set: the difference is then posted on `on` as an expense to the Unrecorded category, or an income to Unrecorded income, and recorded in the same database transaction. With `expectedDifference`, an adjustment is refused (`reconcile_stale`) if the difference moved since the user saw it; if it dropped to zero, a match is recorded instead. The adjustment is an ordinary entry: undoing it also takes back that reconciliation.",
  request: {
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: reconcileBodySchema } },
    },
  },
  responses: {
    200: json(reconcileResultSchema, 'The comparison and what was recorded.'),
    400: invalid,
    ...signedIn,
    404: notFound,
    409: problemResponse(
      'The account is archived (`account_archived`), the difference moved (`reconcile_stale`), or a category named Unrecorded has the other kind (`reconcile_category_conflict`).',
    ),
  },
});

export function registerLedgerAccountRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;
  app.use('/v1/accounts', requireUser(deps));
  app.use('/v1/accounts/*', requireUser(deps));

  app.openapi(listRoute, async (c) => {
    const { includeArchived } = c.req.valid('query');
    const list = await listAccounts(
      db,
      c.get('user').id,
      now(),
      includeArchived === true,
    );
    return c.json(list, 200);
  });

  app.openapi(createRouteDef, async (c) => {
    const body = c.req.valid('json');
    return c.json(await createAccount(db, c.get('user').id, body, now()), 201);
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json(await getAccount(db, c.get('user').id, id, now()), 200);
  });

  app.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    return c.json(
      await updateAccount(db, c.get('user').id, id, body, now()),
      200,
    );
  });

  app.openapi(archiveRoute, async (c) => {
    const { id } = c.req.valid('param');
    const { settle } = c.req.valid('json');
    return c.json(
      await archiveAccount(db, c.get('user').id, id, settle, now()),
      200,
    );
  });

  app.openapi(archiveImpactRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json(await archiveImpact(db, c.get('user').id, id, now()), 200);
  });

  app.openapi(historyRoute, async (c) => {
    const { id } = c.req.valid('param');
    const { days } = c.req.valid('query');
    return c.json(
      await accountHistory(db, c.get('user').id, id, days, now()),
      200,
    );
  });

  app.openapi(reconcileRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    return c.json(
      await reconcileAccount(db, c.get('user').id, id, body, now()),
      200,
    );
  });
}
