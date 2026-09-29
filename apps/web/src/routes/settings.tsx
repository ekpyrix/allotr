import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Page } from '@/components/page';
import { ShortcutsSwitch } from '@/components/shortcuts-switch';
import { ThemeModeSwitch } from '@/components/theme-mode-switch';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/session';
import { t } from '@/messages/t';

// Placeholder until the settings views (#62); sign-out lives here.
export function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (
    <Page title={t('settings.title')} intro={t('settings.placeholder')}>
      <ThemeModeSwitch className="mt-8" />
      <ShortcutsSwitch className="mt-8" />
      <Button
        variant="outline"
        className="mt-8"
        onClick={() => {
          void signOut(queryClient).then(() => navigate({ to: '/sign-in' }));
        }}
      >
        {t('settings.signOut')}
      </Button>
    </Page>
  );
}
