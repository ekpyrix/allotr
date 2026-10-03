import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff, BellRing } from 'lucide-react';
import { useState } from 'react';
import { FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/problem';
import {
  pushConfigQuery,
  pushSubscriptionsQuery,
  sendTestPush,
  subscribePush,
  unsubscribePush,
} from '@/lib/reminders';
import { t } from '@/messages/t';
import {
  applicationServerKey,
  currentSupport,
  toSubscriptionBody,
} from './push.ts';

// Opt-in Web Push for this device (ADR 0024). Off by default: nothing here
// asks for permission or contacts a push service until the button is
// pressed. Notifications then travel through the browser vendor's push
// service, which docs/privacy.md says in plain words.

async function registration() {
  return navigator.serviceWorker.getRegistration();
}

async function browserSubscription() {
  const worker = await registration();
  return (await worker?.pushManager.getSubscription()) ?? null;
}

export function PushDevice() {
  const queryClient = useQueryClient();
  const support = currentSupport();
  const enabledHere = useQuery({
    queryKey: ['push', 'browser'],
    queryFn: browserSubscription,
    enabled: support.state !== 'unsupported',
  });
  const subscriptions = useQuery(pushSubscriptionsQuery);
  const config = useQuery({
    ...pushConfigQuery,
    enabled: support.state !== 'unsupported',
  });
  const [note, setNote] = useState<string | null>(null);

  const refresh = async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['push'] })]);
  };
  const turnOn = useMutation({
    mutationFn: async () => {
      if (config.data === undefined) throw new Error('no key');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return 'refused' as const;
      const worker = await registration();
      if (worker === undefined) return 'no-worker' as const;
      const subscription = await worker.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(config.data.publicKey),
      });
      const body = toSubscriptionBody(subscription.toJSON());
      if (body === null) {
        await subscription.unsubscribe();
        return 'invalid' as const;
      }
      await subscribePush(body);
      return 'on' as const;
    },
    onSuccess: async (result) => {
      setNote(result === 'on' ? null : t(`reminders.push.problems.${result}`));
      await refresh();
    },
  });
  const turnOff = useMutation({
    mutationFn: async () => {
      const subscription = await browserSubscription();
      if (subscription === null) return;
      const { endpoint } = subscription;
      await subscription.unsubscribe();
      await unsubscribePush(endpoint);
    },
    onSuccess: async () => {
      setNote(null);
      await refresh();
    },
  });
  const test = useMutation({
    mutationFn: sendTestPush,
    onSuccess: (result) => {
      setNote(
        result.sent > 0
          ? t('reminders.push.testSent')
          : t('reminders.push.testNone'),
      );
    },
  });

  const on =
    enabledHere.data != null &&
    (subscriptions.data?.subscriptions.some(
      (s) => s.endpoint === enabledHere.data?.endpoint,
    ) ??
      false);
  const failure = turnOn.error ?? turnOff.error ?? test.error;

  return (
    <div className="grid max-w-prose gap-3" data-testid="push-device">
      <h3 className="text-title">{t('reminders.push.title')}</h3>
      <p className="text-body text-text-muted">{t('reminders.push.privacy')}</p>
      {support.state === 'unsupported' ? (
        <p>{t('reminders.push.unsupported')}</p>
      ) : support.state === 'blocked' ? (
        <p>{t('reminders.push.blocked')}</p>
      ) : (
        <>
          <p data-testid="push-state">
            {on ? t('reminders.push.on') : t('reminders.push.off')}
          </p>
          <div className="flex flex-wrap gap-2">
            {on ? (
              <>
                <Button
                  variant="outlined"
                  disabled={turnOff.isPending}
                  onClick={() => {
                    turnOff.mutate();
                  }}
                >
                  <BellOff aria-hidden="true" />
                  {t('reminders.push.turnOff')}
                </Button>
                <Button
                  variant="text"
                  disabled={test.isPending}
                  onClick={() => {
                    test.mutate();
                  }}
                >
                  {t('reminders.push.test')}
                </Button>
              </>
            ) : (
              <Button
                disabled={turnOn.isPending || config.data === undefined}
                onClick={() => {
                  turnOn.mutate();
                }}
              >
                <BellRing aria-hidden="true" />
                {t('reminders.push.turnOn')}
              </Button>
            )}
          </div>
        </>
      )}
      {note === null ? null : (
        <p role="status" className="text-body">
          {note}
        </p>
      )}
      <FormError message={failure === null ? null : errorMessage(failure)} />
    </div>
  );
}
