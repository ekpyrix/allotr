// Thumb maths for OverlayScrollbar. Pixels only; no money.

const MIN_THUMB = 24;

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** Whether the content overflows, so a thumb is needed. */
export function overflows(viewport: number, content: number): boolean {
  return content > viewport + 1;
}

export function thumbSize(viewport: number, content: number): number {
  if (!overflows(viewport, content)) return viewport;
  return clamp(
    (viewport / content) * viewport,
    Math.min(MIN_THUMB, viewport),
    viewport,
  );
}

export function thumbOffset(
  viewport: number,
  content: number,
  scrollTop: number,
): number {
  const range = content - viewport;
  if (range <= 0) return 0;
  const free = viewport - thumbSize(viewport, content);
  return clamp((scrollTop / range) * free, 0, free);
}

/** The scrollTop that puts the thumb's top edge at `offset`. */
export function scrollTopFromThumb(
  viewport: number,
  content: number,
  offset: number,
): number {
  const range = content - viewport;
  const free = viewport - thumbSize(viewport, content);
  if (range <= 0 || free <= 0) return 0;
  return clamp((offset / free) * range, 0, range);
}
