import { createContext, use, type ReactNode } from 'react';

// One part of the settings page. Its id is the URL hash that links to it
// (`/settings#rates`); the heading takes focus when the page opens there.
// Inside a SettingsGroup the heading is one level down.

const GroupContext = createContext(false);

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
  const grouped = use(GroupContext);
  const Heading = grouped ? 'h3' : 'h2';
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="mt-10 scroll-mt-6"
    >
      <Heading
        id={`${id}-title`}
        tabIndex={-1}
        className="text-xl font-semibold outline-none"
      >
        {title}
      </Heading>
      {intro === undefined ? null : (
        <p className="mt-1 max-w-prose text-sm text-text-muted">{intro}</p>
      )}
      {children}
    </section>
  );
}

/**
 * A named group of settings sections (Money, App, Account and security,
 * Data). Its id is a hash too, so `/settings#data` lands on the group.
 */
export function SettingsGroup({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    // A group, not a region, so a section inside keeps its own name as the
    // landmark (a group called "Account and security" would match "Security").
    <div
      id={id}
      role="group"
      aria-labelledby={`${id}-title`}
      className="mt-14 scroll-mt-6 border-t border-outline-variant pt-2"
    >
      <h2
        id={`${id}-title`}
        tabIndex={-1}
        className="mt-4 text-headline outline-none"
      >
        {title}
      </h2>
      <GroupContext value>{children}</GroupContext>
    </div>
  );
}
