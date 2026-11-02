import { createFileRoute, getRouteApi, redirect } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { ChangePasswordForm } from "@/features/settings/components/change-password-form.tsx";
import { SessionsList } from "@/features/settings/components/sessions-list.tsx";
import { SettingsSection } from "@/features/settings/components/settings-section.tsx";
import { loadSessionsFn } from "@/features/settings/server/account.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

const settingsRoute = getRouteApi("/dashboard/$storeSlug/settings");

/**
 * The account route lives under the store shell for navigation, not for
 * authorization: the procedures it calls take no `storeSlug`, because a
 * management account spans stores.
 */
export const Route = createFileRoute("/dashboard/$storeSlug/settings/account/")({
  loader: async () => {
    const result = await loadSessionsFn();

    if (result.status === "unauthenticated") throw redirect({ href: "/dashboard/login" });

    return { sessions: result.sessions };
  },
  head: () => ({ meta: [{ title: pageTitle("Conta") }] }),
  component: AccountSettingsPage,
});

function AccountSettingsPage() {
  const { store } = settingsRoute.useLoaderData();
  const { sessions } = Route.useLoaderData();

  return (
    <SettingsSection
      headingId="settings-account-heading"
      title="Conta"
      description={`Sua senha e as sessões abertas nesta conta${store.displayName ? ` de ${store.displayName}` : ""}.`}
    >
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Trocar senha</CardTitle>
            <CardDescription>
              Trocar a senha encerra as outras sessões desta conta. Esta sessão continua valendo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sessões ativas</CardTitle>
            <CardDescription>
              Cada linha é um dispositivo com uma sessão aberta. Encerre as que você não reconhece.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SessionsList sessions={sessions} />
          </CardContent>
        </Card>
      </div>
    </SettingsSection>
  );
}
