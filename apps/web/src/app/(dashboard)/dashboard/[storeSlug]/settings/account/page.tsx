import { notFound } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { panelClient } from "@/lib/server-tenant.ts";
import { SettingsSection } from "../_components/settings-section.tsx";
import { ChangePasswordForm } from "./change-password-form.tsx";
import { SessionsList } from "./sessions-list.tsx";

/**
 * Account settings. Member-level, not store-level: the procedures it calls take
 * no `storeSlug` because a management account spans stores. It lives under the
 * store shell's settings so it is reachable from the sidebar, which is
 * store-scoped — the shell is the navigation, not the authorization.
 */
export default async function AccountSettingsPage() {
  const client = await panelClient();

  if (!client) notFound();

  const { sessions } = await client.account.listSessions();

  return (
    <SettingsSection
      headingId="settings-account-heading"
      title="Conta"
      description="Sua senha e as sessões abertas nesta conta."
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
