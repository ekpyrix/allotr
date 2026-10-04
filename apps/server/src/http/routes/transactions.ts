import {
  createTransactionBodySchema,
  dayOrderSchema,
  editedTransactionSchema,
  idempotencyHeaderSchema,
  idParamSchema,
  listTransactionsQuerySchema,
  moveTransactionBodySchema,
  reverseTransactionBodySchema,
  transactionListSchema,
  transactionSchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  createTransaction,
  editTransaction,
  getTransaction,
  listTransactions,
  moveTransaction,
  restoreTransaction,
  revertTransaction,
  reverseTransaction,
} from '../../ledger/transactions.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import { requireUser } from '../guards.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';

// Entries in the append-only ledger (FR-L1, FR-L4, FR-X3).

const tags = ['Transactions'];
const invalid = problemResponse(
  'The request is invalid, or the entry would break a ledger rule (for example `unbalanced` or `currency_mismatch`). Nothing is written.',
);
const notFound = problemResponse('There is no such entry or account.');
const signedIn = { 401: unauthenticated, 403: forbidden };
const createBody = {
  content: { 'application/json': { schema: createTransactionBodySchema } },
};

const listRoute = createRoute({
  method: 'get',
  path: '/v1/transactions',
  tags,
  summary: 'List entries, newest first',
  request: { query: listTransactionsQuerySchema },
  responses: {
    200: json(transactionListSchema, 'One page of entries.'),
    400: invalid,
    ...signedIn,
    404: problemResponse('The category or tag filter does not exist.'),
  },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/v1/transactions',
  tags,
  summary: 'Record an expense, income or transfer',
  description:
    'Cross-currency entries record both amounts. With an `Idempotency-Key` header, repeating a request returns the entry the key first created (200) instead of recording another.',
  request: { headers: idempotencyHeaderSchema, body: createBody },
  responses: {
    200: json(
      transactionSchema,
      'The entry this idempotency key created earlier.',
    ),
    201: json(transactionSchema, 'The new entry.'),
    400: invalid,
    ...signedIn,
    404: notFound,
    409: problemResponse('An account is archived (code `account_archived`).'),
  },
});

const getRoute = createRoute({
  method: 'get',
  path: '/v1/transactions/{id}',
  tags,
  summary: 'One entry',
  request: { params: idParamSchema },
  responses: {
    200: json(transactionSchema, 'The entry.'),
    ...signedIn,
    404: notFound,
  },
});

const reverseRoute = createRoute({
  method: 'post',
  path: '/v1/transactions/{id}/reverse',
  tags,
  summary: 'Undo an entry',
  description:
    'Posts a reversal that negates every posting and carries the original date, so past figures are corrected too. Nothing is deleted.',
  request: {
    params: idParamSchema,
    body: {
      content: {
        'application/json': { schema: reverseTransactionBodySchema },
      },
    },
  },
  responses: {
    201: json(transactionSchema, 'The reversal.'),
    400: invalid,
    ...signedIn,
    404: notFound,
    409: problemResponse(
      'Already undone (`already_reversed`), an undo (`reversal_of_reversal`), or on an archived account.',
    ),
  },
});

const restoreRoute = createRoute({
  method: 'post',
  path: '/v1/transactions/{id}/restore',
  tags,
  summary: 'Restore an undone entry',
  description:
    'Records a copy of an undone entry with its date, category, note, tags and postings. The entry and its undo stay as they are.',
  request: { params: idParamSchema },
  responses: {
    201: json(transactionSchema, 'The restored copy.'),
    ...signedIn,
    404: notFound,
    409: problemResponse(
      'Not undone (`not_undone`), already restored (`already_restored`), an undo or budget switch, or on an archived account.',
    ),
  },
});

const editRoute = createRoute({
  method: 'post',
  path: '/v1/transactions/{id}/edit',
  tags,
  summary: 'Replace an entry',
  description:
    'Posts a reversal of the entry plus the replacement described by the body. Nothing is updated in place. The replacement points at the entry it replaced (`replacesId`), and the list leaves the earlier version and its undo out: an edit is not a delete.',
  request: { params: idParamSchema, body: createBody },
  responses: {
    201: json(editedTransactionSchema, 'The reversal and the replacement.'),
    400: invalid,
    ...signedIn,
    404: notFound,
    409: problemResponse('Already undone, an undo, or on an archived account.'),
  },
});

const revertRoute = createRoute({
  method: 'post',
  path: '/v1/transactions/{id}/revert',
  tags,
  summary: 'Go back to an earlier version of an edited entry',
  description:
    'The entry as it stands now is replaced by a copy of this earlier version, with its date, category, note, tags and postings: a reversal plus the copy, as for any edit.',
  request: { params: idParamSchema },
  responses: {
    201: json(editedTransactionSchema, 'The reversal and the copy.'),
    ...signedIn,
    404: notFound,
    409: problemResponse(
      'Not an earlier version (`not_replaced`), the entry was deleted since (`entry_deleted`), it lends, borrows or settles an IOU (`iou_entry`), or it is on an archived account.',
    ),
  },
});

const moveRoute = createRoute({
  method: 'post',
  path: '/v1/transactions/{id}/move',
  tags,
  summary: 'Move an entry within its day',
  description:
    'Places the entry right after `afterId`, or first in its day when that is null. Only its place changes: the entry itself, its date and its amounts stay as recorded. Entries with a time of day stay in time order. Projections that take entries in order, such as budget cover, follow the new order.',
  request: {
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: moveTransactionBodySchema } },
    },
  },
  responses: {
    200: json(dayOrderSchema, "The day's entries in their new order."),
    400: problemResponse(
      '`afterId` is on another day (`different_day`) or is the entry itself.',
    ),
    ...signedIn,
    404: notFound,
    409: problemResponse(
      'The entry has a time and the move would put it out of time order (`out_of_time_order`).',
    ),
  },
});

export function registerTransactionRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;
  app.use('/v1/transactions', requireUser(deps));
  app.use('/v1/transactions/*', requireUser(deps));

  app.openapi(listRoute, async (c) =>
    c.json(
      await listTransactions(db, c.get('user').id, c.req.valid('query')),
      200,
    ),
  );

  app.openapi(createRouteDef, async (c) => {
    const key = c.req.valid('header')['idempotency-key'];
    const { transaction, replayed } = await createTransaction(
      db,
      c.get('user').id,
      c.req.valid('json'),
      key,
      now(),
    );
    return replayed ? c.json(transaction, 200) : c.json(transaction, 201);
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json(await getTransaction(db, c.get('user').id, id), 200);
  });

  app.openapi(reverseRoute, async (c) => {
    const { id } = c.req.valid('param');
    const { note } = c.req.valid('json');
    return c.json(
      await reverseTransaction(db, c.get('user').id, id, note, now()),
      201,
    );
  });

  app.openapi(restoreRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json(
      await restoreTransaction(db, c.get('user').id, id, now()),
      201,
    );
  });

  app.openapi(editRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json(
      await editTransaction(
        db,
        c.get('user').id,
        id,
        c.req.valid('json'),
        now(),
      ),
      201,
    );
  });

  app.openapi(revertRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json(
      await revertTransaction(db, c.get('user').id, id, now()),
      201,
    );
  });

  app.openapi(moveRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json(
      await moveTransaction(
        db,
        c.get('user').id,
        id,
        c.req.valid('json'),
        now(),
      ),
      200,
    );
  });
}
