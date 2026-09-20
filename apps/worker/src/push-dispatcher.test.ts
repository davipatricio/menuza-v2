/* eslint-disable anti-slop/no-chained-type-assertions */
import { describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { getActiveTenantId } from "@menuza/tenant-context";
import {
  createPushEventPayload,
  dispatchPushEvent,
  pushJobId,
  PUSH_NOTIFICATIONS_QUEUE,
  type PushEventType,
} from "./push-dispatcher.ts";
import type { PushNotificationPayload, PushSubscriptionData, VapidConfig } from "./push-sender.ts";

interface MockSubscription {
  id: string;
  tenantId: string;
  memberId: string;
  endpoint: string;
  auth: string;
  p256dh: string;
}

interface MockPreference {
  id: string;
  tenantId: string;
  memberId: string;
  event: string;
}

function createMockDb(initial: {
  preferences?: MockPreference[];
  subscriptions?: MockSubscription[];
  memberships?: Array<{ tenantId: string; memberId: string }>;
}) {
  const preferences = [...(initial.preferences ?? [])];
  let subscriptions = [...(initial.subscriptions ?? [])];

  // Default to "every opted-in member is still enrolled" so tests that only
  // care about preference/subscription filtering do not restate memberships.
  const memberships =
    initial.memberships ?? preferences.map((p) => ({ tenantId: p.tenantId, memberId: p.memberId }));

  const deletedIds: string[] = [];

  const dbClient = {
    orm: {
      public: {
        TenantMembership: {
          where: (filter: { tenantId?: string; memberId?: string }) => {
            const result = memberships.filter((m) => {
              if (filter.tenantId && m.tenantId !== filter.tenantId) return false;

              if (filter.memberId && m.memberId !== filter.memberId) return false;

              return true;
            });

            return {
              all: async () => result,
            };
          },
        },
        PushPreference: {
          where: (filter: { tenantId?: string; event?: string; memberId?: string }) => {
            let result = preferences.filter((p) => {
              if (filter.tenantId && p.tenantId !== filter.tenantId) return false;

              if (filter.event && p.event !== filter.event) return false;

              if (filter.memberId && p.memberId !== filter.memberId) return false;

              return true;
            });

            return {
              where: (predicateFn: (p: { memberId: { in: (ids: string[]) => void } }) => void) => {
                const proxy = {
                  memberId: {
                    in: (ids: string[]) => {
                      result = result.filter((p) => ids.includes(p.memberId));
                    },
                  },
                };

                predicateFn(proxy);

                return {
                  all: async () => result,
                };
              },
              all: async () => result,
            };
          },
        },
        PushSubscription: {
          where: (filter: { tenantId?: string; id?: string; memberId?: string }) => {
            let result = subscriptions.filter((s) => {
              if (filter.tenantId && s.tenantId !== filter.tenantId) return false;

              if (filter.id && s.id !== filter.id) return false;

              if (filter.memberId && s.memberId !== filter.memberId) return false;

              return true;
            });

            return {
              where: (predicateFn: (s: { memberId: { in: (ids: string[]) => void } }) => void) => {
                const proxy = {
                  memberId: {
                    in: (ids: string[]) => {
                      result = result.filter((s) => ids.includes(s.memberId));
                    },
                  },
                };

                predicateFn(proxy);

                return {
                  all: async () => result,
                  deleteAll: async () => {
                    for (const s of result) {
                      deletedIds.push(s.id);
                    }

                    subscriptions = subscriptions.filter((s) => !result.some((r) => r.id === s.id));
                  },
                };
              },
              all: async () => result,
              deleteAll: async () => {
                for (const s of result) {
                  deletedIds.push(s.id);
                }

                subscriptions = subscriptions.filter((s) => !result.some((r) => r.id === s.id));
              },
            };
          },
        },
      },
    },
  };

  return {
    // SAFETY: dbClient implements the required subset of Prisma 8 client for push dispatcher tests
    dbClient: dbClient as unknown as import("@menuza/db").Db,
    getSubscriptions: () => subscriptions,
    getDeletedIds: () => deletedIds,
  };
}

describe("push-dispatcher", () => {
  test("queue name constant is push-notifications", () => {
    expect(PUSH_NOTIFICATIONS_QUEUE).toBe("push-notifications");
  });

  test("pushJobId is stable for an identical envelope and differs across events", () => {
    const envelope = { tenantId: "t1", event: "ORDER_CREATED" as const };

    expect(pushJobId(envelope)).toBe(pushJobId({ ...envelope }));
    expect(pushJobId(envelope)).not.toBe(pushJobId({ ...envelope, event: "ORDER_READY" }));
  });

  describe("createPushEventPayload", () => {
    const events: Array<{
      event: PushEventType;
      expectedTitle: string;
      expectedBody: string;
    }> = [
      {
        event: "ORDER_CREATED",
        expectedTitle: "Novo Pedido",
        expectedBody: "Novo pedido #1001 recebido",
      },
      {
        event: "PAYMENT_CONFIRMED",
        expectedTitle: "Pagamento Confirmado",
        expectedBody: "Pagamento do pedido #1001 confirmado",
      },
      {
        event: "PIX_EXPIRED",
        expectedTitle: "Pix Expirado",
        expectedBody: "Cobrança Pix do pedido #1001 expirou",
      },
      {
        event: "ORDER_READY",
        expectedTitle: "Pedido Pronto",
        expectedBody: "Pedido #1001 está pronto para entrega/retirada",
      },
      {
        event: "ORDER_CANCELLED",
        expectedTitle: "Pedido Cancelado",
        expectedBody: "Pedido #1001 foi cancelado",
      },
    ];

    for (const { event, expectedTitle, expectedBody } of events) {
      test(`creates Portuguese payload for ${event} with orderId`, () => {
        const payload = createPushEventPayload(event, { orderId: "1001" });

        expect(payload.title).toBe(expectedTitle);
        expect(payload.body).toBe(expectedBody);
        expect(payload.url).toBe("/manage/orders");
        expect(payload.tag).toBe("order-1001");
      });
    }

    test("falls back to empty orderId and event tag when orderId is omitted", () => {
      const payload = createPushEventPayload("ORDER_CREATED");

      expect(payload.title).toBe("Novo Pedido");
      expect(payload.body).toBe("Novo pedido # recebido");
      expect(payload.url).toBe("/manage/orders");
      expect(payload.tag).toBe("order-ORDER_CREATED");
    });
  });

  describe("dispatchPushEvent", () => {
    test("preference filtering: member without preference gets no push", async () => {
      const tenantId = randomUUID();
      const optedInMemberId = randomUUID();
      const nonOptedMemberId = randomUUID();

      const mockDb = createMockDb({
        preferences: [
          {
            id: randomUUID(),
            tenantId,
            memberId: optedInMemberId,
            event: "ORDER_CREATED",
          },
        ],
        subscriptions: [
          {
            id: "sub-opted",
            tenantId,
            memberId: optedInMemberId,
            endpoint: "https://fcm.googleapis.com/fcm/send/opted",
            auth: "auth1",
            p256dh: "p256dh1",
          },
          {
            id: "sub-non-opted",
            tenantId,
            memberId: nonOptedMemberId,
            endpoint: "https://fcm.googleapis.com/fcm/send/non-opted",
            auth: "auth2",
            p256dh: "p256dh2",
          },
        ],
      });

      const calledEndpoints: string[] = [];

      const sendFn = mock(
        async (
          sub: PushSubscriptionData,
          _payload: PushNotificationPayload,
          _config?: VapidConfig,
        ) => {
          calledEndpoints.push(sub.endpoint);

          return { success: true, statusCode: 201 };
        },
      );

      const result = await dispatchPushEvent({
        tenantId,
        event: "ORDER_CREATED",
        dbClient: mockDb.dbClient,
        sendFn,
      });

      expect(result.sentCount).toBe(1);
      expect(result.expiredCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(calledEndpoints).toEqual(["https://fcm.googleapis.com/fcm/send/opted"]);
      expect(sendFn).toHaveBeenCalledTimes(1);
    });

    test("revoked membership: opted-in member removed from the tenant gets no push", async () => {
      const tenantId = randomUUID();
      const activeMemberId = randomUUID();
      const revokedMemberId = randomUUID();

      const mockDb = createMockDb({
        preferences: [
          { id: randomUUID(), tenantId, memberId: activeMemberId, event: "ORDER_CREATED" },
          { id: randomUUID(), tenantId, memberId: revokedMemberId, event: "ORDER_CREATED" },
        ],
        subscriptions: [
          {
            id: "sub-active",
            tenantId,
            memberId: activeMemberId,
            endpoint: "https://fcm.googleapis.com/fcm/send/active",
            auth: "auth1",
            p256dh: "p256dh1",
          },
          {
            id: "sub-revoked",
            tenantId,
            memberId: revokedMemberId,
            endpoint: "https://fcm.googleapis.com/fcm/send/revoked",
            auth: "auth2",
            p256dh: "p256dh2",
          },
        ],
        // Only the active member still has a TenantMembership row.
        memberships: [{ tenantId, memberId: activeMemberId }],
      });

      const calledEndpoints: string[] = [];

      const sendFn = mock(
        async (
          sub: PushSubscriptionData,
          _payload: PushNotificationPayload,
          _config?: VapidConfig,
        ) => {
          calledEndpoints.push(sub.endpoint);

          return { success: true, statusCode: 201 };
        },
      );

      const result = await dispatchPushEvent({
        tenantId,
        event: "ORDER_CREATED",
        dbClient: mockDb.dbClient,
        sendFn,
      });

      expect(result.sentCount).toBe(1);
      expect(calledEndpoints).toEqual(["https://fcm.googleapis.com/fcm/send/active"]);
      expect(sendFn).toHaveBeenCalledTimes(1);
    });

    test("target member filtering: limits push to target member IDs", async () => {
      const tenantId = randomUUID();
      const member1Id = randomUUID();
      const member2Id = randomUUID();

      const mockDb = createMockDb({
        preferences: [
          { id: randomUUID(), tenantId, memberId: member1Id, event: "ORDER_CREATED" },
          { id: randomUUID(), tenantId, memberId: member2Id, event: "ORDER_CREATED" },
        ],
        subscriptions: [
          {
            id: "sub-1",
            tenantId,
            memberId: member1Id,
            endpoint: "https://fcm.googleapis.com/fcm/send/member1",
            auth: "auth1",
            p256dh: "p256dh1",
          },
          {
            id: "sub-2",
            tenantId,
            memberId: member2Id,
            endpoint: "https://fcm.googleapis.com/fcm/send/member2",
            auth: "auth2",
            p256dh: "p256dh2",
          },
        ],
      });

      const calledEndpoints: string[] = [];

      const sendFn = mock(
        async (
          sub: PushSubscriptionData,
          _payload: PushNotificationPayload,
          _config?: VapidConfig,
        ) => {
          calledEndpoints.push(sub.endpoint);

          return { success: true, statusCode: 201 };
        },
      );

      const result = await dispatchPushEvent({
        tenantId,
        event: "ORDER_CREATED",
        targetMemberIds: [member1Id],
        dbClient: mockDb.dbClient,
        sendFn,
      });

      expect(result.sentCount).toBe(1);
      expect(calledEndpoints).toEqual(["https://fcm.googleapis.com/fcm/send/member1"]);
    });

    test("empty targetMemberIds returns early without sending", async () => {
      const tenantId = randomUUID();
      const memberId = randomUUID();

      const mockDb = createMockDb({
        preferences: [{ id: randomUUID(), tenantId, memberId, event: "ORDER_CREATED" }],
        subscriptions: [
          {
            id: "sub-1",
            tenantId,
            memberId,
            endpoint: "https://fcm.googleapis.com/fcm/send/member1",
            auth: "auth1",
            p256dh: "p256dh1",
          },
        ],
      });

      const sendFn = mock(async () => ({ success: true }));

      const result = await dispatchPushEvent({
        tenantId,
        event: "ORDER_CREATED",
        targetMemberIds: [],
        dbClient: mockDb.dbClient,
        sendFn,
      });

      expect(result).toEqual({ sentCount: 0, expiredCount: 0, failedCount: 0 });
      expect(sendFn).toHaveBeenCalledTimes(0);
    });

    test("automatic pruning of expired endpoints on 404 and 410", async () => {
      const tenantId = randomUUID();
      const memberId = randomUUID();

      const mockDb = createMockDb({
        preferences: [{ id: randomUUID(), tenantId, memberId, event: "ORDER_CREATED" }],
        subscriptions: [
          {
            id: "sub-expired-410",
            tenantId,
            memberId,
            endpoint: "https://fcm.googleapis.com/fcm/send/410",
            auth: "auth1",
            p256dh: "p256dh1",
          },
          {
            id: "sub-expired-404",
            tenantId,
            memberId,
            endpoint: "https://fcm.googleapis.com/fcm/send/404",
            auth: "auth2",
            p256dh: "p256dh2",
          },
          {
            id: "sub-valid",
            tenantId,
            memberId,
            endpoint: "https://fcm.googleapis.com/fcm/send/201",
            auth: "auth3",
            p256dh: "p256dh3",
          },
        ],
      });

      const sendFn = mock(
        async (
          sub: PushSubscriptionData,
          _payload: PushNotificationPayload,
          _config?: VapidConfig,
        ) => {
          if (sub.endpoint.includes("410")) {
            return { success: false, statusCode: 410, isExpired: true };
          }

          if (sub.endpoint.includes("404")) {
            return { success: false, statusCode: 404, isExpired: true };
          }

          return { success: true, statusCode: 201, isExpired: false };
        },
      );

      const result = await dispatchPushEvent({
        tenantId,
        event: "ORDER_CREATED",
        dbClient: mockDb.dbClient,
        sendFn,
      });

      expect(result.sentCount).toBe(1);
      expect(result.expiredCount).toBe(2);
      expect(result.failedCount).toBe(0);

      const remainingSubs = mockDb.getSubscriptions();

      expect(remainingSubs.length).toBe(1);
      expect(remainingSubs[0]?.id).toBe("sub-valid");
      expect(mockDb.getDeletedIds()).toEqual(["sub-expired-410", "sub-expired-404"]);
    });

    test("tenant isolation: different tenant subscriptions are not targeted", async () => {
      const tenantA = randomUUID();
      const tenantB = randomUUID();
      const memberA = randomUUID();
      const memberB = randomUUID();

      let activeTenantInsideCall: string | undefined;

      const mockDb = createMockDb({
        preferences: [
          { id: randomUUID(), tenantId: tenantA, memberId: memberA, event: "ORDER_CREATED" },
          { id: randomUUID(), tenantId: tenantB, memberId: memberB, event: "ORDER_CREATED" },
        ],
        subscriptions: [
          {
            id: "sub-tenant-a",
            tenantId: tenantA,
            memberId: memberA,
            endpoint: "https://fcm.googleapis.com/fcm/send/tenant-a",
            auth: "authA",
            p256dh: "p256dhA",
          },
          {
            id: "sub-tenant-b",
            tenantId: tenantB,
            memberId: memberB,
            endpoint: "https://fcm.googleapis.com/fcm/send/tenant-b",
            auth: "authB",
            p256dh: "p256dhB",
          },
        ],
      });

      const calledEndpoints: string[] = [];

      const sendFn = mock(
        async (
          sub: PushSubscriptionData,
          _payload: PushNotificationPayload,
          _config?: VapidConfig,
        ) => {
          activeTenantInsideCall = getActiveTenantId();
          calledEndpoints.push(sub.endpoint);

          return { success: true, statusCode: 201 };
        },
      );

      const result = await dispatchPushEvent({
        tenantId: tenantA,
        event: "ORDER_CREATED",
        dbClient: mockDb.dbClient,
        sendFn,
      });

      expect(result.sentCount).toBe(1);
      expect(calledEndpoints).toEqual(["https://fcm.googleapis.com/fcm/send/tenant-a"]);
      expect(activeTenantInsideCall).toBe(tenantA);
    });

    test("handles send failure without deleting subscription", async () => {
      const tenantId = randomUUID();
      const memberId = randomUUID();

      const mockDb = createMockDb({
        preferences: [{ id: randomUUID(), tenantId, memberId, event: "ORDER_CREATED" }],
        subscriptions: [
          {
            id: "sub-fail",
            tenantId,
            memberId,
            endpoint: "https://fcm.googleapis.com/fcm/send/500",
            auth: "auth1",
            p256dh: "p256dh1",
          },
        ],
      });

      const sendFn = mock(async () => ({
        success: false,
        statusCode: 500,
        isExpired: false,
        error: "Internal server error",
      }));

      const result = await dispatchPushEvent({
        tenantId,
        event: "ORDER_CREATED",
        dbClient: mockDb.dbClient,
        sendFn,
      });

      expect(result.sentCount).toBe(0);
      expect(result.expiredCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(mockDb.getSubscriptions().length).toBe(1);
      expect(mockDb.getDeletedIds().length).toBe(0);
    });
  });
});
