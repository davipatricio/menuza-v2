import { createHash } from "node:crypto";
import { db } from "@menuza/db";
import { withTenant } from "@menuza/db/scope";
import type { PushEvent, PushJobPayload } from "@menuza/shared/push";
import {
  type PushNotificationPayload,
  type PushSubscriptionData,
  type PushSubscriptionKeys,
  type VapidConfig,
  loadVapidFromEnv,
  sendPushNotification,
} from "./push-sender.ts";

export type PushEventType = PushEvent;

export interface PushEventPayloadData {
  orderId?: string;
  customerName?: string;
  total?: string;
}

export interface PushDispatchResult {
  /** Delivered successfully. */
  sentCount: number;
  /** Endpoint permanently gone (404/410); subscription pruned. */
  expiredCount: number;
  /** Transient failure (429/5xx/network); the caller must retry. */
  failedCount: number;
}

export interface DispatchPushEventOptions {
  tenantId: string;
  event: PushEventType;
  targetMemberIds?: string[];
  payload?: PushNotificationPayload;
  config?: VapidConfig;
  dbClient?: typeof db;
  sendFn?: typeof sendPushNotification;
}

export const PUSH_NOTIFICATIONS_QUEUE = "push-notifications";

/** Deterministic id so re-enqueueing the same event envelope dedupes to one job. */
export function pushJobId(payload: PushJobPayload): string {
  const hash = createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 16);

  return `push-${hash}`;
}

export function createPushEventPayload(
  event: PushEventType,
  data: PushEventPayloadData = {},
): PushNotificationPayload {
  const orderId = data.orderId ?? "";
  let title = "";
  let body = "";

  switch (event) {
    case "ORDER_CREATED":
      title = "Novo Pedido";
      body = `Novo pedido #${orderId} recebido`;
      break;
    case "PAYMENT_CONFIRMED":
      title = "Pagamento Confirmado";
      body = `Pagamento do pedido #${orderId} confirmado`;
      break;
    case "PIX_EXPIRED":
      title = "Pix Expirado";
      body = `Cobrança Pix do pedido #${orderId} expirou`;
      break;
    case "ORDER_READY":
      title = "Pedido Pronto";
      body = `Pedido #${orderId} está pronto para entrega/retirada`;
      break;
    case "ORDER_CANCELLED":
      title = "Pedido Cancelado";
      body = `Pedido #${orderId} foi cancelado`;
      break;
  }

  return {
    title,
    body,
    url: "/manage/orders",
    tag: `order-${data.orderId ?? event}`,
  };
}

export async function dispatchPushEvent(
  options: DispatchPushEventOptions,
): Promise<PushDispatchResult> {
  return await withTenant(options.tenantId, async () => {
    const client = options.dbClient ?? db;
    const send = options.sendFn ?? sendPushNotification;
    const payload = options.payload ?? createPushEventPayload(options.event);
    const config = options.config ?? loadVapidFromEnv() ?? undefined;

    if (options.targetMemberIds !== undefined && options.targetMemberIds.length === 0) {
      return { sentCount: 0, expiredCount: 0, failedCount: 0 };
    }

    let prefQuery = client.orm.public.PushPreference.where({
      tenantId: options.tenantId,
      event: options.event,
    });

    if (options.targetMemberIds && options.targetMemberIds.length > 0) {
      // SAFETY: Prisma 8 field proxy supports in operator on memberId
      prefQuery = prefQuery.where((p: any) => p.memberId.in(options.targetMemberIds!));
    }

    const preferences = await prefQuery.all();
    let memberIds = [...new Set(preferences.map((p) => p.memberId))];

    if (options.targetMemberIds && options.targetMemberIds.length > 0) {
      const targetSet = new Set(options.targetMemberIds);

      memberIds = memberIds.filter((id) => targetSet.has(id));
    }

    if (memberIds.length === 0) {
      return { sentCount: 0, expiredCount: 0, failedCount: 0 };
    }

    // Eligibility: a member removed from the tenant must stop receiving pushes.
    const memberships = await client.orm.public.TenantMembership.where({
      tenantId: options.tenantId,
    }).all();

    const enrolled = new Set(memberships.map((m) => m.memberId));

    memberIds = memberIds.filter((id) => enrolled.has(id));

    if (memberIds.length === 0) {
      return { sentCount: 0, expiredCount: 0, failedCount: 0 };
    }

    let subQuery = client.orm.public.PushSubscription.where({
      tenantId: options.tenantId,
    });

    // SAFETY: Prisma 8 field proxy supports in operator on memberId
    subQuery = subQuery.where((s: any) => s.memberId.in(memberIds));

    const subscriptions = await subQuery.all();
    const memberIdSet = new Set(memberIds);

    const activeSubs = subscriptions.filter(
      (s) => s.tenantId === options.tenantId && memberIdSet.has(s.memberId),
    );

    let sentCount = 0;
    let expiredCount = 0;
    let failedCount = 0;

    for (const sub of activeSubs) {
      // SAFETY: sub from test mock or DB may nest keys
      const keys: PushSubscriptionKeys =
        "keys" in sub && sub.keys
          ? (sub.keys as PushSubscriptionKeys)
          : {
              auth: sub.auth,
              p256dh: sub.p256dh,
            };

      const subData: PushSubscriptionData & { id: string } = {
        id: sub.id,
        endpoint: sub.endpoint,
        keys,
        expirationTime: null,
      };

      const res = await send(subData, payload, config);

      if (res.isExpired || res.statusCode === 404 || res.statusCode === 410) {
        await client.orm.public.PushSubscription.where({
          tenantId: options.tenantId,
          id: sub.id,
        }).deleteAll();

        expiredCount++;
      } else if (res.success) {
        sentCount++;
      } else {
        failedCount++;
      }
    }

    return { sentCount, expiredCount, failedCount };
  });
}
