import {
  accountListSchema,
  accountSchema,
  archiveAccountBodySchema,
  createAccountBodySchema,
  idParamSchema,
  listAccountsQuerySchema,
  updateAccountBodySchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  archiveAccount,
  createAccount,
  getAccount,
  listAccounts,
  updateAccount,
} from '../../ledger/accounts.ts';
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
      'Open accounts, and archived ones on request.',
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

export function registerLedgerAccountRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;
  app.use('/v1/accounts', requireUser(deps));
  app.use('/v1/accounts/*', requireUser(deps));

  app.openapi(listRoute, async (c) => {
    const { includeArchived } = c.req.valid('query');
    const accounts = await listAccounts(
      db,
      c.get('user').id,
      now(),
      includeArchived === true,
    );
    return c.json({ accounts }, 200);
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
}
