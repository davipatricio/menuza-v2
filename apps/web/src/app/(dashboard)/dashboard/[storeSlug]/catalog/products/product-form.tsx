"use client";

import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useStore } from "@tanstack/react-form";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import { useMutation } from "@tanstack/react-query";
import { Plus, Tag, Trash2, CircleHelp } from "lucide-react";
import { tenantContractObject } from "@menuza/shared/tenant";
import { CreateProductInputSchema, UpdateProductInputSchema } from "@menuza/shared/tenant";
import type { PanelProductDetail, StockMode } from "@menuza/shared/tenant";

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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { fieldErrors } from "../../../signup/_components/form-errors.ts";
import { formatBrlInput, maskIntegerInput } from "@/lib/format.ts";
import { STOCK_MODE_LABELS } from "@/lib/panel-labels.ts";
import { useDirtySection, useLeaveGuard } from "./product-editor-guard.tsx";
import { useProductWebMcp } from "./product-webmcp.ts";
import { TagCombobox } from "./tag-combobox.tsx";
import { ProductTaxonomySelect, type SubcategoryOption } from "./product-taxonomy-select.tsx";

type ContractClient = RouterContractClient<typeof tenantContractObject>;

function client() {
  return createORPCClient<ContractClient>(new RPCLink({ url: "/tenant/rpc" }));
}

/** `controlled` needs a quantity, `unlimited` must not carry one (contract rule). */
const STOCK_MODES: StockMode[] = ["controlled", "unlimited"];

const GENERIC_CREATE_ERROR = "Não foi possível criar o produto. Tente novamente.";

const GENERIC_SAVE_ERROR = "Não foi possível salvar o produto. Tente novamente.";

const GENERIC_DELETE_ERROR = "Não foi possível excluir o produto. Tente novamente.";

/**
 * The contract schemas drive both the submit and the blur validators. Their input
 * types are wider than what `defaultValues` infers (an optional field written as
 * `undefined` infers `undefined`, not `T | undefined`), so the form still types
 * against the defaults while Valibot validates the real value at submit.
 */
const createProductSchema: any = CreateProductInputSchema;

const updateProductSchema: any = UpdateProductInputSchema;

type VariationValues = {
  id?: string;
  name: string;
  priceCents: number;
  stockMode: StockMode;
  stockQty: number | null;
};

/** The whole editor state, both as the form's values and as the save baseline. */
type ProductValues = {
  storeSlug: string;
  name: string;
  description: string;
  subcategoryId: string | null;
  tagIds: string[];
  available: boolean;
  archived: boolean;
  hidden: boolean;
  private: boolean;
  sortOrder: number;
  variations: VariationValues[];
};

/**
 * A partial update: an omitted field leaves the stored value untouched, while
 * `null` still clears the nullable ones. The addressing never travels in it.
 */
type ProductPatch = {
  name?: string;
  description?: string | null;
  subcategoryId?: string | null;
  tagIds?: string[];
  available?: boolean;
  archived?: boolean;
  hidden?: boolean;
  private?: boolean;
  sortOrder?: number;
  variations?: VariationValues[];
};

/** Tag ids compare as a set: the click order is not part of the saved value. */
function sameIds(left: string[], right: string[]) {
  return left.length === right.length && [...left].sort().join(" ") === [...right].sort().join(" ");
}

/** Row `id` travels with the variation, so the API updates instead of recreating. */
function sameVariations(left: VariationValues[], right: VariationValues[]) {
  return (
    left.length === right.length &&
    left.every((row, index) => {
      const other = right[index];

      return (
        other !== undefined &&
        row.id === other.id &&
        row.name === other.name &&
        row.priceCents === other.priceCents &&
        row.stockMode === other.stockMode &&
        row.stockQty === other.stockQty
      );
    })
  );
}

/**
 * Only the fields the user changed. An omitted field leaves the stored value
 * untouched; `null` clears a nullable one. Variations go as a whole array when
 * any row differs, always keeping the row ids.
 */
function productPatch(baseline: ProductValues, values: ProductValues): ProductPatch {
  const patch: ProductPatch = {};
  const description = values.description.trim() === "" ? null : values.description;
  const savedDescription = baseline.description.trim() === "" ? null : baseline.description;

  if (values.name !== baseline.name) patch.name = values.name;

  if (description !== savedDescription) patch.description = description;

  if (values.subcategoryId !== baseline.subcategoryId) {
    patch.subcategoryId = values.subcategoryId;
  }

  if (!sameIds(values.tagIds, baseline.tagIds)) patch.tagIds = values.tagIds;

  if (values.available !== baseline.available) patch.available = values.available;

  if (values.archived !== baseline.archived) patch.archived = values.archived;

  if (values.hidden !== baseline.hidden) patch.hidden = values.hidden;

  if (values.private !== baseline.private) patch.private = values.private;

  if (values.sortOrder !== baseline.sortOrder) patch.sortOrder = values.sortOrder;

  if (!sameVariations(values.variations, baseline.variations)) patch.variations = values.variations;

  return patch;
}

/** A copied snapshot, so later edits to the form never touch the baseline. */
function snapshotOf(values: ProductValues): ProductValues {
  return {
    storeSlug: values.storeSlug,
    name: values.name,
    description: values.description,
    subcategoryId: values.subcategoryId,
    tagIds: [...values.tagIds],
    available: values.available,
    archived: values.archived,
    hidden: values.hidden,
    private: values.private,
    sortOrder: values.sortOrder,
    variations: values.variations.map((variation) => ({ ...variation })),
  };
}

/** Tags use the id/name shape the combobox needs. */
type TaxonomyItem = { id: string; name: string };

/** Subcategories also carry the category label the option shows. */
type SubcategoryItem = SubcategoryOption;

/**
 * Maps the API's error codes to pt-BR. The contract never sends user copy, so
 * an unmapped code falls back to the generic sentence rather than leaking the
 * English `ORPCError.message`.
 */
function serverMessage(error: Error, fallback: string): string {
  if (error instanceof ORPCError) {
    if (error.code === "CONFLICT") return "Já existe uma variação com este nome neste produto.";

    if (error.code === "FORBIDDEN")
      return "Você não tem permissão para gerenciar o catálogo nesta loja.";

    if (error.code === "NOT_FOUND") return "Produto não encontrado nesta loja.";

    if (error.code === "VALIDATION_FAILED" || error.code === "INVALID_INPUT")
      return "Revise os campos destacados e tente novamente.";

    return fallback;
  }

  return error.message || fallback;
}

/** Deleting refuses a product an order or a kit still points at. */
function deleteMessage(error: Error): string {
  if (error instanceof ORPCError && error.code === "CONFLICT")
    return "Este produto faz parte de um pedido ou kit e não pode ser excluído.";

  return serverMessage(error, GENERIC_DELETE_ERROR);
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/**
 * Campo de dinheiro em reais. O estado do formulário continua em centavos
 * inteiros: o campo mostra o valor formatado e digita em dígitos.
 */
function MoneyInput({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  invalid,
  disabled,
  describedBy,
}: {
  id?: string;
  value: number | undefined;
  onChange: (cents: number | undefined) => void;
  onBlur?: () => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  describedBy?: string;
}) {
  // SAFETY: Number.isFinite exclui `undefined` e `NaN`; o `as number` só estreita o tipo já validado.
  const display = Number.isFinite(value) ? formatBrlInput(value as number) : "";

  return (
    <InputGroup className="max-w-[14rem]">
      <InputGroupAddon align="inline-start">R$</InputGroupAddon>
      <InputGroupInput
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={display}
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          // ponytail: o texto é sempre o valor formatado, então editar no meio
          // joga o cursor para o fim — aceitável num campo curto.
          const digits = event.target.value.replace(/\D/g, "").slice(0, 12);

          onChange(digits === "" ? undefined : Number(digits));
        }}
        onBlur={onBlur}
      />
    </InputGroup>
  );
}

type FieldLike = {
  state: { meta: { isTouched: boolean; isValid: boolean; errors: ReadonlyArray<unknown> } };
};

/** An error shows once the field was touched OR the form was submitted. */
function fieldInvalid(field: FieldLike, submitted: boolean) {
  return (field.state.meta.isTouched || submitted) && !field.state.meta.isValid;
}

function fieldError(field: FieldLike, name: string, submitted: boolean) {
  if (!fieldInvalid(field, submitted)) return null;

  return <FieldError id={`${name}-error`} errors={fieldErrors(field.state.meta.errors)} />;
}

function fieldDescribedBy(
  field: FieldLike,
  name: string,
  submitted: boolean,
  hasDescription = true,
) {
  return (
    [
      hasDescription ? `${name}-description` : null,
      fieldInvalid(field, submitted) ? `${name}-error` : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined
  );
}

function VariationRow({
  form,
  variation,
  index,
  count,
  submitted,
  onRemove,
}: {
  form: any;
  variation: VariationValues;
  index: number;
  count: number;
  submitted: boolean;
  onRemove: () => void;
}) {
  const base = `variations[${index}]`;
  const unlimited = variation.stockMode === "unlimited";

  return (
    <div
      role="group"
      aria-labelledby={`${base}-label`}
      className="flex flex-col gap-3 rounded-lg border border-border p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p id={`${base}-label`} className="text-xs font-medium text-muted-foreground">
          Variação {index + 1}
        </p>
        {count > 1 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label={`Remover variação ${index + 1}`}
          >
            <Trash2 data-icon />
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" />}>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled
                aria-label={`Remover variação ${index + 1}`}
              >
                <Trash2 data-icon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>O produto precisa de ao menos uma variação.</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <form.Field
          name={`${base}.name`}
          validators={{
            onChangeListenTo: ["variations"],
            onChange: ({ value, fieldApi }: any) => {
              const name = String(value ?? "")
                .trim()
                .toLowerCase();

              const variations: VariationValues[] = fieldApi.form.getFieldValue("variations");

              const repeats = variations.filter(
                (item) => item.name.trim().toLowerCase() === name,
              ).length;

              if (name !== "" && repeats > 1) {
                return { message: "Já existe uma variação com este nome." };
              }

              return undefined;
            },
          }}
        >
          {(field: any) => (
            <Field data-invalid={fieldInvalid(field, submitted)}>
              <FieldLabel htmlFor={field.name}>Nome</FieldLabel>
              <Input
                id={field.name}
                value={field.state.value}
                maxLength={80}
                aria-invalid={fieldInvalid(field, submitted)}
                aria-describedby={fieldDescribedBy(field, field.name, submitted, false)}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                placeholder="Ex.: Grande"
              />
              {fieldError(field, field.name, submitted)}
            </Field>
          )}
        </form.Field>

        <form.Field name={`${base}.priceCents`}>
          {(field: any) => (
            <Field data-invalid={fieldInvalid(field, submitted)}>
              <FieldLabel htmlFor={field.name}>Preço</FieldLabel>
              <MoneyInput
                id={field.name}
                value={field.state.value}
                onChange={(cents) => field.handleChange(cents ?? Number.NaN)}
                onBlur={field.handleBlur}
                placeholder="0,00"
                invalid={fieldInvalid(field, submitted)}
                describedBy={fieldDescribedBy(field, field.name, submitted, false)}
              />
              {fieldError(field, field.name, submitted)}
            </Field>
          )}
        </form.Field>

        <form.Field name={`${base}.stockMode`}>
          {(field: any) => (
            <Field>
              <FieldTitle id={`${field.name}-label`}>Estoque</FieldTitle>
              <ToggleGroup
                variant="outline"
                aria-labelledby={`${field.name}-label`}
                value={[field.state.value]}
                onValueChange={(next: string[]) => {
                  const selected = next[0];

                  if (!selected || selected === field.state.value) return;

                  field.handleChange(selected);
                  form.setFieldValue(
                    `${base}.stockQty`,
                    selected === "unlimited" ? null : (form.getFieldValue(`${base}.stockQty`) ?? 0),
                  );
                }}
              >
                {STOCK_MODES.map((mode) => (
                  <ToggleGroupItem key={mode} value={mode}>
                    {STOCK_MODE_LABELS[mode]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
          )}
        </form.Field>

        <form.Field name={`${base}.stockQty`}>
          {(field: any) => (
            <Field data-invalid={fieldInvalid(field, submitted)}>
              <FieldLabel htmlFor={field.name}>Quantidade</FieldLabel>
              <Input
                id={field.name}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                disabled={unlimited}
                value={
                  field.state.value === null ? "" : maskIntegerInput(String(field.state.value))
                }
                placeholder="0"
                aria-invalid={fieldInvalid(field, submitted)}
                aria-describedby={fieldDescribedBy(field, field.name, submitted)}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, "");
                  field.handleChange(digits === "" ? null : Number(digits));
                }}
                onBlur={field.handleBlur}
              />
              <FieldDescription id={`${field.name}-description`}>
                {unlimited
                  ? "Sem controle de estoque: a quantidade fica desativada."
                  : "Quantidade disponível para venda."}
              </FieldDescription>
              {fieldError(field, field.name, submitted)}
            </Field>
          )}
        </form.Field>
      </div>
    </div>
  );
}

/** One switch plus its gray help icon; the tooltip explains the visibility rule. */
function VisibilityField({
  form,
  name,
  label,
  help,
}: {
  form: any;
  name: "available" | "archived" | "hidden" | "private";
  label: string;
  help: string;
}) {
  return (
    <form.Field name={name}>
      {(field: any) => (
        <Field orientation="horizontal" className="w-auto">
          <Switch
            id={field.name}
            checked={field.state.value}
            onCheckedChange={field.handleChange}
          />
          <div className="flex items-center gap-1">
            <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    aria-label={`Ajuda sobre ${label}`}
                  />
                }
              >
                <CircleHelp data-icon aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent className="max-w-72">{help}</TooltipContent>
            </Tooltip>
          </div>
        </Field>
      )}
    </form.Field>
  );
}

function ProductFields({
  form,
  submitted,
  subcategories,
  tags,
}: {
  form: any;
  submitted: boolean;
  subcategories: SubcategoryItem[];
  tags: TaxonomyItem[];
}) {
  return (
    <>
      <FormSection title="Identificação" description="Nome, descrição e onde o produto aparece.">
        <FieldGroup className="grid gap-4 lg:grid-cols-2">
          <form.Field name="name">
            {(field: any) => (
              <Field data-invalid={fieldInvalid(field, submitted)}>
                <FieldLabel htmlFor={field.name}>Nome</FieldLabel>
                <Input
                  id={field.name}
                  maxLength={120}
                  value={field.state.value}
                  aria-invalid={fieldInvalid(field, submitted)}
                  aria-describedby={fieldDescribedBy(field, field.name, submitted)}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="Ex.: Pizza margherita"
                />
                <FieldDescription id={`${field.name}-description`}>
                  Até 120 caracteres.
                </FieldDescription>
                {fieldError(field, field.name, submitted)}
              </Field>
            )}
          </form.Field>

          <form.Field name="sortOrder">
            {(field: any) => (
              <Field data-invalid={fieldInvalid(field, submitted)}>
                <FieldLabel htmlFor={field.name}>Ordem</FieldLabel>
                <Input
                  id={field.name}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={maskIntegerInput(String(field.state.value))}
                  aria-invalid={fieldInvalid(field, submitted)}
                  aria-describedby={fieldDescribedBy(field, field.name, submitted)}
                  onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, "");
                    field.handleChange(digits === "" ? 0 : Number(digits));
                  }}
                  onBlur={field.handleBlur}
                />
                <FieldDescription id={`${field.name}-description`}>
                  Menor número aparece primeiro na listagem.
                </FieldDescription>
                {fieldError(field, field.name, submitted)}
              </Field>
            )}
          </form.Field>

          <form.Field name="description">
            {(field: any) => (
              <Field data-invalid={fieldInvalid(field, submitted)} className="lg:col-span-2">
                <FieldLabel htmlFor={field.name}>Descrição</FieldLabel>
                <Textarea
                  id={field.name}
                  rows={4}
                  maxLength={2000}
                  value={field.state.value ?? ""}
                  aria-invalid={fieldInvalid(field, submitted)}
                  aria-describedby={fieldDescribedBy(field, field.name, submitted)}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="Ingredientes, porção, observações."
                />
                <FieldDescription id={`${field.name}-description`}>
                  Opcional. {(field.state.value ?? "").length}/2000 caracteres.
                </FieldDescription>
                {fieldError(field, field.name, submitted)}
              </Field>
            )}
          </form.Field>

          <form.Field name="subcategoryId">
            {(field: any) => (
              <div className="flex flex-col gap-2">
                <ProductTaxonomySelect
                  id={field.name}
                  value={field.state.value}
                  onChange={field.handleChange}
                  subcategories={subcategories}
                  invalid={fieldInvalid(field, submitted)}
                  describedBy={fieldDescribedBy(field, field.name, submitted, false)}
                />
                {fieldError(field, field.name, submitted)}
              </div>
            )}
          </form.Field>

          <form.Field name="tagIds">
            {(field: any) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Tags</FieldLabel>
                {tags.length === 0 ? (
                  <Empty className="border">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Tag data-icon />
                      </EmptyMedia>
                      <EmptyTitle>Nenhuma tag cadastrada</EmptyTitle>
                      <EmptyDescription>
                        Crie tags em Catálogo › Tags para marcar este produto.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <TagCombobox
                    id={field.name}
                    tags={tags}
                    value={field.state.value}
                    onChange={field.handleChange}
                    className="w-full"
                  />
                )}
              </Field>
            )}
          </form.Field>

          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
            <VisibilityField
              form={form}
              name="available"
              label="Ativo"
              help="Quando desativado, o produto não existe para o cliente: a URL direta responde 404 e ele sai do cardápio, da busca e do sitemap."
            />
            <VisibilityField
              form={form}
              name="archived"
              label="Arquivado"
              help="Pausa o produto temporariamente. A URL direta mostra o aviso de pausa, mas ele não é indexado nem aparece no cardápio."
            />
            <VisibilityField
              form={form}
              name="hidden"
              label="Escondido"
              help="Some do cardápio, da busca e do sitemap. Quem tiver a URL direta ainda abre e compra, se o produto estiver ativo."
            />
            <VisibilityField
              form={form}
              name="private"
              label="Privado"
              help="Exige uma conta da loja (dono, administrador ou membro) para abrir e comprar. Não aparece para clientes nem é indexado."
            />
          </div>
        </FieldGroup>
      </FormSection>

      <FormSection
        title="Variações"
        description="Cada variação tem o próprio preço e o próprio estoque."
      >
        <form.Field name="variations">
          {(field: any) => (
            <div className="flex flex-col gap-4">
              {field.state.value.length === 0 ? (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyTitle>Nenhuma variação</EmptyTitle>
                    <EmptyDescription>Informe ao menos uma variação para salvar.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="flex flex-col gap-3">
                  {field.state.value.map((variation: VariationValues, index: number) => (
                    <div key={variation.id ?? index} className="flex flex-col gap-3">
                      {index > 0 ? <Separator /> : null}
                      <VariationRow
                        form={form}
                        variation={variation}
                        index={index}
                        count={field.state.value.length}
                        submitted={submitted}
                        onRemove={() => field.removeValue(index)}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    field.pushValue({
                      name: "",
                      priceCents: 0,
                      stockMode: "controlled",
                      stockQty: 0,
                    })
                  }
                >
                  <Plus data-icon="inline-start" aria-hidden="true" />
                  Adicionar variação
                </Button>
              </div>
              {fieldError(field, field.name, submitted)}
            </div>
          )}
        </form.Field>
      </FormSection>
    </>
  );
}

/** Submit handler shared by both modes: blocks native validation and focuses the first error. */
function submitWithFocus(form: any, event: FormEvent<HTMLFormElement>) {
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
}

export function DeleteProductButton({
  storeSlug,
  productId,
}: {
  storeSlug: string;
  productId: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => client().panel.deleteProduct({ storeSlug, productId }),
    onSuccess: () => {
      router.push(`/dashboard/${storeSlug}/catalog/products`);
      router.refresh();
    },
    onError: (error) => {
      setServerError(deleteMessage(error));
      setConfirming(false);
    },
  });

  return (
    <div className="flex flex-col items-end gap-3">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="w-auto"
        onClick={() => {
          setServerError(null);
          setConfirming(true);
        }}
      >
        Excluir produto
      </Button>

      {serverError ? (
        <Alert variant="destructive" className="w-full max-w-sm">
          <AlertTitle>Não foi possível excluir o produto</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este produto?</AlertDialogTitle>
            <AlertDialogDescription>
              As variações e as tags ligadas a ele também são removidas. Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Excluindo…" : "Excluir produto"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function ProductForm({
  storeSlug,
  product,
  subcategories,
  tags,
}: {
  storeSlug: string;
  product?: PanelProductDetail;
  subcategories: SubcategoryItem[];
  tags: TaxonomyItem[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const initialVariations: VariationValues[] = product
    ? product.variations.map((variation) => ({
        id: variation.id,
        name: variation.name,
        priceCents: variation.priceCents,
        stockMode: variation.stockMode,
        stockQty: variation.stockQty,
      }))
    : [{ name: "", priceCents: 0, stockMode: "controlled", stockQty: 0 }];

  const defaultValues: ProductValues = {
    storeSlug,
    name: product?.name ?? "",
    description: product?.description ?? "",
    subcategoryId: product?.subcategoryId ?? null,
    tagIds: product?.tags.map((tag) => tag.id) ?? [],
    available: product?.available ?? true,
    archived: product?.archived ?? false,
    hidden: product?.hidden ?? false,
    private: product?.private ?? false,
    sortOrder: product?.sortOrder ?? 0,
    variations: initialVariations,
  };

  // What the next save compares against: the last submitted snapshot, so a
  // second save never resends the first patch.
  const [baseline, setBaseline] = useState<ProductValues>(() => snapshotOf(defaultValues));

  const mutation = useMutation({
    mutationFn: async (values: ProductValues) => {
      if (product) {
        const patch = productPatch(baseline, values);

        if (Object.keys(patch).length === 0) return null;

        const { product: updated } = await client().panel.updateProduct({
          storeSlug,
          productId: product.id,
          ...patch,
        });

        return updated;
      }

      const { product: created } = await client().panel.createProduct({
        ...values,
        description: values.description.trim() === "" ? null : values.description,
      });

      return created;
    },
    onSuccess: (result, values) => {
      if (!result) {
        setStatus("Nenhuma alteração para salvar.");

        return;
      }

      if (product) {
        setBaseline(snapshotOf(values));
        setStatus("Alterações salvas.");
        router.refresh();

        return;
      }

      // The note lives on the edit page, so it survives the navigation.
      router.push(`/dashboard/${storeSlug}/catalog/products/${result.id}?created=1`);
    },
    onError: (error) => {
      setStatus(null);
      setServerError(serverMessage(error, product ? GENERIC_SAVE_ERROR : GENERIC_CREATE_ERROR));
    },
  });

  const form = useForm({
    defaultValues: product ? { ...defaultValues, productId: product.id } : defaultValues,
    validators: {
      onSubmit: product ? updateProductSchema : createProductSchema,
      onBlur: product ? updateProductSchema : createProductSchema,
    },
    onSubmit: async ({ value }) => {
      setServerError(null);
      setStatus(null);
      await mutation.mutateAsync(value);
    },
  });

  const formValues = useStore(form.store, (state: any) => state.values);

  const currentValues: ProductValues = {
    storeSlug,
    name: formValues.name,
    description: formValues.description ?? "",
    subcategoryId: formValues.subcategoryId ?? null,
    tagIds: formValues.tagIds ?? [],
    available: formValues.available,
    archived: formValues.archived,
    hidden: formValues.hidden,
    private: formValues.private,
    sortOrder: formValues.sortOrder,
    variations: formValues.variations ?? [],
  };

  const dirty =
    product !== undefined && Object.keys(productPatch(baseline, currentValues)).length > 0;

  const leaveGuard = useLeaveGuard();

  useDirtySection("product", dirty);
  useProductWebMcp(form);

  return (
    <TooltipProvider>
      <div className="flex w-full max-w-5xl flex-col gap-6">
        <form className="flex flex-col gap-6" onSubmit={(event) => submitWithFocus(form, event)}>
          <form.Subscribe selector={(state: any) => state.isSubmitted}>
            {(submitted: boolean) => (
              <ProductFields
                form={form}
                submitted={submitted}
                subcategories={subcategories}
                tags={tags}
              />
            )}
          </form.Subscribe>

          {serverError ? (
            <Alert variant="destructive">
              <AlertTitle>
                {product ? "Não foi possível salvar o produto" : "Não foi possível criar o produto"}
              </AlertTitle>
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
              onClick={() => {
                const href = `/dashboard/${storeSlug}/catalog/products`;

                if (leaveGuard) {
                  leaveGuard.requestLeave(href);

                  return;
                }

                router.push(href);
              }}
            >
              Cancelar
            </Button>
            <form.Subscribe selector={(state: any) => state.isSubmitting}>
              {(isSubmitting: boolean) => (
                <Button type="submit" disabled={isSubmitting || mutation.isPending}>
                  {isSubmitting || mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
                  {product ? "Salvar alterações" : "Criar produto"}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </div>
    </TooltipProvider>
  );
}
