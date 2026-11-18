import { Redirect } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import { useEffect } from "react";

import { Loading } from "@/components/screen.tsx";
import { AlertProvider } from "@/lib/alert.tsx";
import { ensureNotificationPermission, useOrderNotifications } from "@/lib/notifications.ts";
import { useOrders } from "@/lib/orders.ts";
import { useSession } from "@/lib/session.tsx";

/**
 * The dashboard's four surfaces, mirroring the web sidebar: Início, Pedidos,
 * Catálogo and Mais.
 *
 * The orders board used to own four of the five tabs — Novos, Preparo, Prontos
 * and Histórico are filters over one query, not four places. They are now
 * segments inside the Pedidos tab, which frees the bar for the sections an
 * operator actually moves between.
 */
export default function TabsLayout() {
  const { status, storeSlug } = useSession();
  const orders = useOrders(storeSlug);

  useOrderNotifications(orders.data);

  useEffect(() => {
    void ensureNotificationPermission();
  }, []);

  // A pending session is not an anonymous one: redirecting here would bounce the
  // router on every boot, because `/` resolves to this same group once the
  // cookie lands. `management/_layout.tsx` waits the same way.
  if (status === "loading") return <Loading />;

  if (status !== "authenticated" || !storeSlug) return <Redirect href="/" />;

  const pending = (orders.data ?? []).filter(
    (order) => order.fulfilmentStatus === "pending",
  ).length;

  return (
    <AlertProvider pendingCount={pending}>
      <NativeTabs>
        <NativeTabs.Trigger name="inicio">
          <NativeTabs.Trigger.Icon sf="house" md="home" />
          <NativeTabs.Trigger.Label>Início</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="pedidos">
          <NativeTabs.Trigger.Icon sf="tray.full" md="receipt_long" />
          <NativeTabs.Trigger.Label>Pedidos</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Badge>
            {pending > 0 ? String(pending) : undefined}
          </NativeTabs.Trigger.Badge>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="catalogo">
          <NativeTabs.Trigger.Icon sf="square.grid.2x2" md="grid_view" />
          <NativeTabs.Trigger.Label>Catálogo</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="gestao">
          <NativeTabs.Trigger.Icon sf="ellipsis.circle" md="more_horiz" />
          <NativeTabs.Trigger.Label>Mais</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </AlertProvider>
  );
}
