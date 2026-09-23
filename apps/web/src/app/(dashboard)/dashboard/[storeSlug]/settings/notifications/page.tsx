import { notFound } from "next/navigation";
import { PushNotificationsCard } from "@/components/push-notifications-card.tsx";
import { getStore } from "@/lib/mock-dashboard-data.ts";
import { SettingsSection } from "../_components/settings-section.tsx";

export default async function NotificationsSettingsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const store = getStore(storeSlug);

  if (!store) notFound();

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
