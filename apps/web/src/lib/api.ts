import {
  fillTemplate,
  problemDetailsSchema,
  type Placeholders,
  type ProblemDetails,
} from '@allotr/shared';
import type { ZodType } from 'zod';

// All server calls go through here: same-origin, cookies included, JSON in
// and out, RFC 9457 problems turned into ApiError and responses checked
// against the shared schema.

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

/** The request never got an answer (offline, DNS, server down). */
export class NetworkError extends Error {
  override readonly name = 'NetworkError';

  constructor(cause: unknown) {
    super('The server could not be reached', { cause });
  }
}

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface Endpoint<Res, Body, Path extends string> {
  readonly method: Method;
  readonly path: Path;
  readonly response: ZodType<Res>;
  /** Only the body's type matters here; the server validates it. */
  readonly body?: ZodType<Body>;
  /** False for Better Auth routes, which the OpenAPI document leaves out. */
  readonly openapi: boolean;
}

export function endpoint<const Path extends string, Res, Body = undefined>(
  def: Omit<Endpoint<Res, Body, Path>, 'openapi'> & { openapi?: boolean },
): Endpoint<Res, Body, Path> {
  return { ...def, openapi: def.openapi ?? true };
}

type QueryValue = string | number | boolean | undefined;
type ParamsInput<P extends string> = [Placeholders<P>] extends [never]
  ? object
  : { params: Readonly<Record<Placeholders<P>, string>> };
type BodyInput<B> = [B] extends [undefined] ? object : { body: B };
export type CallInput<Body, Path extends string> = ParamsInput<Path> &
  BodyInput<Body> & {
    query?: Readonly<Record<string, QueryValue>>;
    headers?: Readonly<Record<string, string>>;
  };
type CallArgs<I> = object extends I ? [input?: I] : [input: I];

export async function call<Res, Body, Path extends string>(
  target: Endpoint<Res, Body, Path>,
  ...[input]: CallArgs<CallInput<Body, Path>>
): Promise<Res> {
  const { params, body, query, headers } = (input ?? {}) as {
    params?: Readonly<Record<string, string>>;
    body?: unknown;
    query?: Readonly<Record<string, QueryValue>>;
    headers?: Readonly<Record<string, string>>;
  };
  let url = fillTemplate(target.path, params ?? {}, encodeURIComponent);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {}))
    if (value !== undefined) search.append(key, String(value));
  if (search.size > 0) url += `?${search.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: target.method,
      credentials: 'same-origin',
      headers: {
        'x-allotr-client': 'web',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch (cause) {
    throw new NetworkError(cause);
  }
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new ApiError(toProblem(response.status, payload));
  return target.response.parse(payload);
}

function toProblem(status: number, payload: unknown): ProblemDetails {
  const parsed = problemDetailsSchema.safeParse(payload);
  if (parsed.success) return parsed.data;
  return { type: 'about:blank', title: 'Request failed', status };
}
