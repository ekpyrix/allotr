import {
  appearanceBodySchema,
  appearanceSchema,
  customThemeListSchema,
  customThemeSchema,
  idParamSchema,
  themeBodySchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  createTheme,
  deleteTheme,
  listThemes,
  readAppearance,
  saveAppearance,
  updateTheme,
} from '../../appearance.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';

// Theme mode, the theme for each scheme, and custom themes per user
// (FR-W5). The `/v1/settings/*` user guard is installed
// by registerTodayRoutes, which is registered first.

const signedIn = { 401: unauthenticated, 403: forbidden };
const invalid = problemResponse('The request is invalid.');
const themeBody = {
  content: { 'application/json': { schema: themeBodySchema } },
};
const unknownTheme = problemResponse('There is no such theme.');
const refusedTheme = problemResponse(
  'Some colour pairs fail WCAG 2.2 AA (`theme_contrast`); `errors` lists each failing pair at `/tokens/<foreground>`.',
);
const themeConflict = problemResponse(
  'The name is taken (`theme_name_taken`) or the limit of custom themes is reached (`theme_limit`).',
);

const getAppearanceRoute = createRoute({
  method: 'get',
  path: '/v1/settings/appearance',
  tags: ['Settings'],
  summary: 'Appearance settings',
  description:
    '`system` follows the device light or dark preference. `light` and `dark` name the theme used for each scheme: a shipped theme id or a custom theme id.',
  responses: {
    200: json(appearanceSchema, 'Current appearance settings.'),
    ...signedIn,
  },
});

const putAppearanceRoute = createRoute({
  method: 'put',
  path: '/v1/settings/appearance',
  tags: ['Settings'],
  summary: 'Change appearance settings',
  description: 'A slot left out keeps its current theme.',
  request: {
    body: {
      content: { 'application/json': { schema: appearanceBodySchema } },
    },
  },
  responses: {
    200: json(appearanceSchema, 'Appearance settings after the change.'),
    400: invalid,
    ...signedIn,
    422: problemResponse(
      'A slot names an unknown theme (`theme_not_found`) or one of the other scheme (`theme_scheme_mismatch`).',
    ),
  },
});

const listThemesRoute = createRoute({
  method: 'get',
  path: '/v1/settings/themes',
  tags: ['Settings'],
  summary: 'Custom themes',
  responses: {
    200: json(customThemeListSchema, 'Custom themes, oldest first.'),
    ...signedIn,
  },
});

const createThemeRoute = createRoute({
  method: 'post',
  path: '/v1/settings/themes',
  tags: ['Settings'],
  summary: 'Add a custom theme',
  description: 'Every theme must pass the contrast validator.',
  request: { body: themeBody },
  responses: {
    201: json(customThemeSchema, 'The new theme.'),
    400: invalid,
    ...signedIn,
    409: themeConflict,
    422: refusedTheme,
  },
});

const updateThemeRoute = createRoute({
  method: 'put',
  path: '/v1/settings/themes/{id}',
  tags: ['Settings'],
  summary: 'Change a custom theme',
  description:
    'If the scheme changes while the theme is in use, that slot goes back to its default theme.',
  request: { params: idParamSchema, body: themeBody },
  responses: {
    200: json(customThemeSchema, 'The theme after the change.'),
    400: invalid,
    ...signedIn,
    404: unknownTheme,
    409: themeConflict,
    422: refusedTheme,
  },
});

const deleteThemeRoute = createRoute({
  method: 'delete',
  path: '/v1/settings/themes/{id}',
  tags: ['Settings'],
  summary: 'Delete a custom theme',
  description: 'A slot that used it goes back to its default theme.',
  request: { params: idParamSchema },
  responses: {
    204: { description: 'Deleted.' },
    ...signedIn,
    404: unknownTheme,
  },
});

export function registerAppearanceRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;

  app.openapi(getAppearanceRoute, async (c) =>
    c.json(await readAppearance(db, c.get('user').id), 200),
  );

  app.openapi(putAppearanceRoute, async (c) =>
    c.json(
      await saveAppearance(db, c.get('user').id, c.req.valid('json'), now()),
      200,
    ),
  );

  app.openapi(listThemesRoute, async (c) =>
    c.json({ themes: await listThemes(db, c.get('user').id) }, 200),
  );

  app.openapi(createThemeRoute, async (c) =>
    c.json(
      await createTheme(db, c.get('user').id, c.req.valid('json'), now()),
      201,
    ),
  );

  app.openapi(updateThemeRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json(
      await updateTheme(db, c.get('user').id, id, c.req.valid('json'), now()),
      200,
    );
  });

  app.openapi(deleteThemeRoute, async (c) => {
    const { id } = c.req.valid('param');
    await deleteTheme(db, c.get('user').id, id, now());
    return c.body(null, 204);
  });
}
