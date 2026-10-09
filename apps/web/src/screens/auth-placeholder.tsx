import type { ReactNode } from 'react';
import { Frame } from '@/components/layout';

/**
 * The sign-in, onboarding, invite and setup screens are restyled in the
 * settings work package; until then each is a centred heading so the route
 * guards can be tested.
 */
export function AuthPlaceholder({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <Frame className="grid min-h-dvh place-items-center">
      <main id="content" className="border bg-canvas px-6 py-5">
        <h1 className="text-big font-semibold">{title}</h1>
        {children}
      </main>
    </Frame>
  );
}
