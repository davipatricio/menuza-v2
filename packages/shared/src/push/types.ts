export const PUSH_EVENTS = [
  "ORDER_CREATED",
  "PAYMENT_CONFIRMED",
  "PIX_EXPIRED",
  "ORDER_READY",
  "ORDER_CANCELLED",
] as const;

export type PushEvent = (typeof PUSH_EVENTS)[number];

export interface PushSubscriptionKeys {
  auth: string;
  p256dh: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: PushSubscriptionKeys;
  expirationTime?: number | null;
}

export interface PushUnsubscribeInput {
  endpoint: string;
}

export interface PushPreferencesInput {
  events: PushEvent[];
}

export interface GetPublicKeyOutput {
  publicKey: string;
}

export interface GetPreferencesOutput {
  events: PushEvent[];
}

export interface PushSuccessOutput {
  success: boolean;
}

export type PushSubscriptionOutput = PushSuccessOutput;

/** Notification payload delivered to the push service. */
export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, string | number | boolean>;
}

/** Queue envelope consumed by the worker's push-notifications handler. */
export interface PushJobPayload {
  tenantId: string;
  event: PushEvent;
  targetMemberIds?: string[];
  payload?: PushNotificationPayload;
}
