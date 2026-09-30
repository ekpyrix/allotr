import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { NetworkError } from '@/lib/api';
import { useOnline } from '@/lib/online';
import { describeProblem } from '@/lib/problem';
import { t } from '@/messages/t';
import { AuthLayout } from './auth-layout.tsx';

// Shown when a route cannot load (offline, server unreachable, unexpected
// answer): say what happened and let the user try again instead of a dead
// end. After a network failure it tries again by itself once back online.
export function LoadError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const online = useOnline();
  const unreachable = error instanceof NetworkError;

  const retry = () => {
    reset();
    void router.invalidate();
  };

  useEffect(() => {
    if (!unreachable) return;
    const onOnline = () => {
      reset();
      void router.invalidate();
    };
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
    };
  }, [unreachable, reset, router]);

  return (
    <AuthLayout
      title={online ? t('errors.pageTitle') : t('offline.title')}
      intro={online ? describeProblem(error).message : t('offline.intro')}
    >
      <Button className="h-11" onClick={retry}>
        {t('errors.retry')}
      </Button>
    </AuthLayout>
  );
}
