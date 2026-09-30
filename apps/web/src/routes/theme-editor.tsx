import {
  DEFAULT_PALETTE_THEME_ID,
  PALETTE_THEMES,
  type SessionView,
} from '@allotr/shared';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Page } from '@/components/page';
import { useTheme } from '@/components/theme-provider';
import { draftFrom } from '@/features/themes/draft';
import { ThemeEditor } from '@/features/themes/editor';
import { takeDraft } from '@/features/themes/import-handoff';
import { t } from '@/messages/t';

function Loading() {
  return (
    <p role="status" className="mt-6 text-text-muted">
      {t('settings.loading')}
    </p>
  );
}

// A new theme starts from an imported palette, a shipped or custom theme
// (`?from=`), or by default the one in use for the light slot.
export function NewThemePage({
  session,
  from,
}: {
  session: SessionView;
  from: string | undefined;
}) {
  const { customPalettes, customThemes, appearance } = useTheme();
  const [imported] = useState(takeDraft);
  const starts = [...PALETTE_THEMES, ...customPalettes];
  const start =
    starts.find((theme) => theme.id === from) ??
    starts.find((theme) => theme.id === appearance.light) ??
    starts.find((theme) => theme.id === DEFAULT_PALETTE_THEME_ID.light);
  return (
    <Page title={t('themes.newTitle')} intro={t('themes.intro')}>
      {customThemes === undefined || start === undefined ? (
        <Loading />
      ) : (
        <ThemeEditor
          userId={session.user.id}
          initial={imported ?? draftFrom(start)}
          starts={starts}
          startId={imported === undefined ? start.id : undefined}
        />
      )}
    </Page>
  );
}

export function EditThemePage({
  session,
  id,
}: {
  session: SessionView;
  id: string;
}) {
  const { customThemes } = useTheme();
  const theme = customThemes?.find((custom) => custom.id === id);
  return (
    <Page title={t('themes.editTitle')} intro={t('themes.intro')}>
      {customThemes === undefined ? <Loading /> : null}
      {customThemes !== undefined && theme === undefined ? (
        <div className="mt-6 grid justify-items-start gap-4">
          <p>{t('themes.notFound')}</p>
          <Link
            to="/settings"
            hash="appearance"
            className="font-medium underline underline-offset-4"
          >
            {t('themes.back')}
          </Link>
        </div>
      ) : null}
      {theme === undefined ? null : (
        <ThemeEditor
          key={theme.id}
          userId={session.user.id}
          initial={draftFrom(theme, theme.name)}
          editing={theme}
          starts={[]}
        />
      )}
    </Page>
  );
}
