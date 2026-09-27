import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { describeProblem } from '@/lib/problem';
import { t } from '@/messages/t';
import { AuthLayout } from './auth-layout.tsx';

// Shown when a route cannot load (server unreachable, unexpected answer):
// say what happened and let the user try again instead of a dead end.
export function LoadError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <AuthLayout
      title={t('errors.pageTitle')}
      intro={describeProblem(error).message}
    >
      <Button
        size="lg"
        className="h-11"
        onClick={() => {
          reset();
          void router.invalidate();
        }}
      >
        {t('errors.retry')}
      </Button>
    </AuthLayout>
  );
}
