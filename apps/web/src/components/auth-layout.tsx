import { useState, type ReactNode } from 'react';
import { ThemeModeSwitch } from './theme-mode-switch.tsx';
import { Wordmark } from './wordmark.tsx';

// Sign-in, invite and first-account pages (spec §11.7): one centred card,
// at most 440 px wide, on the page colour, with the wordmark above and the
// theme mode below. A new `step` slides in along the shared X axis.
export function AuthLayout({
  title,
  intro,
  step,
  children,
}: {
  title: string;
  intro?: string;
  /** Changes when the flow moves on, so the card's content slides in. */
  step?: string;
  children: ReactNode;
}) {
  // The first step is simply there; later ones slide in.
  const [first] = useState(step);
  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-8 bg-canvas px-4 py-10">
      <Wordmark />
      <div className="w-full max-w-[440px] overflow-hidden rounded-2xl bg-card p-6 medium:p-8">
        <div key={step} className={step === first ? undefined : 'axis-in'}>
          <h1 className="text-headline">{title}</h1>
          {intro === undefined ? null : (
            <p className="mt-3 text-text-muted">{intro}</p>
          )}
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <ThemeModeSwitch />
    </main>
  );
}
