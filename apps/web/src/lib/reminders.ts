import type { PushSubscriptionBody } from '@allotr/shared';
import { queryOptions } from '@tanstack/react-query';
import { call } from './api.ts';
import { endpoints } from './endpoints.ts';

// The reminder feed and the Web Push opt-in (ADR 0024). The feed is made by
// the server on a timer, so it refreshes now and then rather than with an
// entry.

export const remindersQuery = queryOptions({
  queryKey: ['reminders'],
  queryFn: () => call(endpoints.reminders),
  refetchInterval: 5 * 60 * 1000,
});

export const pushConfigQuery = queryOptions({
  queryKey: ['push', 'config'],
  queryFn: () => call(endpoints.pushConfig),
  staleTime: Infinity,
});

export const pushSubscriptionsQuery = queryOptions({
  queryKey: ['push', 'subscriptions'],
  queryFn: () => call(endpoints.pushSubscriptions),
});

export function markRead(ids?: readonly string[]) {
  return call(endpoints.markRemindersRead, {
    body: ids === undefined ? {} : { ids: [...ids] },
  });
}

export function subscribePush(body: PushSubscriptionBody) {
  return call(endpoints.subscribePush, { body });
}

export function unsubscribePush(endpoint: string) {
  return call(endpoints.unsubscribePush, { query: { endpoint } });
}

export function sendTestPush() {
  return call(endpoints.pushTest);
}
