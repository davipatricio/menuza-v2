import { describe, expect, test } from "bun:test";
import * as v from "valibot";
import {
  GetPreferencesOutputSchema,
  GetPublicKeyOutputSchema,
  PUSH_EVENTS,
  PushEventSchema,
  PushJobPayloadSchema,
  PushPreferencesInputSchema,
  PushSubscriptionInputSchema,
  PushSubscriptionOutputSchema,
  PushSuccessOutputSchema,
  PushUnsubscribeInputSchema,
} from "../src/push/index.ts";

describe("PushEventSchema", () => {
  test("accepts all 5 canonical push events", () => {
    for (const event of PUSH_EVENTS) {
      expect(v.safeParse(PushEventSchema, event).success).toBe(true);
    }
  });

  test("rejects unknown or invalid events", () => {
    expect(v.safeParse(PushEventSchema, "UNKNOWN_EVENT").success).toBe(false);
    expect(v.safeParse(PushEventSchema, "").success).toBe(false);
    expect(v.safeParse(PushEventSchema, 123).success).toBe(false);
    expect(v.safeParse(PushEventSchema, null).success).toBe(false);
  });
});

describe("PushSubscriptionInputSchema", () => {
  const validSubscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/sample-token",
    keys: {
      p256dh:
        "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9t0PvNuDcDhviEndom4272eMG5zncld52T19usDZGmgpMY",
      auth: "tBHItJI5svbpez7KI4CCXg",
    },
  };

  test("accepts valid subscription without expirationTime", () => {
    const result = v.safeParse(PushSubscriptionInputSchema, validSubscription);
    expect(result.success).toBe(true);
  });

  test("accepts valid subscription with null expirationTime", () => {
    const result = v.safeParse(PushSubscriptionInputSchema, {
      ...validSubscription,
      expirationTime: null,
    });

    expect(result.success).toBe(true);
  });

  test("accepts valid subscription with numeric expirationTime", () => {
    const result = v.safeParse(PushSubscriptionInputSchema, {
      ...validSubscription,
      expirationTime: 1726848000,
    });

    expect(result.success).toBe(true);
  });

  test("rejects invalid or non-URL endpoint", () => {
    expect(
      v.safeParse(PushSubscriptionInputSchema, {
        ...validSubscription,
        endpoint: "not-a-url",
      }).success,
    ).toBe(false);

    expect(
      v.safeParse(PushSubscriptionInputSchema, {
        ...validSubscription,
        endpoint: "",
      }).success,
    ).toBe(false);
  });

  test("rejects invalid keys", () => {
    expect(
      v.safeParse(PushSubscriptionInputSchema, {
        ...validSubscription,
        keys: { p256dh: "", auth: "valid-auth" },
      }).success,
    ).toBe(false);

    expect(
      v.safeParse(PushSubscriptionInputSchema, {
        ...validSubscription,
        keys: { p256dh: "valid-p256dh", auth: "" },
      }).success,
    ).toBe(false);

    expect(
      v.safeParse(PushSubscriptionInputSchema, {
        ...validSubscription,
        keys: null,
      }).success,
    ).toBe(false);
  });

  test("rejects non-numeric expirationTime", () => {
    expect(
      v.safeParse(PushSubscriptionInputSchema, {
        ...validSubscription,
        expirationTime: "never",
      }).success,
    ).toBe(false);
  });
});

describe("PushUnsubscribeInputSchema", () => {
  test("accepts valid endpoint string", () => {
    const result = v.safeParse(PushUnsubscribeInputSchema, {
      endpoint: "https://fcm.googleapis.com/fcm/send/sample-token",
    });

    expect(result.success).toBe(true);
  });

  test("rejects empty or non-string endpoint", () => {
    expect(v.safeParse(PushUnsubscribeInputSchema, { endpoint: "" }).success).toBe(false);
    expect(v.safeParse(PushUnsubscribeInputSchema, { endpoint: 123 }).success).toBe(false);
    expect(v.safeParse(PushUnsubscribeInputSchema, {}).success).toBe(false);
  });
});

describe("PushPreferencesInputSchema", () => {
  test("accepts valid events array", () => {
    const result = v.safeParse(PushPreferencesInputSchema, {
      events: ["ORDER_CREATED", "PAYMENT_CONFIRMED"],
    });

    expect(result.success).toBe(true);
  });

  test("accepts empty events array", () => {
    const result = v.safeParse(PushPreferencesInputSchema, { events: [] });
    expect(result.success).toBe(true);
  });

  test("rejects invalid event in array", () => {
    expect(
      v.safeParse(PushPreferencesInputSchema, {
        events: ["ORDER_CREATED", "INVALID_EVENT"],
      }).success,
    ).toBe(false);
  });

  test("rejects non-array events", () => {
    expect(
      v.safeParse(PushPreferencesInputSchema, {
        events: "ORDER_CREATED",
      }).success,
    ).toBe(false);
  });

  test("rejects duplicate events", () => {
    expect(
      v.safeParse(PushPreferencesInputSchema, {
        events: ["ORDER_CREATED", "ORDER_CREATED"],
      }).success,
    ).toBe(false);
  });

  test("rejects unknown keys", () => {
    expect(
      v.safeParse(PushPreferencesInputSchema, {
        events: ["ORDER_CREATED"],
        extra: true,
      }).success,
    ).toBe(false);
  });
});

describe("PushJobPayloadSchema", () => {
  test("accepts a minimal envelope", () => {
    const result = v.safeParse(PushJobPayloadSchema, {
      tenantId: "tenant-1",
      event: "ORDER_CREATED",
    });

    expect(result.success).toBe(true);
  });

  test("accepts an envelope with targets and payload", () => {
    const result = v.safeParse(PushJobPayloadSchema, {
      tenantId: "tenant-1",
      event: "ORDER_READY",
      targetMemberIds: ["member-1"],
      payload: { title: "Pedido Pronto", body: "Pedido #1 pronto" },
    });

    expect(result.success).toBe(true);
  });

  test("rejects a missing tenantId, bad event, and unknown keys", () => {
    expect(v.safeParse(PushJobPayloadSchema, { event: "ORDER_CREATED" }).success).toBe(false);
    expect(v.safeParse(PushJobPayloadSchema, { tenantId: "t", event: "NOPE" }).success).toBe(false);
    expect(
      v.safeParse(PushJobPayloadSchema, { tenantId: "t", event: "ORDER_CREATED", nope: 1 }).success,
    ).toBe(false);
  });
});

describe("Output schemas", () => {
  test("GetPublicKeyOutputSchema accepts valid public key and rejects empty", () => {
    expect(v.safeParse(GetPublicKeyOutputSchema, { publicKey: "BMx...test" }).success).toBe(true);
    expect(v.safeParse(GetPublicKeyOutputSchema, { publicKey: "" }).success).toBe(false);
    expect(v.safeParse(GetPublicKeyOutputSchema, {}).success).toBe(false);
  });

  test("GetPreferencesOutputSchema accepts valid events", () => {
    expect(
      v.safeParse(GetPreferencesOutputSchema, {
        events: ["ORDER_READY", "ORDER_CANCELLED"],
      }).success,
    ).toBe(true);
  });

  test("PushSuccessOutputSchema / PushSubscriptionOutputSchema validate success boolean", () => {
    expect(v.safeParse(PushSuccessOutputSchema, { success: true }).success).toBe(true);
    expect(v.safeParse(PushSubscriptionOutputSchema, { success: false }).success).toBe(true);
    expect(v.safeParse(PushSuccessOutputSchema, { success: "yes" }).success).toBe(false);
  });
});
