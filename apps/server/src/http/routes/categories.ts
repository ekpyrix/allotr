import {
  categoryListSchema,
  categorySchema,
  createCategoryBodySchema,
  deleteCategoryQuerySchema,
  idParamSchema,
  listCategoriesQuerySchema,
  updateCategoryBodySchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} from '../../ledger/categories.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import { requireUser } from '../guards.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';

// Two-level categories (FR-L7).

const tags = ['Categories'];
const invalid = problemResponse('The request is invalid.');
const notFound = problemResponse('There is no such category.');
const signedIn = { 401: unauthenticated, 403: forbidden };
const nameTaken = problemResponse(
  'Another category at this level has this name.',
);

const listRoute = createRoute({
  method: 'get',
  path: '/v1/categories',
  tags,
  summary: 'List categories',
  description:
    'Parents come before their subcategories. Merged categories are left out unless asked for.',
  request: { query: listCategoriesQuerySchema },
  responses: {
    200: json(categoryListSchema, 'The categories.'),
    400: invalid,
    ...signedIn,
  },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/v1/categories',
  tags,
  summary: 'Add a category or subcategory',
  request: {
    body: {
      content: { 'application/json': { schema: createCategoryBodySchema } },
    },
  },
  responses: {
    201: json(categorySchema, 'The new category.'),
    400: invalid,
    ...signedIn,
    409: nameTaken,
  },
});

const getRoute = createRoute({
  method: 'get',
  path: '/v1/categories/{id}',
  tags,
  summary: 'One category, including a merged one',
  request: { params: idParamSchema },
  responses: {
    200: json(categorySchema, 'The category.'),
    ...signedIn,
    404: notFound,
  },
});

const updateRoute = createRoute({
  method: 'patch',
  path: '/v1/categories/{id}',
  tags,
  summary: 'Rename, move or reorder a category',
  request: {
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: updateCategoryBodySchema } },
    },
  },
  responses: {
    200: json(categorySchema, 'The category after the change.'),
    400: invalid,
    ...signedIn,
    404: notFound,
    409: nameTaken,
  },
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/v1/categories/{id}',
  tags,
  summary: 'Delete a category, or merge it into another',
  description:
    'A category that entries use must be merged (`mergeInto`); it then stays only to resolve those entries.',
  request: { params: idParamSchema, query: deleteCategoryQuerySchema },
  responses: {
    204: { description: 'Deleted or merged.' },
    400: invalid,
    ...signedIn,
    404: notFound,
    409: problemResponse(
      'The category is in use (code `category_in_use`) or has subcategories (code `category_has_children`).',
    ),
  },
});

export function registerCategoryRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;
  app.use('/v1/categories', requireUser(deps));
  app.use('/v1/categories/*', requireUser(deps));

  app.openapi(listRoute, async (c) => {
    const { includeMerged } = c.req.valid('query');
    const categories = await listCategories(
      db,
      c.get('user').id,
      includeMerged === true,
    );
    return c.json({ categories }, 200);
  });

  app.openapi(createRouteDef, async (c) => {
    const body = c.req.valid('json');
    return c.json(await createCategory(db, c.get('user').id, body, now()), 201);
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json(await getCategory(db, c.get('user').id, id), 200);
  });

  app.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    return c.json(
      await updateCategory(db, c.get('user').id, id, body, now()),
      200,
    );
  });

  app.openapi(deleteRoute, async (c) => {
    const { id } = c.req.valid('param');
    const { mergeInto } = c.req.valid('query');
    await deleteCategory(db, c.get('user').id, id, mergeInto, now());
    return c.body(null, 204);
  });
}
