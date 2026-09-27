import {
  billListSchema,
  billPaymentParamSchema,
  billSchema,
  createBillBodySchema,
  createBillPaymentBodySchema,
  idParamSchema,
  updateBillBodySchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  createBill,
  deleteBill,
  getBill,
  listBills,
  payBill,
  unpayBill,
  updateBill,
} from '../../ledger/bills.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import { requireUser } from '../guards.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';

// Bills, only as far as the reserve in today's figures needs them
// (docs/domain.md "Daily usable"). M4 adds cadence and payment flows.

const tags = ['Bills'];
const invalid = problemResponse('The request is invalid.');
const notFound = problemResponse('There is no such bill.');
const signedIn = { 401: unauthenticated, 403: forbidden };

const listRoute = createRoute({
  method: 'get',
  path: '/v1/bills',
  tags,
  summary: 'List bills',
  responses: { 200: json(billListSchema, 'Every bill.'), ...signedIn },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/v1/bills',
  tags,
  summary: 'Add a monthly bill',
  description:
    'Each active bill due in the cycle is reserved from the day the cycle opens until it is marked paid.',
  request: {
    body: {
      content: { 'application/json': { schema: createBillBodySchema } },
    },
  },
  responses: {
    201: json(billSchema, 'The new bill.'),
    400: problemResponse(
      "The request is invalid, or the amount is not in the account's currency (`currency_mismatch`).",
    ),
    ...signedIn,
    404: problemResponse('There is no such account.'),
    409: problemResponse('The account is archived (`account_archived`).'),
  },
});

const getRoute = createRoute({
  method: 'get',
  path: '/v1/bills/{id}',
  tags,
  summary: 'One bill',
  request: { params: idParamSchema },
  responses: { 200: json(billSchema, 'The bill.'), ...signedIn, 404: notFound },
});

const updateRoute = createRoute({
  method: 'patch',
  path: '/v1/bills/{id}',
  tags,
  summary: 'Change a bill',
  description: 'An inactive bill is no longer reserved.',
  request: {
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: updateBillBodySchema } },
    },
  },
  responses: {
    200: json(billSchema, 'The bill after the change.'),
    400: invalid,
    ...signedIn,
    404: notFound,
  },
});

const deleteRouteDef = createRoute({
  method: 'delete',
  path: '/v1/bills/{id}',
  tags,
  summary: 'Delete a bill',
  description: 'Removes the bill and its payment marks. Entries stay.',
  request: { params: idParamSchema },
  responses: { 204: { description: 'Deleted.' }, ...signedIn, 404: notFound },
});

const payRoute = createRoute({
  method: 'post',
  path: '/v1/bills/{id}/payments',
  tags,
  summary: 'Mark a due date paid',
  description:
    'Releases the reserve for that due date from `paidOn` (today when omitted). Link the entry that paid it with `transactionId`; recording the entry itself is a separate transaction.',
  request: {
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: createBillPaymentBodySchema } },
    },
  },
  responses: {
    201: json(billSchema, 'The bill with the payment.'),
    400: problemResponse(
      'The request is invalid, or the bill is not due that day (`not_a_due_date`).',
    ),
    ...signedIn,
    404: problemResponse('There is no such bill or entry.'),
    409: problemResponse(
      'That due date is already paid (`bill_already_paid`).',
    ),
  },
});

const unpayRoute = createRoute({
  method: 'delete',
  path: '/v1/bills/{id}/payments/{dueOn}',
  tags,
  summary: 'Undo a payment mark',
  description: 'The due date is reserved again. Entries stay.',
  request: { params: billPaymentParamSchema },
  responses: {
    200: json(billSchema, 'The bill without the payment.'),
    400: invalid,
    ...signedIn,
    404: problemResponse(
      'There is no such bill, or that due date is not paid.',
    ),
  },
});

export function registerBillRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;
  app.use('/v1/bills', requireUser(deps));
  app.use('/v1/bills/*', requireUser(deps));

  app.openapi(listRoute, async (c) =>
    c.json({ bills: await listBills(db, c.get('user').id) }, 200),
  );

  app.openapi(createRouteDef, async (c) =>
    c.json(
      await createBill(db, c.get('user').id, c.req.valid('json'), now()),
      201,
    ),
  );

  app.openapi(getRoute, async (c) =>
    c.json(await getBill(db, c.get('user').id, c.req.valid('param').id), 200),
  );

  app.openapi(updateRoute, async (c) =>
    c.json(
      await updateBill(
        db,
        c.get('user').id,
        c.req.valid('param').id,
        c.req.valid('json'),
        now(),
      ),
      200,
    ),
  );

  app.openapi(deleteRouteDef, async (c) => {
    await deleteBill(db, c.get('user').id, c.req.valid('param').id);
    return c.body(null, 204);
  });

  app.openapi(payRoute, async (c) =>
    c.json(
      await payBill(
        db,
        c.get('user').id,
        c.req.valid('param').id,
        c.req.valid('json'),
        now(),
      ),
      201,
    ),
  );

  app.openapi(unpayRoute, async (c) => {
    const { id, dueOn } = c.req.valid('param');
    return c.json(await unpayBill(db, c.get('user').id, id, dueOn), 200);
  });
}
