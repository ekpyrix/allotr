import type { ReactNode } from 'react';

// One part of the settings page. Its id is the URL hash that links to it
// (`/settings#rates`); the heading takes focus when the page opens there.
export function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="mt-12 scroll-mt-6"
    >
      <h2
        id={`${id}-title`}
        tabIndex={-1}
        className="text-xl font-semibold outline-none"
      >
        {title}
      </h2>
      {intro === undefined ? null : (
        <p className="mt-1 max-w-prose text-sm text-text-muted">{intro}</p>
      )}
      {children}
    </section>
  );
}
