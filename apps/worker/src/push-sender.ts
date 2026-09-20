import webPush from "web-push";
import { isAllowedPushEndpoint } from "@menuza/shared/push";

export interface VapidConfig {
  subject: string;
  publicKey: string;
  privateKey: string;
}

export interface PushSubscriptionKeys {
  auth: string;
  p256dh: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: PushSubscriptionKeys;
  expirationTime?: number | null;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, string | number | boolean>;
}

export function configureVapid(config: VapidConfig): void {
  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
}

export function loadVapidFromEnv(): VapidConfig | null {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!subject || !publicKey || !privateKey) {
    return null;
  }

  return { subject, publicKey, privateKey };
}

export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: PushNotificationPayload,
  config?: VapidConfig,
): Promise<{ success: boolean; statusCode?: number; error?: string; isExpired?: boolean }> {
  if (!isAllowedPushEndpoint(subscription.endpoint)) {
    return {
      success: false,
      error: "Invalid or disallowed push endpoint",
      isExpired: false,
    };
  }

  try {
    if (config) {
      configureVapid(config);
    }

    const payloadString = JSON.stringify(payload);
    // Timeout of 10s on push network transport
    const res = await webPush.sendNotification(subscription, payloadString, { timeout: 10000 });

    return {
      success: true,
      statusCode: res.statusCode,
      isExpired: false,
    };
  } catch (err: unknown) {
    // SAFETY: web-push rejects with WebPushError or standard Error with statusCode / message
    const errorObj = err as { statusCode?: number; message?: string; name?: string };
    const statusCode = errorObj.statusCode;
    const isExpired = statusCode === 404 || statusCode === 410;

    return {
      success: false,
      statusCode,
      error: errorObj.message ?? "Failed to send push notification",
      isExpired,
    };
  }
}
