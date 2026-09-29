import { SHIPPED_THEMES, type SessionView } from '@allotr/shared';
import { Link } from '@tanstack/react-router';
import { Page } from '@/components/page';
import { useTheme } from '@/components/theme-provider';
import { draftFrom } from '@/features/themes/draft';
import { ThemeEditor } from '@/features/themes/editor';
import { t } from '@/messages/t';

function Loading() {
  return (
    <p role="status" className="mt-6 text-muted-foreground">
      {t('settings.loading')}
    </p>
  );
}

// A new theme starts from a shipped or custom theme (`?from=`), by default
// the one in use for the light slot.
export function NewThemePage({
  session,
  from,
}: {
  session: SessionView;
  from: string | undefined;
}) {
  const { customThemes, appearance } = useTheme();
  const starts =
    customThemes === undefined ? [] : [...SHIPPED_THEMES, ...customThemes];
  const start =
    starts.find((theme) => theme.id === from) ??
    starts.find((theme) => theme.id === appearance.light) ??
    SHIPPED_THEMES[0];
  return (
    <Page title={t('themes.newTitle')} intro={t('themes.intro')}>
      {customThemes === undefined || start === undefined ? (
        <Loading />
      ) : (
        <ThemeEditor
          userId={session.user.id}
          initial={draftFrom(start)}
          starts={starts}
          startId={start.id}
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
