// What the worker does with a push message. Kept apart from the worker so
// it can be tested without a service worker: the payload comes from the
// network, so it is parsed defensively and only ever opens a path inside
// this app.

export interface PushMessage {
  title: string;
  body: string;
  /** A path in this app, such as `/budget#bills`. */
  url: string;
}

const fallback: PushMessage = {
  title: 'Allotr',
  body: 'Something needs a look.',
  url: '/',
};

/** A same-origin path, never another site or a protocol-relative address. */
export function safePath(url: unknown): string {
  return typeof url === 'string' && /^\/(?!\/)[^\s\\]*$/u.test(url) ? url : '/';
}

export function parsePush(text: string | null): PushMessage {
  if (text === null) return fallback;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fallback;
  }
  if (typeof data !== 'object' || data === null) return fallback;
  const { title, body, url } = data as Record<string, unknown>;
  return {
    title:
      typeof title === 'string' && title !== ''
        ? title.slice(0, 120)
        : fallback.title,
    body: typeof body === 'string' ? body.slice(0, 240) : fallback.body,
    url: safePath(url),
  };
}
