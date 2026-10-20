"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import { useMutation } from "@tanstack/react-query";
import { tenantContractObject } from "@menuza/shared/tenant";
import { SaveStoreSeoSettingsInputSchema } from "@menuza/shared/tenant";
import type { PanelStoreSeo, StoreSeoSettings } from "@menuza/shared/tenant";
import { applySeoTokens } from "@menuza/shared/seo";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { fieldErrors } from "../../../signup/_components/form-errors.ts";

type ContractClient = RouterContractClient<typeof tenantContractObject>;

function client() {
  return createORPCClient<ContractClient>(new RPCLink({ url: "/tenant/rpc" }));
}

const GENERIC_ERROR = "Não foi possível salvar o SEO da loja. Tente novamente.";

const seoSchema: any = SaveStoreSeoSettingsInputSchema;

function serverMessage(error: Error): string {
  if (error instanceof ORPCError) {
    if (error.code === "FORBIDDEN") return "Você não tem permissão para editar o SEO desta loja.";

    if (error.code === "NOT_FOUND") return "Loja não encontrada.";

    if (error.code === "BAD_REQUEST" || error.code === "VALIDATION_FAILED")
      return "Revise os campos destacados e tente novamente.";
  }

  return GENERIC_ERROR;
}

/**
 * Store-level SEO defaults (MEN-253): the two templates every page without its
 * own override inherits, plus the social image.
 *
 * The preview goes through the same `applySeoTokens` the API resolves with, so
 * an admin sees exactly what `%store%` produces before saving. `%entity%` is
 * previewed with the store's name too — there is no one entity here.
 */
export function SeoSettingsForm({
  storeSlug,
  storeName,
  initialData,
}: {
  storeSlug: string;
  storeName: string;
  initialData: PanelStoreSeo;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: async (values: StoreSeoSettings) =>
      client().panel.saveStoreSeo({ storeSlug, ...values }),
    onSuccess: () => setSaved(true),
    onError: (error) => setServerError(serverMessage(error)),
  });

  const form = useForm({
    defaultValues: {
      storeSlug,
      seoTitleTemplate: initialData.settings.seoTitleTemplate,
      seoDescriptionTemplate: initialData.settings.seoDescriptionTemplate,
      seoSocialImageUrl: initialData.settings.seoSocialImageUrl,
    },
    validators: {
      onSubmit: seoSchema,
      onBlur: seoSchema,
    },
    onSubmit: async ({ value }) => {
      setServerError(null);
      setSaved(false);
      await mutation.mutateAsync(value);
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invalid = (field: any) =>
    (field.state.meta.isTouched || form.state.isSubmitted) && !field.state.meta.isValid;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const describedBy = (field: any, name: string) => (invalid(field) ? `${name}-error` : undefined);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const error = (field: any, name: string) =>
    invalid(field) ? (
      <FieldError id={`${name}-error`} errors={fieldErrors(field.state.meta.errors)} />
    ) : null;

  const context = { storeName, entityName: storeName };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const formEl = event.currentTarget;

        void form
          .handleSubmit()
          .catch(() => undefined)
          .then(() => {
            requestAnimationFrame(() => {
              formEl.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
            });
          });
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>SEO padrão</CardTitle>
          <CardDescription>
            Todo produto, kit, categoria, departamento, tag ou cupom sem SEO próprio usa estes
            modelos. Use %store%, %entity% e %city%. Vazio = o nome do item.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-4">
            <form.Field name="seoTitleTemplate">
              {(field: any) => (
                <Field data-invalid={invalid(field)}>
                  <FieldLabel htmlFor={field.name}>Modelo do título</FieldLabel>
                  <Input
                    id={field.name}
                    value={field.state.value ?? ""}
                    placeholder="%entity% | %store%"
                    maxLength={120}
                    aria-invalid={invalid(field)}
                    aria-describedby={describedBy(field, field.name)}
                    onChange={(event) => field.handleChange(event.target.value || null)}
                    onBlur={field.handleBlur}
                  />
                  <FieldDescription>
                    Prévia: {applySeoTokens(field.state.value || "%entity%", context)}
                  </FieldDescription>
                  {error(field, field.name)}
                </Field>
              )}
            </form.Field>

            <form.Field name="seoDescriptionTemplate">
              {(field: any) => (
                <Field data-invalid={invalid(field)}>
                  <FieldLabel htmlFor={field.name}>Modelo da descrição</FieldLabel>
                  <Input
                    id={field.name}
                    value={field.state.value ?? ""}
                    placeholder="%entity% com entrega em %city% — %store%"
                    maxLength={200}
                    aria-invalid={invalid(field)}
                    aria-describedby={describedBy(field, field.name)}
                    onChange={(event) => field.handleChange(event.target.value || null)}
                    onBlur={field.handleBlur}
                  />
                  <FieldDescription>
                    Prévia:{" "}
                    {field.state.value
                      ? applySeoTokens(field.state.value, context)
                      : "sem descrição herdada"}
                  </FieldDescription>
                  {error(field, field.name)}
                </Field>
              )}
            </form.Field>

            <form.Field name="seoSocialImageUrl">
              {(field: any) => (
                <Field data-invalid={invalid(field)}>
                  <FieldLabel htmlFor={field.name}>Imagem para redes sociais</FieldLabel>
                  <Input
                    id={field.name}
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    value={field.state.value ?? ""}
                    placeholder="https://sualoja.com.br/imagem.jpg"
                    aria-invalid={invalid(field)}
                    aria-describedby={describedBy(field, field.name)}
                    onChange={(event) => field.handleChange(event.target.value || null)}
                    onBlur={field.handleBlur}
                  />
                  <FieldDescription>
                    Opcional. Usada quando a página não tem imagem própria.
                  </FieldDescription>
                  {error(field, field.name)}
                </Field>
              )}
            </form.Field>
          </FieldGroup>
        </CardContent>
      </Card>

      {serverError ? (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível salvar o SEO da loja</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      {saved ? (
        <p role="status" className="text-sm text-muted-foreground">
          SEO da loja salvo.
        </p>
      ) : null}

      <div className="flex justify-end">
        <form.Subscribe selector={(state: any) => state.isSubmitting}>
          {(isSubmitting: boolean) => (
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {isSubmitting || mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              Salvar SEO
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
