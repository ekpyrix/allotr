// Pure chart geometry (docs/ui.md §4). Maps values the server sent onto a
// drawing space. It never derives money: ticks are rounded positions on an
// axis, not amounts anyone is told they have.

export type Point = Readonly<{ x: number; y: number }>;

/** A linear map from a domain to a range. */
export type LinearScale = ((value: number) => number) &
  Readonly<{
    domain: readonly [number, number];
    range: readonly [number, number];
  }>;

/**
 * Maps `domain` onto `range`. A zero-width domain has no slope, so every
 * value maps to the middle of the range instead of dividing by zero.
 */
export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const fn = (value: number): number =>
    span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0);
  return Object.assign(fn, { domain, range });
}

/** The smallest and largest of a list; `undefined` when it is empty. */
export function extent(
  values: readonly number[],
): readonly [number, number] | undefined {
  const first = values[0];
  if (first === undefined) return undefined;
  let min = first;
  let max = first;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return [min, max];
}

function niceStep(rough: number): number {
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

/**
 * Round tick positions covering `[min, max]`, about `count` of them. The
 * ticks are whole numbers (the caller passes minor units) and always
 * include the data: the first is at or below `min`, the last at or above
 * `max`. A flat or empty domain gets a single tick.
 */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  if (low === high) return [Math.round(low)];
  const step = Math.max(
    1,
    niceStep((high - low) / Math.max(1, Math.floor(count) - 1)),
  );
  const first = Math.floor(low / step) * step;
  const last = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  for (let tick = first; tick <= last + step / 2; tick += step) {
    ticks.push(Math.round(tick));
  }
  return ticks;
}

/** One cubic Bézier segment from `from` to `to`. */
export type CubicSegment = Readonly<{
  from: Point;
  c1: Point;
  c2: Point;
  to: Point;
}>;

/** The cubic's point at `t` in [0, 1]. */
export function cubicAt(segment: CubicSegment, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x:
      a * segment.from.x +
      b * segment.c1.x +
      c * segment.c2.x +
      d * segment.to.x,
    y:
      a * segment.from.y +
      b * segment.c1.y +
      c * segment.c2.y +
      d * segment.to.y,
  };
}

/**
 * Monotone cubic interpolation (Fritsch–Carlson) as segment data. Between
 * two points the curve never leaves the two y values, so a smoothed line
 * never invents a dip or a peak that is not in the data. Points are sorted
 * by x; points sharing an x keep the last y.
 */
export function monotoneSegments(points: readonly Point[]): CubicSegment[] {
  const sorted: Point[] = [];
  for (const point of [...points].sort((a, b) => a.x - b.x)) {
    const last = sorted[sorted.length - 1];
    if (last !== undefined && last.x === point.x)
      sorted[sorted.length - 1] = point;
    else sorted.push(point);
  }
  const n = sorted.length;
  if (n < 2) return [];

  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a === undefined || b === undefined) continue;
    slopes.push((b.y - a.y) / (b.x - a.x));
  }

  const tangents: number[] = new Array<number>(n).fill(0);
  tangents[0] = slopes[0] ?? 0;
  tangents[n - 1] = slopes[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i += 1) {
    const before = slopes[i - 1] ?? 0;
    const after = slopes[i] ?? 0;
    // A flat run or a local extremum gets a flat tangent.
    tangents[i] = before * after <= 0 ? 0 : (before + after) / 2;
  }
  for (let i = 0; i < n - 1; i += 1) {
    const slope = slopes[i] ?? 0;
    if (slope === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const alpha = (tangents[i] ?? 0) / slope;
    const beta = (tangents[i + 1] ?? 0) / slope;
    const radius = Math.hypot(alpha, beta);
    if (radius > 3) {
      const scale = 3 / radius;
      tangents[i] = scale * alpha * slope;
      tangents[i + 1] = scale * beta * slope;
    }
  }

  const segments: CubicSegment[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const from = sorted[i];
    const to = sorted[i + 1];
    if (from === undefined || to === undefined) continue;
    const width = (to.x - from.x) / 3;
    segments.push({
      from,
      c1: { x: from.x + width, y: from.y + width * (tangents[i] ?? 0) },
      c2: { x: to.x - width, y: to.y - width * (tangents[i + 1] ?? 0) },
      to,
    });
  }
  return segments;
}

function fmt(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** The SVG path data for a smoothed line. One point draws nothing. */
export function linePath(points: readonly Point[]): string {
  const segments = monotoneSegments(points);
  const first = segments[0];
  if (first === undefined) return '';
  const parts = [`M${fmt(first.from.x)} ${fmt(first.from.y)}`];
  for (const s of segments) {
    parts.push(
      `C${fmt(s.c1.x)} ${fmt(s.c1.y)} ${fmt(s.c2.x)} ${fmt(s.c2.y)} ${fmt(s.to.x)} ${fmt(s.to.y)}`,
    );
  }
  return parts.join('');
}

/** The same curve closed down to `baseline`, for an area fill. */
export function areaPath(points: readonly Point[], baseline: number): string {
  const segments = monotoneSegments(points);
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (first === undefined || last === undefined) return '';
  return `${linePath(points)}L${fmt(last.to.x)} ${fmt(baseline)}L${fmt(first.from.x)} ${fmt(baseline)}Z`;
}

export type Column = Readonly<{
  /** Left edge and width, in the same unit as the range given. */
  x: number;
  width: number;
}>;

/**
 * `count` equal columns across `[0, total]`, each leaving `gap` on both
 * sides of its slot so neighbours never touch.
 */
export function columnLayout(count: number, total: number, gap = 0): Column[] {
  if (count <= 0) return [];
  const slot = total / count;
  const width = Math.max(0, slot - gap * 2);
  return Array.from({ length: count }, (_, i) => ({
    x: i * slot + (slot - width) / 2,
    width,
  }));
}

export type LaneEvent = Readonly<{ id: string; day: number }>;

export type PlacedEvent = Readonly<{
  id: string;
  /** Position along the axis, 0..1. */
  at: number;
  side: 'up' | 'down';
  /** 0 is nearest the axis, 1 is the outer level. */
  level: 0 | 1;
}>;

/**
 * Places events on a cycle-day axis of `days` days. They alternate above
 * and below on two levels (up 0, down 0, up 1, down 1, …) in day order so
 * neighbouring labels do not collide.
 */
export function timelineLanes(
  events: readonly LaneEvent[],
  days: number,
): PlacedEvent[] {
  const span = Math.max(1, days - 1);
  return [...events]
    .sort((a, b) => a.day - b.day)
    .map((event, i) => ({
      id: event.id,
      at: Math.min(1, Math.max(0, event.day / span)),
      side: i % 2 === 0 ? 'up' : 'down',
      level: (Math.floor(i / 2) % 2) as 0 | 1,
    }));
}
