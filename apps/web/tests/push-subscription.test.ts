import { describe, expect, mock, test } from "bun:test";
import type { PushEvent } from "@menuza/shared/push";
import {
  type NotificationLike,
  type PushApi,
  type PushDependencies,
  type PushManagerLike,
  type PushSubscriptionLike,
  type ServiceWorkerContainerLike,
  disablePush,
  enablePush,
  isPushSupported,
  urlBase64ToUint8Array,
} from "../src/lib/push-subscription.ts";

const VAPID_KEY = "SGVsbG8"; // base64url for "Hello"

const HELLO_BYTES = [72, 101, 108, 108, 111];

function fakeApi(overrides: Partial<PushApi> = {}): PushApi {
  return {
    registerSubscription: async () => {},
    unregisterSubscription: async () => {},
    getPushPreferences: async () => [],
    setPushPreferences: async (_events: PushEvent[]) => {},
    getVapidPublicKey: async () => VAPID_KEY,
    ...overrides,
  };
}

function fakeSubscription(
  endpoint = "https://fcm.googleapis.com/fcm/send/abc",
): PushSubscriptionLike {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: "p256dh", auth: "auth" } }),
    unsubscribe: async () => true,
  };
}

function fakePushManager(subscription: PushSubscriptionLike | null): PushManagerLike {
  return {
    subscribe: async () => subscription ?? fakeSubscription(),
    getSubscription: async () => subscription,
  };
}

function fakeNotification(
  permission: NotificationPermission,
  requestResult: NotificationPermission = "granted",
): NotificationLike {
  return { permission, requestPermission: async () => requestResult };
}

function baseDeps(overrides: Partial<PushDependencies> = {}): PushDependencies {
  return {
    isSecureContext: true,
    serviceWorkerContainer: { register: async () => ({ pushManager: fakePushManager(null) }) },
    notification: fakeNotification("granted"),
    ...overrides,
  };
}

describe("urlBase64ToUint8Array", () => {
  test("decodes base64url into bytes", () => {
    expect(Array.from(urlBase64ToUint8Array(VAPID_KEY))).toEqual(HELLO_BYTES);
  });

  test("accepts padded and unpadded input", () => {
    expect(Array.from(urlBase64ToUint8Array("SGVsbG8="))).toEqual(HELLO_BYTES);
  });

  test("rejects characters outside the base64url alphabet", () => {
    expect(() => urlBase64ToUint8Array("not base64!!")).toThrow();
    expect(() => urlBase64ToUint8Array("")).toThrow();
  });
});

describe("isPushSupported", () => {
  test("is false without a secure context", () => {
    expect(isPushSupported({ isSecureContext: false })).toBe(false);
  });

  test("is false without a service worker container", () => {
    expect(
      isPushSupported({ isSecureContext: true, notification: fakeNotification("granted") }),
    ).toBe(false);
  });

  test("is false without the Notification API", () => {
    expect(
      isPushSupported({
        isSecureContext: true,
        serviceWorkerContainer: { register: async () => ({ pushManager: fakePushManager(null) }) },
      }),
    ).toBe(false);
  });

  test("is true when all capabilities are present", () => {
    expect(isPushSupported(baseDeps())).toBe(true);
  });
});

describe("enablePush", () => {
  test("returns unsupported when the browser cannot push", async () => {
    const api = fakeApi();
    const registerSubscription = mock(api.registerSubscription);

    const result = await enablePush({
      isSecureContext: false,
      api: { ...api, registerSubscription },
    });

    expect(result).toEqual({ ok: false, reason: "unsupported" });
    expect(registerSubscription).toHaveBeenCalledTimes(0);
  });

  test("returns denied without prompting when permission is already denied", async () => {
    const api = fakeApi();
    const registerSubscription = mock(api.registerSubscription);

    const result = await enablePush(
      baseDeps({
        notification: fakeNotification("denied"),
        pushManager: fakePushManager(fakeSubscription()),
        api: { ...api, registerSubscription },
      }),
    );

    expect(result).toEqual({ ok: false, reason: "denied" });
    expect(registerSubscription).toHaveBeenCalledTimes(0);
  });

  test("returns denied when the permission prompt is dismissed", async () => {
    const result = await enablePush(
      baseDeps({
        notification: fakeNotification("default", "default"),
        pushManager: fakePushManager(fakeSubscription()),
        api: fakeApi(),
      }),
    );

    expect(result).toEqual({ ok: false, reason: "denied" });
  });

  test("rolls back the browser subscription when server registration fails", async () => {
    const unsubscribe = mock(async () => true);

    const result = await enablePush(
      baseDeps({
        pushManager: fakePushManager({ ...fakeSubscription(), unsubscribe }),
        api: fakeApi({
          registerSubscription: async () => {
            throw new Error("registro indisponível");
          },
        }),
      }),
    );

    expect(result).toEqual({ ok: false, reason: "registro indisponível" });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test("subscribes with the generated server key on success", async () => {
    let requestedKey: Uint8Array | undefined;
    const registered = mock(async (_subscription: PushSubscriptionJSON) => {});

    const manager: PushManagerLike = {
      getSubscription: async () => null,
      subscribe: async (options) => {
        // SAFETY: the module always passes a Uint8Array built by urlBase64ToUint8Array.
        requestedKey = options.applicationServerKey as Uint8Array | undefined;

        return fakeSubscription();
      },
    };

    const result = await enablePush(
      baseDeps({
        pushManager: manager,
        api: fakeApi({ registerSubscription: registered }),
      }),
    );

    expect(result).toEqual({ ok: true });
    expect(registered).toHaveBeenCalledTimes(1);
    expect(Array.from(requestedKey ?? new Uint8Array())).toEqual(HELLO_BYTES);
  });
});

describe("disablePush", () => {
  test("unregisters on the server before unsubscribing in the browser", async () => {
    const calls: string[] = [];

    const unsubscribe = mock(async () => {
      calls.push("browser");

      return true;
    });

    const unregisterSubscription = mock(async (_endpoint: string) => {
      calls.push("server");
    });

    await disablePush(
      baseDeps({
        pushManager: fakePushManager({ ...fakeSubscription(), unsubscribe }),
        api: fakeApi({ unregisterSubscription }),
      }),
    );

    expect(calls).toEqual(["server", "browser"]);
    expect(unregisterSubscription).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test("keeps the browser subscription when the server call fails", async () => {
    const unsubscribe = mock(async () => true);

    await expect(
      disablePush(
        baseDeps({
          pushManager: fakePushManager({ ...fakeSubscription(), unsubscribe }),
          api: fakeApi({
            unregisterSubscription: async (_endpoint: string) => {
              throw new Error("falha no servidor");
            },
          }),
        }),
      ),
    ).rejects.toThrow("falha no servidor");

    expect(unsubscribe).toHaveBeenCalledTimes(0);
  });
});

describe("resolvePushManager via service worker registration", () => {
  test("registers the existing service worker when no push manager is injected", async () => {
    const register = mock(async (_scriptURL: string) => ({ pushManager: fakePushManager(null) }));
    const container: ServiceWorkerContainerLike = { register };

    await disablePush(baseDeps({ serviceWorkerContainer: container, api: fakeApi() }));

    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0]?.[0]).toBe("/serwist/sw.js");
  });
});
