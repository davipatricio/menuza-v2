import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { call, ORPCError } from "@orpc/server";
import { db } from "@menuza/db";
import { TENANT_COOKIE_NAME, hashSessionToken } from "@menuza/auth-core";
import { pushSubdomainRouter } from "../src/domains/tenant/subdomains/push/router.ts";

function reqHeaders(headers: Record<string, string> = {}): Headers {
  return new Headers(headers);
}

describe("Push Subscriptions and Preferences API", () => {
  const originalSessionWhere = db.orm.public.Session.where;
  const originalMembershipWhere = db.orm.public.TenantMembership.where;
  const originalSubscriptionWhere = db.orm.public.PushSubscription.where;
  const originalSubscriptionCreate = db.orm.public.PushSubscription.create;
  const originalPreferenceWhere = db.orm.public.PushPreference.where;
  const originalPreferenceCreateAll = db.orm.public.PushPreference.createAll;
  // SAFETY: db.transaction is a real runtime method; tests run handler logic against
  // in-memory stores, so run the callback with the mocked orm surface instead.
  const originalTransaction = (db as any).transaction;
  const originalVapidPublicKey = process.env.VAPID_PUBLIC_KEY;

  const tenantId = randomUUID();
  const memberId = randomUUID();
  const sessionId = randomUUID();

  let sessionStore: Map<string, any>;
  let membershipStore: Map<string, any>;
  let subscriptionStore: Map<string, any>;
  let preferenceStore: Map<string, any>;

  beforeEach(() => {
    process.env.VAPID_PUBLIC_KEY = "test-vapid-public-key";

    sessionStore = new Map();
    const digest = hashSessionToken(sessionId);
    // Sessions are keyed by the digest of the token the client holds, mirroring
    // the real table: the raw token only ever lives in the cookie.
    sessionStore.set(digest, {
      memberId,
      namespace: "tenant",
      expiresAt: Temporal.Now.zonedDateTimeISO("UTC").add({ hours: 1 }).toPlainDateTime(),
      revokedAt: null,
      lastUsedAt: Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime(),
    });

    membershipStore = new Map();
    membershipStore.set(`${memberId}:${tenantId}`, {
      id: randomUUID(),
      memberId,
      tenantId,
      role: "Admin",
    });

    subscriptionStore = new Map();
    preferenceStore = new Map();

    // SAFETY: Mocking Session.where query builder for test environment.
    db.orm.public.Session.where = ((filter: any) => ({
      first: async () => sessionStore.get(filter.id) ?? null,
    })) as any;

    // SAFETY: Mocking TenantMembership.where query builder for test environment.
    db.orm.public.TenantMembership.where = ((filter: any) => ({
      first: async () => membershipStore.get(`${filter.memberId}:${filter.tenantId}`) ?? null,
    })) as any;

    // SAFETY: Mocking PushSubscription.where query builder for test environment.
    db.orm.public.PushSubscription.where = ((filter: any) => ({
      first: async () => {
        for (const sub of subscriptionStore.values()) {
          if (filter.endpoint && sub.endpoint === filter.endpoint) return sub;

          if (filter.id && sub.id === filter.id) return sub;
        }

        return null;
      },
      updateAll: async (data: any) => {
        for (const sub of subscriptionStore.values()) {
          if (
            (!filter.id || sub.id === filter.id) &&
            (!filter.tenantId || sub.tenantId === filter.tenantId) &&
            (!filter.endpoint || sub.endpoint === filter.endpoint)
          ) {
            Object.assign(sub, data);
          }
        }
      },
      deleteAll: async () => {
        for (const [id, sub] of subscriptionStore.entries()) {
          if (
            (!filter.tenantId || sub.tenantId === filter.tenantId) &&
            (!filter.memberId || sub.memberId === filter.memberId) &&
            (!filter.endpoint || sub.endpoint === filter.endpoint)
          ) {
            subscriptionStore.delete(id);
          }
        }
      },
    })) as any;

    // SAFETY: Mocking PushSubscription.create for test environment.
    db.orm.public.PushSubscription.create = (async (data: any) => {
      subscriptionStore.set(data.id, { ...data });

      return data;
    }) as any;

    // SAFETY: Mocking PushPreference.where query builder for test environment.
    db.orm.public.PushPreference.where = ((filter: any) => ({
      all: async () => {
        const results = [];

        for (const pref of preferenceStore.values()) {
          if (
            (!filter.tenantId || pref.tenantId === filter.tenantId) &&
            (!filter.memberId || pref.memberId === filter.memberId)
          ) {
            results.push(pref);
          }
        }

        return results;
      },
      deleteAll: async () => {
        for (const [id, pref] of preferenceStore.entries()) {
          if (
            (!filter.tenantId || pref.tenantId === filter.tenantId) &&
            (!filter.memberId || pref.memberId === filter.memberId)
          ) {
            preferenceStore.delete(id);
          }
        }
      },
    })) as any;

    // SAFETY: Mocking PushPreference.createAll for test environment.
    db.orm.public.PushPreference.createAll = (async (items: any[]) => {
      for (const item of items) {
        preferenceStore.set(item.id, { ...item });
      }

      return items;
    }) as any;

    // SAFETY: Runs the transaction callback against the mocked orm surface.
    (db as any).transaction = (async (fn: any) => fn({ orm: db.orm })) as any;
  });

  afterEach(() => {
    db.orm.public.Session.where = originalSessionWhere;
    db.orm.public.TenantMembership.where = originalMembershipWhere;
    db.orm.public.PushSubscription.where = originalSubscriptionWhere;
    db.orm.public.PushSubscription.create = originalSubscriptionCreate;
    db.orm.public.PushPreference.where = originalPreferenceWhere;
    db.orm.public.PushPreference.createAll = originalPreferenceCreateAll;
    // SAFETY: Restores the real transaction method captured in beforeEach.
    (db as any).transaction = originalTransaction;

    if (originalVapidPublicKey !== undefined) {
      process.env.VAPID_PUBLIC_KEY = originalVapidPublicKey;
    } else {
      delete process.env.VAPID_PUBLIC_KEY;
    }
  });

  const authContext = {
    context: {
      reqHeaders: reqHeaders({
        "x-menuza-tenant-id": tenantId,
        cookie: `${TENANT_COOKIE_NAME}=${sessionId}`,
      }),
    },
  };

  test("getPublicKey returns public key when configured", async () => {
    const res = await call(pushSubdomainRouter.getPublicKey, undefined, {
      context: { reqHeaders: reqHeaders() },
    });

    expect(res.publicKey).toBe("test-vapid-public-key");
  });

  test("getPublicKey throws INTERNAL when VAPID_PUBLIC_KEY is not set", async () => {
    delete process.env.VAPID_PUBLIC_KEY;

    try {
      await call(pushSubdomainRouter.getPublicKey, undefined, {
        context: { reqHeaders: reqHeaders() },
      });
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ORPCError);
      expect(err.code).toBe("INTERNAL");
    }
  });

  test("Unauthorized access without session throws UNAUTHORIZED", async () => {
    try {
      await call(
        pushSubdomainRouter.subscribe,
        {
          endpoint: "https://push.services.mozilla.com/test",
          keys: { p256dh: "key1", auth: "auth1" },
          expirationTime: null,
        },
        {
          context: {
            reqHeaders: reqHeaders({ "x-menuza-tenant-id": tenantId }),
          },
        },
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ORPCError);
      expect(err.code).toBe("UNAUTHORIZED");
    }
  });

  test("SSRF rejection on disallowed endpoints", async () => {
    const invalidEndpoints = [
      "http://fcm.googleapis.com/sub",
      "https://localhost/sub",
      "https://127.0.0.1/sub",
      "https://10.0.0.1/sub",
      "https://192.168.1.1/sub",
      "https://172.16.0.1/sub",
      "https://evil-fcm.googleapis.com.attacker.tld/fcm/send",
      "https://updates.push.services.mozilla.com.attacker.tld/wpush",
      "https://user:pass@fcm.googleapis.com/sub",
      "https://fcm.googleapis.com:8443/sub",
    ];

    for (const endpoint of invalidEndpoints) {
      try {
        await call(
          pushSubdomainRouter.subscribe,
          {
            endpoint,
            keys: { p256dh: "key1", auth: "auth1" },
            expirationTime: null,
          },
          authContext,
        );
        expect.unreachable();
      } catch (err: any) {
        expect(err).toBeInstanceOf(ORPCError);
        expect(err.code).toBe("VALIDATION_FAILED");
      }
    }
  });

  test("Successful subscribe, getPreferences, updatePreferences, unsubscribe flow", async () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/valid-token-123";

    // 1. Subscribe new endpoint
    const subResult = await call(
      pushSubdomainRouter.subscribe,
      {
        endpoint,
        keys: { p256dh: "test-p256dh", auth: "test-auth" },
        expirationTime: null,
      },
      authContext,
    );

    expect(subResult).toEqual({ success: true });
    expect(subscriptionStore.size).toBe(1);

    // 2. Resubscribe updates keys
    const updateResult = await call(
      pushSubdomainRouter.subscribe,
      {
        endpoint,
        keys: { p256dh: "updated-p256dh", auth: "updated-auth" },
        expirationTime: null,
      },
      authContext,
    );

    expect(updateResult).toEqual({ success: true });
    expect(subscriptionStore.size).toBe(1);

    // SAFETY: subscriptionStore is populated from step 1.
    const stored = [...subscriptionStore.values()][0] as any;

    expect(stored.p256dh).toBe("updated-p256dh");

    // 3. getPreferences initially empty
    const initialPrefs = await call(pushSubdomainRouter.getPreferences, undefined, authContext);

    expect(initialPrefs).toEqual({ events: [] });

    // 4. updatePreferences
    const updatedPrefs = await call(
      pushSubdomainRouter.updatePreferences,
      { events: ["ORDER_CREATED", "PAYMENT_CONFIRMED"] },
      authContext,
    );

    expect(updatedPrefs).toEqual({ events: ["ORDER_CREATED", "PAYMENT_CONFIRMED"] });

    // Verify getPreferences reflects changes
    const currentPrefs = await call(pushSubdomainRouter.getPreferences, undefined, authContext);

    expect(currentPrefs.events).toEqual(["ORDER_CREATED", "PAYMENT_CONFIRMED"]);

    // 5. Unsubscribe removes subscription
    const unsubResult = await call(pushSubdomainRouter.unsubscribe, { endpoint }, authContext);

    expect(unsubResult).toEqual({ success: true });
    expect(subscriptionStore.size).toBe(0);
  });

  test("subscribe throws FORBIDDEN when endpoint belongs to another tenant or member", async () => {
    const otherTenantId = randomUUID();
    const otherMemberId = randomUUID();
    const endpoint = "https://fcm.googleapis.com/fcm/send/shared-endpoint";

    subscriptionStore.set("other-sub-id", {
      id: "other-sub-id",
      tenantId: otherTenantId,
      memberId: otherMemberId,
      endpoint,
      p256dh: "p256",
      auth: "auth",
      expirationTime: null,
    });

    try {
      await call(
        pushSubdomainRouter.subscribe,
        {
          endpoint,
          keys: { p256dh: "new-p256", auth: "new-auth" },
          expirationTime: null,
        },
        authContext,
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ORPCError);
      expect(err.code).toBe("FORBIDDEN");
    }
  });
});
