// A stand-in server for CLI tests: routes "METHOD /path" to canned answers
// and records every request. Nothing touches the network.

export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly path: string;
  readonly headers: Headers;
  readonly body: unknown;
}

export type Handler = (
  request: RecordedRequest,
) => Response | Promise<Response>;

export function json(
  status: number,
  body: unknown,
  setCookie: readonly string[] = [],
): Response {
  const headers = new Headers({
    'content-type':
      status >= 400 ? 'application/problem+json' : 'application/json',
  });
  for (const cookie of setCookie) headers.append('set-cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

export function problem(
  status: number,
  title: string,
  extra: Readonly<Record<string, unknown>> = {},
): Response {
  return json(status, { type: 'about:blank', title, status, ...extra });
}

export function fakeFetch(routes: Readonly<Record<string, Handler>>) {
  const requests: RecordedRequest[] = [];
  const fetchFn = (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    const method = init?.method ?? 'GET';
    const text = typeof init?.body === 'string' ? init.body : undefined;
    const request: RecordedRequest = {
      method,
      url: url.href,
      path: url.pathname,
      headers: new Headers(init?.headers),
      body: text === undefined ? undefined : (JSON.parse(text) as unknown),
    };
    requests.push(request);
    const handler = routes[`${method} ${url.pathname}`];
    if (handler === undefined) {
      return Promise.resolve(problem(404, 'Not Found'));
    }
    return Promise.resolve(handler(request));
  };
  return { fetch: fetchFn satisfies typeof fetch, requests };
}
