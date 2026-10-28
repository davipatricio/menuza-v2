"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button.tsx";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import type { IntegrationSetting } from "@menuza/shared/tenant";
import { saveIntegrationConfig } from "../actions.ts";

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
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function set(key: string, value: string | boolean) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const result = await saveIntegrationConfig({ storeSlug, integrationId, config: values });

      setMessage({
        ok: result.ok,
        text: result.ok ? "Configurações salvas." : (result.error ?? "Falha ao salvar."),
      });

      if (result.ok) router.refresh();
    });
  }

  if (settings.length === 0) return null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        {settings.map((setting) => {
          if (setting.type === "switch") {
            const checked = values[setting.key] === true;

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
                  checked={checked}
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
