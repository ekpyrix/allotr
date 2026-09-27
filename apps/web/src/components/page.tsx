import type { ReactNode } from 'react';

// The top of every view inside the shell: one h1, an optional intro.
export function Page({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children?: ReactNode;
}) {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {intro === undefined ? null : (
        <p className="mt-3 max-w-prose text-muted-foreground">{intro}</p>
      )}
      {children}
    </>
  );
}
