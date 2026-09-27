import { problemDetailsSchema, type ProblemDetails } from '@allotr/shared';
import type { ZodType } from 'zod';

// All server calls go through here: same-origin, cookies included, JSON in
// and out, and RFC 9457 problems turned into ApiError.

export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.problem = problem;
  }

  get status(): number {
    return this.problem.status;
  }
}

export async function api<T>(
  path: string,
  schema: ZodType<T>,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(path, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers:
      init.body === undefined ? {} : { 'content-type': 'application/json' },
    body: init.body === undefined ? null : JSON.stringify(init.body),
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new ApiError(toProblem(response.status, payload));
  return schema.parse(payload);
}

function toProblem(status: number, payload: unknown): ProblemDetails {
  const parsed = problemDetailsSchema.safeParse(payload);
  if (parsed.success) return parsed.data;
  return { type: 'about:blank', title: 'Request failed', status };
}

/** A sentence to show the user for a failed request. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const [first] = error.problem.errors ?? [];
    if (first !== undefined)
      return `${fieldLabel(first.path)}: ${first.message}`;
    if (error.problem.detail !== undefined) return error.problem.detail;
    if (error.status === 429)
      return 'Too many attempts. Wait a minute and try again.';
    return `The server answered ${String(error.status)} ${error.problem.title}.`;
  }
  return 'Allotr could not reach the server. Check your connection and try again.';
}

function fieldLabel(path: string): string {
  const name = path.split('.').pop() ?? path;
  return name.charAt(0).toUpperCase() + name.slice(1);
}
