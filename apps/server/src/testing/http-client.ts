// A fetch wrapper that keeps cookies, like one browser tab.
export interface TestResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly body: unknown;
}

export interface TestClient {
  request(
    method: string,
    path: string,
    body?: unknown,
    originOverride?: string,
    headers?: Readonly<Record<string, string>>,
  ): Promise<TestResponse>;
  get(path: string): Promise<TestResponse>;
  post(
    path: string,
    body?: unknown,
    headers?: Readonly<Record<string, string>>,
  ): Promise<TestResponse>;
  patch(path: string, body?: unknown): Promise<TestResponse>;
  delete(path: string): Promise<TestResponse>;
}

export function createClient(
  baseUrl: string,
  origin: string,
  extraHeaders: Readonly<Record<string, string>> = {},
): TestClient {
  const cookies = new Map<string, string>();

  async function request(
    method: string,
    path: string,
    body?: unknown,
    originOverride?: string,
    requestHeaders: Readonly<Record<string, string>> = {},
  ): Promise<TestResponse> {
    const headers = new Headers({
      ...extraHeaders,
      ...requestHeaders,
      origin: originOverride ?? origin,
    });
    if (body !== undefined) headers.set('content-type', 'application/json');
    if (cookies.size > 0) {
      headers.set(
        'cookie',
        [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      );
    }
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers,
      body: body === undefined ? null : JSON.stringify(body),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair = ''] = cookie.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (value === '' || /max-age=0/i.test(cookie)) cookies.delete(name);
      else cookies.set(name, value);
    }
    const text = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      body: text === '' ? undefined : (JSON.parse(text) as unknown),
    };
  }

  return {
    request,
    get: (path) => request('GET', path),
    post: (path, body, headers) =>
      request('POST', path, body ?? {}, undefined, headers),
    patch: (path, body) => request('PATCH', path, body ?? {}),
    delete: (path) => request('DELETE', path),
  };
}
