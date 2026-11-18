import type { PanelOrder } from "@menuza/api-client/model";
import { formatBrl } from "@menuza/shared/money";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import Storage from "expo-sqlite/kv-store";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import { newOrderFeedback } from "./feedback.ts";

const NOTIFIED_KEY = "menuza.dashboard.notified-orders";

const CHANNEL = "orders";

const MAX_REMEMBERED = 200;

/** Newline-joined order codes, so the stored value needs no JSON parse. */
async function readNotified(): Promise<Set<string>> {
  const raw = await Storage.getItem(NOTIFIED_KEY);

  if (!raw) return new Set();

  return new Set(raw.split("\n").filter(Boolean));
}

async function writeNotified(codes: Set<string>): Promise<void> {
  await Storage.setItem(NOTIFIED_KEY, [...codes].slice(-MAX_REMEMBERED).join("\n"));
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Local notification for a new order.
 *
 * Remote push needs a development build on Android (Expo Go dropped it in SDK
 * 53) and a backend producer; until those land this is the guaranteed path: the
 * poll finds the order, the notification survives the app being backgrounded.
 */
export async function notifyNewOrder(order: PanelOrder): Promise<void> {
  newOrderFeedback();

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Novo pedido ${order.code}`,
        body: `${order.customerName} · ${formatBrl(order.totalCents)}`,
        data: { orderCode: order.code },
        sound: false,
      },
      trigger: null,
    });
  } catch {
    // Expo Go has no native scheduler; the in-app tone still fired.
  }
}

/** Ask once, from the settings screen or the first board load. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: "Pedidos",
        importance: Notifications.AndroidImportance.HIGH,
        enableVibrate: true,
        vibrationPattern: [0, 250, 250, 250],
        sound: null,
      });
    } catch {
      // Expo Go rejects the channel manager; local notifications stay best-effort.
    }
  }

  try {
    const current = await Notifications.getPermissionsAsync();

    if (current.granted) return true;

    const asked = await Notifications.requestPermissionsAsync();

    return asked.granted;
  } catch {
    return false;
  }
}

/**
 * Announce orders that appeared after the board's first snapshot.
 *
 * The first successful fetch seeds the list: an operator opening the app in the
 * morning does not get one notification per order already on the board.
 */
export function useOrderNotifications(orders: readonly PanelOrder[] | undefined) {
  const seeded = useRef(false);

  useEffect(() => {
    if (!orders) return;

    if (!seeded.current) {
      seeded.current = true;

      void (async () => {
        const known = await readNotified();

        for (const order of orders) {
          if (order.fulfilmentStatus === "pending") known.add(order.code);
        }

        await writeNotified(known);
      })();

      return;
    }

    void (async () => {
      const known = await readNotified();

      const fresh = orders.filter(
        (order) => order.fulfilmentStatus === "pending" && !known.has(order.code),
      );

      if (fresh.length === 0) return;

      for (const order of fresh) {
        known.add(order.code);
        await notifyNewOrder(order);
      }

      await writeNotified(known);
    })();
  }, [orders]);
}

/** Tapping a notification opens the order it names. */
export function useNotificationRouting(): void {
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const code = String(response.notification.request.content.data?.orderCode ?? "");

      if (code) router.push(`/order/${code}`);
    });

    return () => subscription.remove();
  }, []);
}
