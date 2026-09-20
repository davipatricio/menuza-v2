/* eslint-disable anti-slop/no-chained-type-assertions */
import { describe, expect, mock, test } from "bun:test";
import webPush from "web-push";
import { isAllowedPushEndpoint } from "@menuza/shared/push";
import { loadVapidFromEnv, sendPushNotification } from "./push-sender.ts";

describe("push-sender", () => {
  test("loadVapidFromEnv returns null when env is missing", () => {
    const oldSubject = process.env.VAPID_SUBJECT;
    delete process.env.VAPID_SUBJECT;

    try {
      expect(loadVapidFromEnv()).toBeNull();
    } finally {
      if (oldSubject) process.env.VAPID_SUBJECT = oldSubject;
    }
  });

  test("isAllowedPushEndpoint accepts documented provider hosts and subdomains", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(
      true,
    );
    expect(isAllowedPushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QGVsbG8")).toBe(true);
  });

  test("isAllowedPushEndpoint rejects lookalike, local, and malformed endpoints", () => {
    expect(isAllowedPushEndpoint("https://evil-fcm.googleapis.com.attacker.tld/fcm/send")).toBe(
      false,
    );
    expect(
      isAllowedPushEndpoint("https://updates.push.services.mozilla.com.attacker.tld/wpush"),
    ).toBe(false);
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/test")).toBe(false);
    expect(isAllowedPushEndpoint("https://localhost/test")).toBe(false);
    expect(isAllowedPushEndpoint("https://127.0.0.1/test")).toBe(false);
    expect(isAllowedPushEndpoint("https://192.168.1.50/test")).toBe(false);
    expect(isAllowedPushEndpoint("https://10.0.0.1/test")).toBe(false);
    expect(isAllowedPushEndpoint("https://user:pass@fcm.googleapis.com/test")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com:8443/test")).toBe(false);
    expect(isAllowedPushEndpoint("not-a-url")).toBe(false);
  });

  test("classifies 410 as expired", async () => {
    const fakeSub = {
      endpoint: "https://fcm.googleapis.com/fcm/send/expired-sub",
      keys: {
        auth: "juarI8x__VnHvsOgfeAPHg",
        p256dh: "BL7ELU24fJTAlH5Kyl8N6BDCac8u8li...",
      },
    };

    const originalSend = webPush.sendNotification;
    const mockError = Object.assign(new Error("Subscription has expired"), { statusCode: 410 });

    // SAFETY: mocking sendNotification for unit test error status
    webPush.sendNotification = mock(() =>
      Promise.reject(mockError),
    ) as unknown as typeof webPush.sendNotification;

    try {
      const res = await sendPushNotification(fakeSub, { title: "Test", body: "Hello" });

      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(410);
      expect(res.isExpired).toBe(true);
    } finally {
      webPush.sendNotification = originalSend;
    }
  });

  test("classifies 201 as successful", async () => {
    const fakeSub = {
      endpoint: "https://fcm.googleapis.com/fcm/send/valid-sub",
      keys: {
        auth: "juarI8x__VnHvsOgfeAPHg",
        p256dh: "BL7ELU24fJTAlH5Kyl8N6BDCac8u8li...",
      },
    };

    const originalSend = webPush.sendNotification;

    // SAFETY: mocking sendNotification for unit test success response
    webPush.sendNotification = mock(() =>
      Promise.resolve({ statusCode: 201, headers: {}, body: "" }),
    ) as unknown as typeof webPush.sendNotification;

    try {
      const res = await sendPushNotification(fakeSub, { title: "Test", body: "Hello" });

      expect(res.success).toBe(true);
      expect(res.statusCode).toBe(201);
      expect(res.isExpired).toBe(false);
    } finally {
      webPush.sendNotification = originalSend;
    }
  });
});
