import { z } from 'zod';

// Reminders and Web Push (ADR 0024). A reminder is created by the server's
// scheduler; Web Push is off until a user opts in on a device.

const idSchema = z.string().min(1).max(64);

export const reminderKindSchema = z.enum([
  'bill_due',
  'iou_due',
  'iou_overdue',
  'weekly_review',
]);
export type ReminderKindView = z.infer<typeof reminderKindSchema>;

export const reminderSchema = z.object({
  id: idSchema,
  kind: reminderKindSchema,
  title: z.string(),
  body: z.string(),
  /** A path inside the app that the reminder opens. */
  url: z.string(),
  createdAt: z.iso.datetime(),
  /** Null until the user marks it read. */
  readAt: z.iso.datetime().nullable(),
});
export type ReminderView = z.infer<typeof reminderSchema>;

export const reminderListSchema = z.object({
  /** Newest first, at most 50. */
  reminders: z.array(reminderSchema),
  unread: z.int(),
});
export type ReminderListView = z.infer<typeof reminderListSchema>;

export const markReadBodySchema = z.object({
  /** Every unread reminder when omitted. */
  ids: z.array(idSchema).min(1).max(100).optional(),
});
export type MarkReadBody = z.output<typeof markReadBodySchema>;

export const pushConfigSchema = z.object({
  /** The VAPID public key a browser subscribes with (base64url). */
  publicKey: z.string(),
});

const base64url = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/)
  .min(8)
  .max(512);

export const pushSubscriptionBodySchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2048),
  keys: z.object({ p256dh: base64url, auth: base64url }),
});
export type PushSubscriptionBody = z.output<typeof pushSubscriptionBodySchema>;

export const pushSubscriptionSchema = z.object({
  id: idSchema,
  endpoint: z.string(),
  userAgent: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type PushSubscriptionView = z.infer<typeof pushSubscriptionSchema>;

export const pushSubscriptionListSchema = z.object({
  subscriptions: z.array(pushSubscriptionSchema),
});
export type PushSubscriptionListView = z.infer<
  typeof pushSubscriptionListSchema
>;

export const removePushQuerySchema = z.object({
  endpoint: z.string().min(1).max(2048),
});

export const pushTestResultSchema = z.object({
  /** Devices the test notification went to. */
  sent: z.int(),
  /** Devices the push service no longer knew; they were removed. */
  removed: z.int(),
  failed: z.int(),
});
