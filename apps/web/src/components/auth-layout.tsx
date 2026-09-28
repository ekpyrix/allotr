import type { ReactNode } from 'react';
import { ThemeModeSwitch } from './theme-mode-switch.tsx';
import { Wordmark } from './wordmark.tsx';

// One narrow, left-aligned column: the form is the whole page.
export function AuthLayout({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-6 py-10 sm:justify-center">
      <Wordmark className="mb-12 sm:mb-16" />
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {intro === undefined ? null : (
        <p className="mt-3 text-muted-foreground">{intro}</p>
      )}
      <div className="mt-8">{children}</div>
      <ThemeModeSwitch className="mt-12" />
    </main>
  );
}
