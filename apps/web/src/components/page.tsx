import type { ReactNode } from 'react';
import { TopAppBar } from './top-app-bar.tsx';

// The top of every view inside the shell: the top app bar, one large h1
// and an optional intro.
export function Page({
  title,
  intro,
  actions,
  children,
}: {
  title: string;
  intro?: string;
  /** Icon buttons for the top app bar. */
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <TopAppBar title={title} actions={actions} />
      <h1 className="mt-2 text-headline">{title}</h1>
      {intro === undefined ? null : (
        <p className="mt-3 max-w-prose text-body-lg text-text-muted">{intro}</p>
      )}
      {children}
    </>
  );
}
