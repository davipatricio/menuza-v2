"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import { useMutation } from "@tanstack/react-query";
import { tenantContractObject } from "@menuza/shared/tenant";
import { SaveSeoInputSchema } from "@menuza/shared/tenant";
import type { PanelSeo, SeoEntityType, SeoFields, SeoSource } from "@menuza/shared/tenant";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
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
import { Textarea } from "@/components/ui/textarea.tsx";
import { fieldErrors } from "../../signup/_components/form-errors.ts";
import { useDirtySection } from "../catalog/products/product-editor-guard.tsx";

type ContractClient = RouterContractClient<typeof tenantContractObject>;

function client() {
  return createORPCClient<ContractClient>(new RPCLink({ url: "/tenant/rpc" }));
}

const GENERIC_SAVE_ERROR = "Não foi possível salvar o SEO. Tente novamente.";

const GENERIC_REVERT_ERROR = "Não foi possível reverter o SEO. Tente novamente.";

/**
 * The contract schema drives both validators. Its input type is wider than what
 * `defaultValues` infers, so it is widened once here instead of casting each
 * `validators` entry — the same reason the coupon form does it.
 */
const seoSchema: any = SaveSeoInputSchema;

const SEO_FIELDS = ["title", "description", "canonicalUrl", "socialImageUrl", "jsonLd"] as const;

/** The five editable fields plus the addressing the form carries along. */
type SeoFormValues = SeoFields & {
  storeSlug: string;
  entityType: SeoEntityType;
  entityId: string;
};

/**
 * A partial save: an omitted field keeps the stored override, while `null` makes
 * the field inherit again. Only what the user touched travels.
 */
function seoPatch(baseline: SeoFields, values: SeoFields): Partial<SeoFields> {
  const patch: Partial<SeoFields> = {};

  for (const field of SEO_FIELDS) {
    if (values[field] !== baseline[field]) patch[field] = values[field];
  }

  return patch;
}

/**
 * The product form also renders a `description` field, and both forms stay
 * mounted in the tabs, so every DOM id here carries the `seo-` prefix.
 */
function domId(name: string) {
  return `seo-${name}`;
}

const SOURCE_LABELS: Record<SeoSource, string> = {
  entity: "Definido nesta entidade",
  store: "Herdado da loja",
  default: "Padrão",
};

function serverMessage(error: Error, fallback: string): string {
  if (error instanceof ORPCError) {
    if (error.code === "FORBIDDEN") return "Você não tem permissão para editar o SEO nesta loja.";

    if (error.code === "NOT_FOUND") return "Entidade não encontrada nesta loja.";

    if (error.code === "BAD_REQUEST" || error.code === "VALIDATION_FAILED")
      return "Revise os campos destacados e tente novamente.";

    return fallback;
  }

  return error.message || fallback;
}

/**
 * The SEO tab of the product editor. It is also the seam for any future entity
 * editor: the server page hands over the already-loaded picture, so nothing is
 * fetched in the browser until a save. Every mutation returns the freshly
 * resolved SEO and that response replaces the local copy: it is what re-labels a
 * field as "Herdado da loja" or "Padrão" after a revert, with no reload.
 */
export function SeoForm({
  storeSlug,
  entityType,
  entityId,
  entityName,
  initialData,
}: {
  storeSlug: string;
  entityType: SeoEntityType;
  entityId: string;
  entityName: string;
  initialData: PanelSeo;
}) {
  const [data, setData] = useState(initialData);
  const [serverError, setServerError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmingRevert, setConfirmingRevert] = useState(false);

  const { saved: loaded, resolved } = data;

  const saveMutation = useMutation({
    mutationFn: async (values: SeoFormValues) => {
      const patch = seoPatch(loaded, values);

      if (Object.keys(patch).length === 0) return null;

      return client().panel.saveSeo({ storeSlug, entityType, entityId, ...patch });
    },
    onSuccess: (result) => {
      if (!result) {
        setStatus("Nenhuma alteração para salvar.");

        return;
      }

      setData(result);
      setStatus("SEO salvo.");
    },
    onError: (error) => {
      setStatus(null);
      setServerError(serverMessage(error, GENERIC_SAVE_ERROR));
    },
  });

  const revertFieldMutation = useMutation({
    mutationFn: async (field: keyof SeoFields) =>
      client().panel.saveSeo({ storeSlug, entityType, entityId, [field]: null }),
    onSuccess: (result) => {
      setData(result);
      setServerError(null);
    },
    onError: (error) => setServerError(serverMessage(error, GENERIC_REVERT_ERROR)),
  });

  const revertAllMutation = useMutation({
    mutationFn: async () => client().panel.revertSeo({ storeSlug, entityType, entityId }),
    onSuccess: (result) => {
      setData(result);
      form.reset({
        storeSlug,
        entityType,
        entityId,
        title: null,
        description: null,
        canonicalUrl: null,
        socialImageUrl: null,
        jsonLd: null,
      });
      setServerError(null);
      setStatus(null);
      setConfirmingRevert(false);
    },
    onError: (error) => {
      setServerError(serverMessage(error, GENERIC_REVERT_ERROR));
      setConfirmingRevert(false);
    },
  });

  const form = useForm({
    defaultValues: {
      storeSlug,
      entityType,
      entityId,
      title: loaded.title,
      description: loaded.description,
      canonicalUrl: loaded.canonicalUrl,
      socialImageUrl: loaded.socialImageUrl,
      jsonLd: loaded.jsonLd,
    },
    validators: {
      onSubmit: seoSchema,
      onBlur: seoSchema,
    },
    onSubmit: async ({ value }) => {
      setServerError(null);
      setStatus(null);
      await saveMutation.mutateAsync(value);
    },
  });

  const formValues = useStore(form.store, (state: any) => state.values);
  const dirty = Object.keys(seoPatch(loaded, formValues)).length > 0;

  useDirtySection("seo", dirty);

  // An error shows once the field was touched or the form was submitted, so a
  // submit never fails silently on a field the user never visited.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invalid = (field: any) =>
    (field.state.meta.isTouched || form.state.isSubmitted) && !field.state.meta.isValid;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const describedBy = (field: any, name: string) =>
    invalid(field) ? `${domId(name)}-error` : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const error = (field: any, name: string) =>
    invalid(field) ? (
      <FieldError id={`${domId(name)}-error`} errors={fieldErrors(field.state.meta.errors)} />
    ) : null;

  const revertButton = (name: keyof SeoFields) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={loaded[name] === null || revertFieldMutation.isPending}
      onClick={() => {
        form.setFieldValue(name, null);
        revertFieldMutation.mutate(name);
      }}
    >
      {revertFieldMutation.isPending && revertFieldMutation.variables === name ? (
        <Spinner data-icon="inline-start" />
      ) : null}
      Reverter
    </Button>
  );

  /** "Herdado da loja" / "Padrão" only while the field has no override of its own. */
  const sourceNote = (name: keyof SeoFields, source: SeoSource) =>
    loaded[name] === null ? SOURCE_LABELS[source] : "Definido aqui";

  return (
    <form
      className="flex w-full max-w-3xl flex-col gap-6"
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
          <CardTitle>{entityName}</CardTitle>
          <CardDescription>
            O que ficar vazio herda a loja e, depois, o padrão. URL canônica e JSON-LD valem só
            nesta entidade.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-5">
            <form.Field name="title">
              {(field: any) => (
                <Field data-invalid={invalid(field)}>
                  <div className="flex items-start justify-between gap-2">
                    <FieldLabel htmlFor={domId(field.name)}>Título</FieldLabel>
                    {revertButton("title")}
                  </div>
                  <Input
                    id={domId(field.name)}
                    value={field.state.value ?? ""}
                    placeholder={resolved.title}
                    maxLength={70}
                    aria-invalid={invalid(field)}
                    aria-describedby={describedBy(field, field.name)}
                    onChange={(event) => field.handleChange(event.target.value || null)}
                    onBlur={field.handleBlur}
                  />
                  <FieldDescription>
                    {sourceNote("title", resolved.source.title)} ·{" "}
                    {(field.state.value ?? "").length}/70 caracteres
                  </FieldDescription>
                  {error(field, field.name)}
                </Field>
              )}
            </form.Field>

            <form.Field name="description">
              {(field: any) => (
                <Field data-invalid={invalid(field)}>
                  <div className="flex items-start justify-between gap-2">
                    <FieldLabel htmlFor={domId(field.name)}>Descrição</FieldLabel>
                    {revertButton("description")}
                  </div>
                  <Textarea
                    id={domId(field.name)}
                    rows={3}
                    value={field.state.value ?? ""}
                    placeholder={resolved.description ?? "Sem descrição herdada."}
                    maxLength={200}
                    aria-invalid={invalid(field)}
                    aria-describedby={describedBy(field, field.name)}
                    onChange={(event) => field.handleChange(event.target.value || null)}
                    onBlur={field.handleBlur}
                  />
                  <FieldDescription>
                    {sourceNote("description", resolved.source.description)} ·{" "}
                    {(field.state.value ?? "").length}/200 caracteres
                  </FieldDescription>
                  {error(field, field.name)}
                </Field>
              )}
            </form.Field>

            <form.Field name="canonicalUrl">
              {(field: any) => (
                <Field data-invalid={invalid(field)}>
                  <div className="flex items-start justify-between gap-2">
                    <FieldLabel htmlFor={domId(field.name)}>URL canônica</FieldLabel>
                    {revertButton("canonicalUrl")}
                  </div>
                  <Input
                    id={domId(field.name)}
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    value={field.state.value ?? ""}
                    placeholder="https://sualoja.com.br/caminho"
                    aria-invalid={invalid(field)}
                    aria-describedby={describedBy(field, field.name)}
                    onChange={(event) => field.handleChange(event.target.value || null)}
                    onBlur={field.handleBlur}
                  />
                  <FieldDescription>
                    Opcional, sempre desta entidade: uma URL canônica herdada apontaria para outra
                    página.
                  </FieldDescription>
                  {error(field, field.name)}
                </Field>
              )}
            </form.Field>

            <form.Field name="socialImageUrl">
              {(field: any) => (
                <Field data-invalid={invalid(field)}>
                  <div className="flex items-start justify-between gap-2">
                    <FieldLabel htmlFor={domId(field.name)}>Imagem para redes sociais</FieldLabel>
                    {revertButton("socialImageUrl")}
                  </div>
                  <Input
                    id={domId(field.name)}
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    value={field.state.value ?? ""}
                    placeholder={resolved.socialImageUrl ?? "https://sualoja.com.br/imagem.jpg"}
                    aria-invalid={invalid(field)}
                    aria-describedby={describedBy(field, field.name)}
                    onChange={(event) => field.handleChange(event.target.value || null)}
                    onBlur={field.handleBlur}
                  />
                  <FieldDescription>
                    {sourceNote("socialImageUrl", resolved.source.socialImageUrl)}
                  </FieldDescription>
                  {error(field, field.name)}
                </Field>
              )}
            </form.Field>

            <form.Field name="jsonLd">
              {(field: any) => (
                <Field data-invalid={invalid(field)}>
                  <div className="flex items-start justify-between gap-2">
                    <FieldLabel htmlFor={domId(field.name)}>JSON-LD</FieldLabel>
                    {revertButton("jsonLd")}
                  </div>
                  <Textarea
                    id={domId(field.name)}
                    rows={8}
                    className="font-mono text-xs"
                    value={field.state.value ?? ""}
                    placeholder='{ "@context": "https://schema.org", "@type": "Product" }'
                    spellCheck={false}
                    aria-invalid={invalid(field)}
                    aria-describedby={describedBy(field, field.name)}
                    onChange={(event) => field.handleChange(event.target.value || null)}
                    onBlur={field.handleBlur}
                  />
                  <FieldDescription>
                    Opcional, sempre desta entidade. O JSON é validado no servidor ao salvar; aqui o
                    texto não é interpretado.
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
          <AlertTitle>Não foi possível salvar o SEO</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      {status ? (
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={revertAllMutation.isPending}
          onClick={() => setConfirmingRevert(true)}
        >
          Reverter tudo
        </Button>
        <form.Subscribe selector={(state: any) => state.isSubmitting}>
          {(isSubmitting: boolean) => (
            <Button type="submit" disabled={isSubmitting || saveMutation.isPending}>
              {isSubmitting || saveMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              Salvar SEO
            </Button>
          )}
        </form.Subscribe>
      </div>

      <AlertDialog open={confirmingRevert} onOpenChange={setConfirmingRevert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Reverter o SEO de "${entityName}"?`}</AlertDialogTitle>
            <AlertDialogDescription>
              O override desta entidade é descartado e todos os campos voltam a herdar a loja. Esta
              ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={revertAllMutation.isPending}
              onClick={() => revertAllMutation.mutate()}
            >
              {revertAllMutation.isPending ? "Revertendo…" : "Reverter tudo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
