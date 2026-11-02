import { useState, type FormEvent } from "react";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import { useRouter } from "@tanstack/react-router";
import { tenantContractObject, type IntegrationSetting } from "@menuza/shared/tenant";
import { Button } from "@/components/ui/button.tsx";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Switch } from "@/components/ui/switch.tsx";

type ContractClient = RouterContractClient<typeof tenantContractObject>;

function client(): ContractClient {
  return createORPCClient<ContractClient>(new RPCLink({ url: "/tenant/rpc" }));
}

/**
 * The detail page's settings block, driven by the catalog's field descriptors.
 *
 * Each integration owns its own keys; this form is the one renderer, so a new
 * integration adds `settings` to its definition instead of a bespoke component.
 */
export function IntegrationSettingsForm({
  storeSlug,
  integrationId,
  settings,
  initial,
  disabled,
}: {
  storeSlug: string;
  integrationId: string;
  settings: readonly IntegrationSetting[];
  initial: Record<string, string | boolean>;
  disabled: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function set(key: string, value: string | boolean) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setPending(true);

    try {
      await client().panel.saveIntegration({ storeSlug, integrationId, config: values });

      setMessage({ ok: true, text: "Configurações salvas." });
      await router.invalidate();
    } catch {
      setMessage({ ok: false, text: "Não foi possível salvar as configurações." });
    } finally {
      setPending(false);
    }
  }

  if (settings.length === 0) return null;

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        {settings.map((setting) => {
          if (setting.type === "switch") {
            return (
              <Field key={setting.key} orientation="horizontal" className="items-start gap-3">
                <div className="flex flex-1 flex-col gap-0.5">
                  <FieldLabel htmlFor={`setting-${setting.key}`}>{setting.label}</FieldLabel>
                  {setting.description ? (
                    <FieldDescription>{setting.description}</FieldDescription>
                  ) : null}
                </div>
                <Switch
                  id={`setting-${setting.key}`}
                  checked={values[setting.key] === true}
                  disabled={disabled || pending}
                  onCheckedChange={(next) => set(setting.key, next)}
                />
              </Field>
            );
          }

          return (
            <Field key={setting.key} className="flex flex-col gap-1.5">
              <FieldLabel htmlFor={`setting-${setting.key}`}>{setting.label}</FieldLabel>
              <Input
                id={`setting-${setting.key}`}
                value={String(values[setting.key] ?? "")}
                placeholder={setting.placeholder}
                disabled={disabled || pending}
                onChange={(event) => set(setting.key, event.target.value)}
              />
              {setting.description ? (
                <FieldDescription>{setting.description}</FieldDescription>
              ) : null}
            </Field>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={disabled || pending}>
          {pending ? "Salvando…" : "Salvar configurações"}
        </Button>
        {message ? (
          <p
            role="status"
            className={message.ok ? "text-xs text-muted-foreground" : "text-xs text-destructive"}
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}
