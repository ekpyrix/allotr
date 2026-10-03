import {
  markReadBodySchema,
  pushConfigSchema,
  pushSubscriptionBodySchema,
  pushSubscriptionListSchema,
  pushTestResultSchema,
  reminderListSchema,
  removePushQuerySchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { addSubscription, pushToUser } from '../../push/delivery.ts';
import { listReminders, markRead } from '../../reminders.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import { requireUser } from '../guards.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';

// Reminders and opt-in Web Push (ADR 0024). Push is off until a user
// subscribes on a device; subscribing is the opt-in.

const signedIn = { 401: unauthenticated, 403: forbidden };

const listRoute = createRoute({
  method: 'get',
  path: '/v1/reminders',
  tags: ['Reminders'],
  summary: 'The in-app reminder feed',
  description:
    'Bills due today or tomorrow, IOUs due or overdue (weekly while overdue) and the weekly review, newest first, at most 50, with how many are unread. The server creates them on a timer; each is created once.',
  responses: { 200: json(reminderListSchema, 'The feed.'), ...signedIn },
});

const readRoute = createRoute({
  method: 'post',
  path: '/v1/reminders/read',
  tags: ['Reminders'],
  summary: 'Mark reminders read',
  description:
    'The given IDs, or every unread reminder when `ids` is left out.',
  request: {
    body: { content: { 'application/json': { schema: markReadBodySchema } } },
  },
  responses: { 204: { description: 'Marked.' }, ...signedIn },
});

const configRoute = createRoute({
  method: 'get',
  path: '/v1/push/config',
  tags: ['Push'],
  summary: 'The key a browser subscribes with',
  description:
    'The instance VAPID public key, generated the first time the server started. Web Push is off until a user subscribes on a device.',
  responses: { 200: json(pushConfigSchema, 'The public key.'), ...signedIn },
});

const listSubscriptionsRoute = createRoute({
  method: 'get',
  path: '/v1/push/subscriptions',
  tags: ['Push'],
  summary: 'Devices that get push notifications',
  responses: {
    200: json(pushSubscriptionListSchema, "This user's subscriptions."),
    ...signedIn,
  },
});

const subscribeRoute = createRoute({
  method: 'post',
  path: '/v1/push/subscriptions',
  tags: ['Push'],
  summary: 'Turn push notifications on for a device',
  description:
    "Stores the browser's push subscription. Notifications then go through the browser vendor's push service. The endpoint must be https; the server only connects to it if it resolves to public addresses.",
  request: {
    body: {
      content: { 'application/json': { schema: pushSubscriptionBodySchema } },
    },
  },
  responses: {
    204: { description: 'Subscribed.' },
    400: problemResponse('The subscription is invalid.'),
    ...signedIn,
  },
});

const unsubscribeRoute = createRoute({
  method: 'delete',
  path: '/v1/push/subscriptions',
  tags: ['Push'],
  summary: 'Turn push notifications off for a device',
  request: { query: removePushQuerySchema },
  responses: {
    204: { description: 'Removed, or it was not there.' },
    ...signedIn,
  },
});

const testRoute = createRoute({
  method: 'post',
  path: '/v1/push/test',
  tags: ['Push'],
  summary: 'Send a test notification',
  description:
    'Sends one notification to every device this user subscribed. A device the push service no longer knows is removed.',
  responses: { 200: json(pushTestResultSchema, 'What happened.'), ...signedIn },
});

export function registerReminderRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now, push, logger } = deps;
  app.use('/v1/reminders', requireUser(deps));
  app.use('/v1/reminders/*', requireUser(deps));
  app.use('/v1/push/*', requireUser(deps));

  app.openapi(listRoute, async (c) =>
    c.json(await listReminders(db, c.get('user').id), 200),
  );

  app.openapi(readRoute, async (c) => {
    await markRead(db, c.get('user').id, c.req.valid('json').ids, now());
    return c.body(null, 204);
  });

  app.openapi(configRoute, async (c) =>
    c.json({ publicKey: await push.publicKey() }, 200),
  );

  app.openapi(listSubscriptionsRoute, async (c) => {
    const rows = await db
      .selectFrom('push_subscriptions')
      .select(['id', 'endpoint', 'user_agent', 'created_at'])
      .where('user_id', '=', c.get('user').id)
      .orderBy('created_at', 'desc')
      .execute();
    return c.json(
      {
        subscriptions: rows.map((row) => ({
          id: row.id,
          endpoint: row.endpoint,
          userAgent: row.user_agent,
          createdAt: row.created_at,
        })),
      },
      200,
    );
  });

  app.openapi(subscribeRoute, async (c) => {
    const body = c.req.valid('json');
    await addSubscription(
      db,
      c.get('user').id,
      {
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
      },
      c.req.header('user-agent')?.slice(0, 300) ?? null,
      now(),
    );
    return c.body(null, 204);
  });

  app.openapi(unsubscribeRoute, async (c) => {
    await db
      .deleteFrom('push_subscriptions')
      .where('user_id', '=', c.get('user').id)
      .where('endpoint', '=', c.req.valid('query').endpoint)
      .execute();
    return c.body(null, 204);
  });

  app.openapi(testRoute, async (c) =>
    c.json(
      await pushToUser(
        db,
        push.send,
        c.get('user').id,
        {
          title: 'Notifications are on',
          body: 'This device will get Allotr reminders.',
          url: '/',
        },
        logger,
      ),
      200,
    ),
  );
}
