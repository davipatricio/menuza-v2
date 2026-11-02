import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { PushNotificationsCard } from "@/components/push-notifications-card.tsx";
import { SettingsSection } from "@/features/settings/components/settings-section.tsx";
import { pageTitle } from "@/lib/seo/title.ts";

const settingsRoute = getRouteApi("/dashboard/$storeSlug/settings");

export const Route = createFileRoute("/dashboard/$storeSlug/settings/notifications/")({
  head: () => ({ meta: [{ title: pageTitle("Notificações") }] }),
  component: NotificationsSettingsPage,
});

function NotificationsSettingsPage() {
  const { store } = settingsRoute.useLoaderData();

  return (
    <SettingsSection
      headingId="settings-notifications-heading"
      title="Notificações"
      description={`Avisos de pedidos de ${store.displayName} neste navegador.`}
    >
      <PushNotificationsCard />
    </SettingsSection>
  );
}
