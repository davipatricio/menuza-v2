"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch.tsx";
import { setIntegrationEnabled } from "../actions.ts";

/**
 * The card's switch. One server action turns the integration on or off and the
 * page re-renders from the revalidated read, so the switch never keeps local
 * state that the server would disagree with.
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(next: boolean) {
    setError(null);

    startTransition(async () => {
      const result = await setIntegrationEnabled({ storeSlug, integrationId, enabled: next });

      if (!result.ok) {
        setError(result.error ?? "Não foi possível alterar a integração.");

        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Switch
        checked={enabled}
        disabled={pending}
        onCheckedChange={onChange}
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
