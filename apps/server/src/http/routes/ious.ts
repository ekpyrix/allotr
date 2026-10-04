import {
  convertedIouSchema,
  convertToIouBodySchema,
  coverPreviewSchema,
  createdIousSchema,
  createIouBodySchema,
  idempotencyHeaderSchema,
  idParamSchema,
  iouListSchema,
  iouSchema,
  listIousQuerySchema,
  peopleQuerySchema,
  peopleSchema,
  repaymentBodySchema,
  settledIousSchema,
  updateIouBodySchema,
  writeOffBodySchema,
  writtenOffIouSchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  convertToIou,
  createIou,
  listIous,
  listPeople,
  previewIouCover,
  recordRepayment,
  updateIou,
  writeOffIou,
} from '../../ledger/ious.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import { requireUser } from '../guards.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';

// IOUs and split bills (ADR 0024, FR-L6).

const tags = ['IOUs'];
const invalid = problemResponse('The request is invalid.');
const signedIn = { 401: unauthenticated, 403: forbidden };
const notFound = problemResponse('There is no such IOU.');

const listRoute = createRoute({
  method: 'get',
  path: '/v1/ious',
  tags,
  summary: 'IOUs and what is outstanding',
  description:
    'Money owed to the user and money the user owes, one row per person per entry, with what was repaid or written off and what is left. `totals` are outstanding amounts in the default currency; currencies without a rate are left out and listed in `missingRates`. Money owed to the user lowers free money from the day it is lent but is never spending; money the user owes is reserved like a bill from the day it is recorded until it is paid. IOUs of an undone entry are left out.',
  request: { query: listIousQuerySchema },
  responses: {
    200: json(iouListSchema, 'The IOUs and their totals.'),
    ...signedIn,
  },
});

const peopleRoute = createRoute({
  method: 'get',
  path: '/v1/ious/people',
  tags,
  summary: 'Names used before',
  description:
    'Free-text names from earlier IOUs, most recently used first, for autocomplete. People are not contacts: a name is only text.',
  request: { query: peopleQuerySchema },
  responses: { 200: json(peopleSchema, 'The matching names.'), ...signedIn },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/v1/ious',
  tags,
  summary: 'Lend, borrow or split a bill',
  description:
    "One entry and one IOU per person. `owed-to-me` posts what each person owes to the Receivables account, from the paying account; with `ownShare` it is a split bill: the user's share is an expense in its category and the rest is receivable, all from one payment. The cash lent is covered like a shortfall (free money, then the Buffer, then budgets) but is not spending. `owed-by-me` records money received and owed back. With an `Idempotency-Key` header, repeating a request returns what the key first created (200).",
  request: {
    headers: idempotencyHeaderSchema,
    body: { content: { 'application/json': { schema: createIouBodySchema } } },
  },
  responses: {
    200: json(createdIousSchema, 'What this idempotency key created earlier.'),
    201: json(createdIousSchema, 'The entry and its IOUs.'),
    400: invalid,
    ...signedIn,
    404: problemResponse('There is no such account.'),
    409: problemResponse('The account is archived.'),
  },
});

const convertRoute = createRoute({
  method: 'post',
  path: '/v1/ious/from/{id}',
  tags,
  summary: 'Split a logged expense with people',
  description:
    "Turns a logged expense into a split bill, or a loan when people owe all of it. The expense is undone and replaced by one entry with the same account, amount, date, note and tags: each person's line is receivable and the rest is the user's own share, an expense in `categoryId` (the expense's category by default). Only a live expense in one category, in the account's currency and tied to no IOU, can be turned. With an `Idempotency-Key` header, repeating a request returns what the key first created (200).",
  request: {
    headers: idempotencyHeaderSchema,
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: convertToIouBodySchema } },
    },
  },
  responses: {
    200: json(convertedIouSchema, 'What this idempotency key created earlier.'),
    201: json(convertedIouSchema, 'The undo, the new entry and its IOUs.'),
    400: problemResponse(
      'The request is invalid, people owe more than the expense (`owed_exceeds_total`), or in another currency (`currency_mismatch`).',
    ),
    ...signedIn,
    404: problemResponse('There is no such entry.'),
    409: problemResponse(
      'Not a live plain expense (`not_plain_expense`), or the account is archived.',
    ),
  },
});

const previewRoute = createRoute({
  method: 'post',
  path: '/v1/ious/cover-preview',
  tags,
  summary: 'Preview the cover for lending',
  description:
    'Takes the body of `POST /v1/ious` for money owed to the user and works out, without recording anything, what the cash lent would take from free money, the Buffer and budgets. Same response as `POST /v1/budgets/cover-preview`.',
  request: {
    body: { content: { 'application/json': { schema: createIouBodySchema } } },
  },
  responses: {
    200: json(coverPreviewSchema, 'The cover the entry would get.'),
    400: invalid,
    ...signedIn,
    404: problemResponse('There is no such account.'),
  },
});

const repayRoute = createRoute({
  method: 'post',
  path: '/v1/ious/repayments',
  tags,
  summary: 'Record a payment that settles IOUs',
  description:
    "One entry that either names every IOU it settles and by how much (`settles`, never more than is left) or names a `person` and an `amount`, which settles that person's oldest open IOU first (by the day it was recorded), the surplus going to the next. All IOUs go the same way and are in the account's currency. Money paid back to the user refills what the loan's cover took, in reverse order, and the rest is free money again; money the user pays releases the reserve. Neither is spending. Undo the entry with `POST /v1/transactions/{id}/reverse` and the IOUs are owed again.",
  request: {
    body: { content: { 'application/json': { schema: repaymentBodySchema } } },
  },
  responses: {
    201: json(settledIousSchema, 'The entry and the IOUs it settled.'),
    400: invalid,
    ...signedIn,
    404: problemResponse('There is no such IOU or account.'),
    409: problemResponse('More than is still owed (`over_settled`).'),
  },
});

const writeOffRoute = createRoute({
  method: 'post',
  path: '/v1/ious/{id}/write-off',
  tags,
  summary: 'Write off what is still owed to the user',
  description:
    'Turns the remainder into an expense in the chosen category. No cash moves, so it is not spending against the day. Allowed from `writeOffFrom` on (the `iouWriteOffAfterDays` setting after the due date, or after the day it was recorded when there is none).',
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: writeOffBodySchema } } },
  },
  responses: {
    201: json(writtenOffIouSchema, 'The entry and the settled IOU.'),
    400: invalid,
    ...signedIn,
    404: notFound,
    409: problemResponse('Already settled, or money the user owes.'),
  },
});

const updateRoute = createRoute({
  method: 'patch',
  path: '/v1/ious/{id}',
  tags,
  summary: 'Correct a name or set a due date',
  description:
    'Only the name and the due date can change; the amount and the entry are part of the ledger.',
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: updateIouBodySchema } } },
  },
  responses: {
    200: json(iouSchema, 'The IOU.'),
    400: invalid,
    ...signedIn,
    404: notFound,
  },
});

export function registerIouRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;
  app.use('/v1/ious', requireUser(deps));
  app.use('/v1/ious/*', requireUser(deps));

  app.openapi(listRoute, async (c) =>
    c.json(
      await listIous(db, c.get('user').id, c.req.valid('query'), now()),
      200,
    ),
  );

  app.openapi(peopleRoute, async (c) =>
    c.json(await listPeople(db, c.get('user').id, c.req.valid('query')), 200),
  );

  app.openapi(previewRoute, async (c) =>
    c.json(
      await previewIouCover(db, c.get('user').id, c.req.valid('json'), now()),
      200,
    ),
  );

  app.openapi(repayRoute, async (c) =>
    c.json(
      await recordRepayment(db, c.get('user').id, c.req.valid('json'), now()),
      201,
    ),
  );

  app.openapi(createRouteDef, async (c) => {
    const { replayed, ...created } = await createIou(
      db,
      c.get('user').id,
      c.req.valid('json'),
      c.req.valid('header')['idempotency-key'],
      now(),
    );
    return replayed ? c.json(created, 200) : c.json(created, 201);
  });

  app.openapi(convertRoute, async (c) => {
    const { replayed, ...converted } = await convertToIou(
      db,
      c.get('user').id,
      c.req.valid('param').id,
      c.req.valid('json'),
      c.req.valid('header')['idempotency-key'],
      now(),
    );
    return replayed ? c.json(converted, 200) : c.json(converted, 201);
  });

  app.openapi(writeOffRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json(
      await writeOffIou(db, c.get('user').id, id, c.req.valid('json'), now()),
      201,
    );
  });

  app.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json(
      await updateIou(db, c.get('user').id, id, c.req.valid('json'), now()),
      200,
    );
  });
}
