import {
  createGoalBodySchema,
  goalListSchema,
  goalSchema,
  idParamSchema,
  listGoalsQuerySchema,
  updateGoalBodySchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { createGoal, listGoals, updateGoal } from '../../ledger/goals.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import { requireUser } from '../guards.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';

// Savings goals: a target on a savings pool or account, with progress
// derived from the ledger (ADR 0021).

const tags = ['Goals'];
const invalid = problemResponse('The request is invalid.');
const signedIn = { 401: unauthenticated, 403: forbidden };

const listRoute = createRoute({
  method: 'get',
  path: '/v1/goals',
  tags,
  summary: 'List savings goals with their progress',
  description:
    'Progress is what the goal’s pool or account holds today, in the goal’s currency at the latest rate. Nothing is moved.',
  request: { query: listGoalsQuerySchema },
  responses: {
    200: json(goalListSchema, 'Goals, and archived ones on request.'),
    400: invalid,
    ...signedIn,
  },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/v1/goals',
  tags,
  summary: 'Add a savings goal',
  description:
    'Give a savings pool or an account in one (`goal_not_savings` otherwise). A pool or account has one goal at a time (`goal_target_taken`).',
  request: {
    body: {
      content: { 'application/json': { schema: createGoalBodySchema } },
    },
  },
  responses: {
    201: json(goalSchema, 'The new goal.'),
    400: invalid,
    ...signedIn,
    404: problemResponse('There is no such pool or account.'),
    409: problemResponse(
      'The name or target is taken, or the target is not savings.',
    ),
  },
});

const updateRoute = createRoute({
  method: 'patch',
  path: '/v1/goals/{id}',
  tags,
  summary: 'Rename, retarget, reschedule or archive a goal',
  request: {
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: updateGoalBodySchema } },
    },
  },
  responses: {
    200: json(goalSchema, 'The goal after the change.'),
    400: invalid,
    ...signedIn,
    404: problemResponse('There is no such goal.'),
    409: problemResponse('The name or target is taken.'),
  },
});

export function registerGoalRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;
  app.use('/v1/goals', requireUser(deps));
  app.use('/v1/goals/*', requireUser(deps));

  app.openapi(listRoute, async (c) => {
    const { includeArchived } = c.req.valid('query');
    return c.json(
      await listGoals(db, c.get('user').id, now(), includeArchived === true),
      200,
    );
  });

  app.openapi(createRouteDef, async (c) =>
    c.json(
      await createGoal(db, c.get('user').id, c.req.valid('json'), now()),
      201,
    ),
  );

  app.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json(
      await updateGoal(db, c.get('user').id, id, c.req.valid('json'), now()),
      200,
    );
  });
}
