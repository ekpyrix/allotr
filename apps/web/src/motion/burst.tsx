import type { CSSProperties } from 'react';
import { useDevicePref, useEffectiveMotion } from '@/lib/device-prefs';

// A small celebration (spec §9.4): twelve accent pills burst outward from
// the centre of their container over 600 ms. Only for earned moments, never
// for spending; nothing renders unless celebrations are on and motion is
// full. It is decorative and ignores the pointer.

const PILLS = 12;
const SERIES = 8;

export function Burst({ play }: { play: number }) {
  const [celebrations] = useDevicePref('celebrations');
  const motion = useEffectiveMotion();
  if (play === 0 || celebrations !== 'on' || motion !== 'full') return null;
  return (
    <span
      key={play}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      {Array.from({ length: PILLS }, (_, at) => {
        const angle = (at / PILLS) * 2 * Math.PI;
        const distance = 56 + (at % 3) * 12;
        const style = {
          '--dx': `${String(Math.round(Math.cos(angle) * distance))}px`,
          '--dy': `${String(Math.round(Math.sin(angle) * distance))}px`,
          rotate: `${String(Math.round((angle * 180) / Math.PI))}deg`,
          backgroundColor: `var(--series-${String((at % SERIES) + 1)})`,
        } as CSSProperties;
        return (
          <span
            key={String(at)}
            className="absolute h-1.5 w-3 rounded-full burst-pill"
            style={style}
          />
        );
      })}
    </span>
  );
}
