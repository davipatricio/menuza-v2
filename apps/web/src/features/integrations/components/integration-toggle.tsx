import { useState } from "react";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import { useRouter } from "@tanstack/react-router";
import { tenantContractObject } from "@menuza/shared/tenant";
import { Switch } from "@/components/ui/switch.tsx";

type ContractClient = RouterContractClient<typeof tenantContractObject>;

function client(): ContractClient {
  return createORPCClient<ContractClient>(new RPCLink({ url: "/tenant/rpc" }));
}

/**
 * The card's switch. One panel write turns the integration on or off and the
 * route re-runs its loader, so the switch never keeps local state the server
 * would disagree with.
 */
export function IntegrationToggle({
  storeSlug,
  integrationId,
  name,
  enabled,
}: {
  storeSlug: string;
  integrationId: string;
  name: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: boolean) {
    setError(null);
    setPending(true);

    try {
      await client().panel.saveIntegration({
        storeSlug,
        integrationId,
        status: next ? "enabled" : "disabled",
      });

      await router.invalidate();
    } catch {
      setError("Não foi possível alterar a integração.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Switch
        checked={enabled}
        disabled={pending}
        onCheckedChange={(next) => void onChange(next)}
        aria-label={`${enabled ? "Desativar" : "Ativar"} ${name}`}
      />
      {error ? (
        <span role="alert" className="max-w-48 text-end text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
