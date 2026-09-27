import { bundleSchema, importResultSchema } from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { importBundle } from '../../ledger/import.ts';
import { pointer } from '../../ledger/import-resolve.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import { requireUser } from '../guards.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';
import { problem } from '../problem.ts';

// Import of a whole bundle into an empty ledger (#40). Nothing is committed
// until every item is validated and written.

const maxBytes = 10 * 1024 * 1024;
const maxErrors = 100;

const importRoute = createRoute({
  method: 'post',
  path: '/v1/import',
  tags: ['Import'],
  summary: 'Fill an empty ledger from a bundle',
  description:
    'Applies the whole bundle in one database transaction: all of it or none of it. Items refer to each other by name. Each error names the failing item as a JSON Pointer in `errors[].path`.',
  request: {
    body: {
      content: { 'application/json': { schema: bundleSchema } },
      required: true,
    },
  },
  responses: {
    201: json(importResultSchema, 'What the import created.'),
    400: problemResponse(
      'The bundle is invalid (`invalid_bundle`), of another version (`unsupported_bundle_version`), names something that does not exist (`invalid_reference`), or an item was refused while applying (its usual code).',
    ),
    401: unauthenticated,
    403: forbidden,
    409: problemResponse(
      'The ledger already has accounts, entries, bills or rates (`ledger_not_empty`), or an item conflicts.',
    ),
    413: problemResponse('The bundle is larger than 10 MB.'),
  },
});

export function registerImportRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;
  app.use('/v1/import', requireUser(deps));
  app.use(
    '/v1/import',
    bodyLimit({
      maxSize: maxBytes,
      onError: (c) =>
        problem(c, 413, {
          detail: 'The bundle is larger than 10 MB.',
          code: 'bundle_too_large',
        }),
    }),
  );

  app.openapi(
    importRoute,
    async (c) =>
      c.json(
        await importBundle(db, c.get('user').id, c.req.valid('json'), now()),
        201,
      ),
    (result, c) => {
      if (result.success) return;
      const { issues } = result.error;
      const header = issues.filter(
        (issue) => issue.path[0] === 'format' || issue.path[0] === 'version',
      );
      const shown = (header.length > 0 ? header : issues).slice(0, maxErrors);
      return problem(c, 400, {
        code:
          header.length > 0 ? 'unsupported_bundle_version' : 'invalid_bundle',
        detail:
          header.length > 0
            ? 'This server reads Allotr bundles of version 1.'
            : 'The bundle is invalid.',
        errors: shown.map((issue) => ({
          path: pointer(issue.path),
          message: issue.message,
        })),
      });
    },
  );
}
