import { STATUS_CODES } from 'node:http';
import type { ProblemDetails } from '@allotr/shared';
import type { Context } from 'hono';
import type {
  ClientErrorStatusCode,
  ServerErrorStatusCode,
} from 'hono/utils/http-status';

export type ProblemStatus = ClientErrorStatusCode | ServerErrorStatusCode;

// Builds an RFC 9457 body. Plain HTTP errors use `about:blank`, whose title
// is the status phrase.
export function problemBody(
  status: ProblemStatus,
  extra: Omit<ProblemDetails, 'type' | 'title' | 'status'> = {},
): ProblemDetails {
  return {
    type: 'about:blank',
    title: STATUS_CODES[status] ?? 'Error',
    status,
    ...extra,
  };
}

export function problem<S extends ProblemStatus>(
  c: Context,
  status: S,
  extra?: Omit<ProblemDetails, 'type' | 'title' | 'status'>,
) {
  return c.json(problemBody(status, extra), status, {
    'content-type': 'application/problem+json',
  });
}
