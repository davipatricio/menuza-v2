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

/** An endpoint that reports 404/410 (or an explicit expiry) is dead; drop the row. */
function isDeadEndpoint(res: { statusCode?: number; isExpired?: boolean }): boolean {
  return Boolean(res.isExpired) || res.statusCode === 404 || res.statusCode === 410;
}

const NO_RECIPIENTS: PushDispatchResult = { sentCount: 0, expiredCount: 0, failedCount: 0 };

/**
 * Resolves who should actually receive this event: opted-in members, narrowed to
 * an explicit target list when one is given, then filtered to current members so
 * somebody removed from the tenant stops receiving pushes.
 */
async function resolveRecipients(
  client: any,
  options: DispatchPushEventOptions,
): Promise<string[]> {
  const targets = options.targetMemberIds?.length ? options.targetMemberIds : null;

  if (options.targetMemberIds !== undefined && !targets) return [];

  let prefQuery = client.orm.public.PushPreference.where({
    tenantId: options.tenantId,
    event: options.event,
  });

  if (targets) {
    // SAFETY: Prisma 8 field proxy supports in operator on memberId
    prefQuery = prefQuery.where((p: any) => p.memberId.in(targets));
  }

  // SAFETY: the query builders are untyped proxies; both rows carry memberId.
  const preferences = (await prefQuery.all()) as { memberId: string }[];
  const optedIn = new Set<string>(preferences.map((p) => p.memberId));

  // SAFETY: as above, TenantMembership rows are only read for memberId.
  const memberships = (await client.orm.public.TenantMembership.where({
    tenantId: options.tenantId,
  }).all()) as { memberId: string }[];

  const enrolled = new Set<string>(memberships.map((m) => m.memberId));

  return [...optedIn].filter((id) => enrolled.has(id) && (!targets || targets.includes(id)));
}

export async function dispatchPushEvent(
  options: DispatchPushEventOptions,
): Promise<PushDispatchResult> {
  return await withTenant(options.tenantId, async () => {
    const client = options.dbClient ?? db;
    const send = options.sendFn ?? sendPushNotification;
    const payload = options.payload ?? createPushEventPayload(options.event);
    const config = options.config ?? loadVapidFromEnv() ?? undefined;

    const memberIds = await resolveRecipients(client, options);

    if (memberIds.length === 0) return NO_RECIPIENTS;

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

      if (isDeadEndpoint(res)) {
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
