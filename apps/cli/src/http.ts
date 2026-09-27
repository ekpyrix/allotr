import { problemDetailsSchema, type ProblemDetails } from '@allotr/shared';

// A cookie-keeping JSON client for one CLI run, like one browser tab.
// Cookie-authenticated writes must carry the instance's Origin
// (docs/architecture.md §5).

export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface Session {
  post(path: string, body?: unknown): Promise<ApiResponse>;
}

/** The server could not be reached at all. */
export class UnreachableError extends Error {}

export function createSession(server: string, fetchFn: typeof fetch): Session {
  const base = server.replace(/\/+$/, '');
  const origin = new URL(server).origin;
  const cookies = new Map<string, string>();

  function remember(response: Response): void {
    for (const cookie of response.headers.getSetCookie()) {
      const [pair = ''] = cookie.split(';');
      const index = pair.indexOf('=');
      if (index <= 0) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1);
      if (value === '' || /max-age=0/i.test(cookie)) cookies.delete(name);
      else cookies.set(name, value);
    }
  }

  return {
    async post(path, body = {}) {
      const headers = new Headers({
        origin,
        accept: 'application/json',
        'content-type': 'application/json',
      });
      if (cookies.size > 0) {
        headers.set(
          'cookie',
          [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
        );
      }
      // The connection can also drop while the answer is being read.
      try {
        const response = await fetchFn(`${base}${path}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
        remember(response);
        const text = await response.text();
        return { status: response.status, body: parseJson(text) };
      } catch (error) {
        throw new UnreachableError(
          error instanceof Error ? error.message : String(error),
          { cause: error },
        );
      }
    },
  };
}

function parseJson(text: string): unknown {
  if (text === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // A proxy's HTML error page, for example; callers report the status.
    return undefined;
  }
}

/** Problem details from an answer, or null when it has none. */
export function problemOf(response: ApiResponse): ProblemDetails | null {
  const parsed = problemDetailsSchema.safeParse(response.body);
  return parsed.success ? parsed.data : null;
}
