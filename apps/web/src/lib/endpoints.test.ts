import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { endpoints } from './endpoints.ts';

// docs/openapi.json is the generated API contract (checked by `make lint`).
const document = JSON.parse(
  readFileSync(
    new URL('../../../../docs/openapi.json', import.meta.url),
    'utf8',
  ),
) as { paths: Record<string, Record<string, unknown>> };

describe('endpoints', () => {
  it.each(Object.entries(endpoints).filter(([, e]) => e.openapi))(
    '%s exists in the OpenAPI document',
    (_, e) => {
      expect(document.paths[e.path]?.[e.method.toLowerCase()]).toBeDefined();
    },
  );

  it('only exempts the authentication routes', () => {
    for (const e of Object.values(endpoints).filter((e) => !e.openapi))
      expect(e.path.startsWith('/v1/auth/')).toBe(true);
  });
});
