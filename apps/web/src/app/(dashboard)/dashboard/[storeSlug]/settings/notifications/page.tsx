import { PushNotificationsCard } from "@/components/push-notifications-card.tsx";
import { SettingsSection } from "../_components/settings-section.tsx";
import { requireStore } from "../_components/require-store.ts";

export default async function NotificationsSettingsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const store = await requireStore(storeSlug);

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
