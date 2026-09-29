// Spring tokens (ADR 0019): one set of springs, given as a perceived
// duration and a bounce, drives CSS transitions (as `linear()` easings,
// generated into src/generated/tokens.css) and Motion's JS springs alike,
// so both engines move the same way.

export type Spring = Readonly<{
  /** Seconds until the motion looks done; the tail settles after. */
  visualDuration: number;
  /** 0 for no overshoot; small controls only go above it. */
  bounce: number;
}>;

export const SPRINGS = {
  snappy: { visualDuration: 0.25, bounce: 0 },
  smooth: { visualDuration: 0.4, bounce: 0 },
  gentle: { visualDuration: 0.55, bounce: 0 },
  bouncy: { visualDuration: 0.45, bounce: 0.15 },
} as const satisfies Readonly<Record<string, Spring>>;
export type SpringToken = keyof typeof SPRINGS;
export const SPRING_TOKENS = Object.keys(SPRINGS) as SpringToken[];

/** Exits and dismissals: quick, accelerating away. */
export const EASE_EXIT = { easing: 'cubic-bezier(0.3, 0, 1, 1)', ms: 200 };
/** The crossfade that stands in for motion when motion is reduced. */
export const FADE_MS = 120;

// The spring Motion builds from a visual duration and bounce: unit mass,
// natural frequency 2π / (1.2 × visualDuration) and damping ratio
// 1 − bounce, floored at 0.05.
function parameters({ visualDuration, bounce }: Spring) {
  const omega = (2 * Math.PI) / (visualDuration * 1.2);
  const zeta = Math.min(1, Math.max(0.05, 1 - bounce));
  return { omega, zeta };
}

/** Position at `t` seconds for a unit step from 0 to 1, from rest. */
export function springPosition(spring: Spring, t: number): number {
  const { omega, zeta } = parameters(spring);
  if (zeta >= 1) return 1 - (1 + omega * t) * Math.exp(-omega * t);
  const damped = omega * Math.sqrt(1 - zeta * zeta);
  return (
    1 -
    Math.exp(-zeta * omega * t) *
      (Math.cos(damped * t) + ((zeta * omega) / damped) * Math.sin(damped * t))
  );
}

const REST = 0.001;
const LONGEST = 3;

/** Seconds until the spring stays within 0.1 % of rest (at most 3). */
export function settleTime(spring: Spring): number {
  let last = 0;
  for (let ms = 0; ms <= LONGEST * 1000; ms += 1) {
    if (Math.abs(1 - springPosition(spring, ms / 1000)) > REST) last = ms;
  }
  return Math.min(LONGEST, (last + 1) / 1000);
}

const SAMPLES = 40;

// Four decimals; an easing, not money.
function round(value: number): string {
  return String(Math.round(value * 10_000) / 10_000);
}

/** A CSS `linear()` easing sampled evenly over the settle time. */
export function linearEasing(spring: Spring): {
  easing: string;
  durationMs: number;
} {
  const settle = settleTime(spring);
  const points = Array.from({ length: SAMPLES + 1 }, (_, at) =>
    at === SAMPLES ? 1 : springPosition(spring, (settle * at) / SAMPLES),
  );
  return {
    easing: `linear(${points.map(round).join(', ')})`,
    durationMs: Math.round(settle * 1000),
  };
}

/** The same spring as Motion options. */
export function springConfig(token: SpringToken): {
  type: 'spring';
  visualDuration: number;
  bounce: number;
} {
  return { type: 'spring', ...SPRINGS[token] };
}
