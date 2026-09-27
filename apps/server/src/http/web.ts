import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { AppEnv } from './env.ts';

// Serves the built web app (apps/web/dist). Hashed assets are cached for a
// year; everything else, including the SPA fallback to index.html, is
// revalidated so a new release shows up at once.

const apiPrefixes = ['/v1/', '/healthz', '/readyz', '/openapi.json'];

export function registerWebApp(
  app: OpenAPIHono<AppEnv>,
  webDir: string,
): boolean {
  if (!existsSync(join(webDir, 'index.html'))) return false;

  app.use('*', async (c, next) => {
    await next();
    if (c.req.path.startsWith('/assets/') && c.res.ok) {
      c.header('cache-control', 'public, max-age=31536000, immutable');
    } else if (!c.res.headers.has('cache-control')) {
      c.header('cache-control', 'no-cache');
    }
  });

  app.get('*', serveStatic({ root: webDir }));
  app.get('*', async (c, next) => {
    const isApi = apiPrefixes.some((prefix) => c.req.path.startsWith(prefix));
    const wantsPage = c.req.header('accept')?.includes('text/html') === true;
    if (isApi || !wantsPage || c.req.path.startsWith('/assets/')) return next();
    return serveStatic({ root: webDir, path: 'index.html' })(c, next);
  });
  return true;
}
