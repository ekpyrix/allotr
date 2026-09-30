import {
  anyThemeBodySchema,
  appearanceBodySchema,
  appearanceSchema,
  customThemeViewListSchema,
  customThemeViewSchema,
  idParamSchema,
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
import type { Context } from 'hono';
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
  content: { 'application/json': { schema: anyThemeBodySchema } },
};

// v1 bodies (16 tokens) are deprecated under ADR 0013 since palette themes
// (ADR 0016); RFC 9745 gives the date as seconds since the epoch.
const V1_BODY_DEPRECATED = '@1790726400';

function markV1Body(c: Context<AppEnv>, body: object): void {
  if ('tokens' in body) c.header('Deprecation', V1_BODY_DEPRECATED);
}

const themeBodies =
  'Send a v2 body, `{ name, scheme, family?, palette, roles? }`: the palette is completed and each role resolved with contrast fitting (ADR 0016). A v1 body, `{ name, scheme, tokens }`, is still accepted, checked by the v1 contrast pairs and converted; it is deprecated, and the response carries a `Deprecation` header. Responses are v2 and keep `tokens` for clients before v2: the tokens sent, or ones taken from the resolved roles.';
const unknownTheme = problemResponse('There is no such theme.');
const refusedTheme = problemResponse(
  'Some colours fail WCAG 2.2 AA (`theme_contrast`). For a v2 body, `errors` lists each role that cannot meet its contrast at `/roles/<role>` (a role the body sets, or an unknown slot), or at `/palette` (a role from the default map); for a v1 body, each failing pair at `/tokens/<foreground>`.',
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
    '`system` follows the device light or dark preference. `light` and `dark` name the theme used for each scheme: a shipped theme id or a custom theme id. Before any change, they are Catppuccin Latte and Mocha. The earlier ids `light` and `dark` read as `allotr-classic-light` and `allotr-classic-dark`.',
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
    200: json(customThemeViewListSchema, 'Custom themes, oldest first.'),
    ...signedIn,
  },
});

const createThemeRoute = createRoute({
  method: 'post',
  path: '/v1/settings/themes',
  tags: ['Settings'],
  summary: 'Add a custom theme',
  description: themeBodies,
  request: { body: themeBody },
  responses: {
    201: json(customThemeViewSchema, 'The new theme.'),
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
  description: `${themeBodies} If the scheme changes while the theme is in use, that slot goes back to its default theme.`,
  request: { params: idParamSchema, body: themeBody },
  responses: {
    200: json(customThemeViewSchema, 'The theme after the change.'),
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

  app.openapi(createThemeRoute, async (c) => {
    const body = c.req.valid('json');
    const theme = await createTheme(db, c.get('user').id, body, now());
    markV1Body(c, body);
    return c.json(theme, 201);
  });

  app.openapi(updateThemeRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const theme = await updateTheme(db, c.get('user').id, id, body, now());
    markV1Body(c, body);
    return c.json(theme, 200);
  });

  app.openapi(deleteThemeRoute, async (c) => {
    const { id } = c.req.valid('param');
    await deleteTheme(db, c.get('user').id, id, now());
    return c.body(null, 204);
  });
}
