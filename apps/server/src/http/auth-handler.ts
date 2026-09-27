import type { Handler } from 'hono';
import type { Auth } from '../auth/auth.ts';
import type { AppEnv } from './env.ts';
import { authHeaders } from './guards.ts';
import { problemBody, type ProblemStatus } from './problem.ts';

// Serves Better Auth under /v1/auth and rewrites its JSON errors as RFC 9457
// problem details so every API error has the same shape.
export function authHandler(auth: Auth): Handler<AppEnv> {
  return async (c) => {
    const request = new Request(c.req.raw, { headers: authHeaders(c) });
    return toProblem(await auth.handler(request));
  };
}

async function toProblem(response: Response): Promise<Response> {
  if (response.status < 400) return response;
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = {};
  }
  const { message, code } =
    typeof payload === 'object' && payload !== null
      ? (payload as { message?: unknown; code?: unknown })
      : {};

  const headers = new Headers(response.headers);
  headers.set('content-type', 'application/problem+json');
  headers.delete('content-length');
  const body = problemBody(response.status as ProblemStatus, {
    ...(typeof message === 'string' ? { detail: message } : {}),
    ...(typeof code === 'string' ? { code: code.toLowerCase() } : {}),
  });
  return new Response(JSON.stringify(body), {
    status: response.status,
    headers,
  });
}
