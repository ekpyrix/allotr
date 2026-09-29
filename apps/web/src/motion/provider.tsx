import { LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import { useEffectiveMotion } from '@/lib/device-prefs';

// Motion for gestures, sheets and list layout (ADR 0019). Its features load
// lazily after first paint, so Today's first render never waits for them;
// `m` components render as plain elements until then. Reduced or no motion
// (the device setting, or the in-app one) turns transform and layout
// animation off for every Motion component.

const loadFeatures = () =>
  import('./features.ts').then((module) => module.default);

export function MotionProvider({ children }: { children: ReactNode }) {
  const motion = useEffectiveMotion();
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion={motion === 'full' ? 'never' : 'always'}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
