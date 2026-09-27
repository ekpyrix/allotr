import {
  idParamSchema,
  tagBodySchema,
  tagListSchema,
  tagSchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { createTag, listTags, renameTag } from '../../ledger/tags.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import { requireUser } from '../guards.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';

// Free-form tags (FR-L7).

const tags = ['Tags'];
const invalid = problemResponse('The request is invalid.');
const signedIn = { 401: unauthenticated, 403: forbidden };
const nameTaken = problemResponse('A tag with this name exists.');
const body = {
  content: { 'application/json': { schema: tagBodySchema } },
};

const listRoute = createRoute({
  method: 'get',
  path: '/v1/tags',
  tags,
  summary: 'List tags',
  responses: { 200: json(tagListSchema, 'The tags, by name.'), ...signedIn },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/v1/tags',
  tags,
  summary: 'Add a tag',
  request: { body },
  responses: {
    201: json(tagSchema, 'The new tag.'),
    400: invalid,
    ...signedIn,
    409: nameTaken,
  },
});

const renameRoute = createRoute({
  method: 'patch',
  path: '/v1/tags/{id}',
  tags,
  summary: 'Rename a tag',
  request: { params: idParamSchema, body },
  responses: {
    200: json(tagSchema, 'The renamed tag.'),
    400: invalid,
    ...signedIn,
    404: problemResponse('There is no such tag.'),
    409: nameTaken,
  },
});

export function registerTagRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;
  app.use('/v1/tags', requireUser(deps));
  app.use('/v1/tags/*', requireUser(deps));

  app.openapi(listRoute, async (c) =>
    c.json({ tags: await listTags(db, c.get('user').id) }, 200),
  );

  app.openapi(createRouteDef, async (c) => {
    const { name } = c.req.valid('json');
    return c.json(await createTag(db, c.get('user').id, name, now()), 201);
  });

  app.openapi(renameRoute, async (c) => {
    const { id } = c.req.valid('param');
    const { name } = c.req.valid('json');
    return c.json(await renameTag(db, c.get('user').id, id, name, now()), 200);
  });
}
