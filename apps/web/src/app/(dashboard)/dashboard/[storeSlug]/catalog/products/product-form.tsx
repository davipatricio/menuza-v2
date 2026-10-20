"use client";

import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "@tanstack/react-form";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import { useMutation } from "@tanstack/react-query";
import { cn } from "cn";
import { Plus, Tag, Trash2 } from "lucide-react";
import { tenantContractObject } from "@menuza/shared/tenant";
import { CreateProductInputSchema, UpdateProductInputSchema } from "@menuza/shared/tenant";
import type { PanelProductDetail, PanelSeo, StockMode } from "@menuza/shared/tenant";

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
import { Checkbox } from "@/components/ui/checkbox.tsx";
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
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { SeoForm } from "../../_components/seo-form.tsx";
import { fieldErrors } from "../../../signup/_components/form-errors.ts";
import { formatBrlInput, maskBrlInput, maskIntegerInput, parseBrlToCents } from "@/lib/format.ts";
import { STOCK_MODE_LABELS } from "@/lib/panel-labels.ts";

type ContractClient = RouterContractClient<typeof tenantContractObject>;

function client() {
  return createORPCClient<ContractClient>(new RPCLink({ url: "/tenant/rpc" }));
}

/** `controlled` needs a quantity, `unlimited` must not carry one (contract rule). */
const STOCK_MODES: StockMode[] = ["controlled", "unlimited"];

const NO_SELECTION = "none";

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

/** Categories, departments and tags share the id/name shape the selects need. */
type TaxonomyItem = { id: string; name: string };

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
 * inteiros; texto inválido vira `NaN` para o schema recusar.
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
  const committed = Number.isFinite(value) ? formatBrlInput(value as number) : "";
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <InputGroup className="max-w-[14rem]">
      <InputGroupAddon align="inline-start">R$</InputGroupAddon>
      <InputGroupInput
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={draft ?? committed}
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onFocus={() => setDraft((current) => current ?? committed)}
        onChange={(event) => {
          // ponytail: máscara de milhar a cada tecla; editar no meio do valor
          // joga o cursor para o fim — aceitável num campo curto.
          const masked = maskBrlInput(event.target.value);
          setDraft(masked);

          if (masked.trim() === "") {
            onChange(undefined);

            return;
          }

          try {
            onChange(parseBrlToCents(masked));
          } catch {
            onChange(Number.NaN);
          }
        }}
        onBlur={() => {
          try {
            parseBrlToCents(draft ?? "");
            setDraft(null);
          } catch {
            // Mantém o texto inválido visível; o erro do schema explica.
          }

          onBlur?.();
        }}
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

/** Select options for the two taxonomy fields, with the explicit "no value" row. */
function taxonomyOptions(items: Array<{ id: string; name: string }>, emptyLabel: string) {
  return [
    { label: emptyLabel, value: NO_SELECTION },
    ...items.map((item) => ({ label: item.name, value: item.id })),
  ];
}

function TaxonomySelect({
  field,
  submitted,
  items,
  emptyLabel,
  placeholder,
}: {
  field: any;
  submitted: boolean;
  items: Array<{ id: string; name: string }>;
  emptyLabel: string;
  placeholder: string;
}) {
  const options = taxonomyOptions(items, emptyLabel);

  return (
    <Select
      items={options}
      value={field.state.value ?? NO_SELECTION}
      onValueChange={(next) => field.handleChange(next === NO_SELECTION ? null : next)}
    >
      <SelectTrigger
        id={field.name}
        aria-invalid={fieldInvalid(field, submitted)}
        aria-describedby={fieldDescribedBy(field, field.name, submitted)}
        className="w-full max-w-[20rem]"
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
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
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Variação {index + 1}</p>
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
                className="max-w-[10rem]"
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

function ProductFields({
  form,
  submitted,
  categories,
  departments,
  tags,
}: {
  form: any;
  submitted: boolean;
  categories: TaxonomyItem[];
  departments: TaxonomyItem[];
  tags: TaxonomyItem[];
}) {
  return (
    <>
      <FormSection title="Identificação" description="Nome, descrição e onde o produto aparece.">
        <FieldGroup className="gap-4">
          <form.Field name="name">
            {(field: any) => (
              <Field data-invalid={fieldInvalid(field, submitted)}>
                <FieldLabel htmlFor={field.name}>Nome</FieldLabel>
                <Input
                  id={field.name}
                  className="max-w-[24rem]"
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

          <form.Field name="description">
            {(field: any) => (
              <Field data-invalid={fieldInvalid(field, submitted)}>
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

          <div className="grid gap-3 md:grid-cols-2">
            <form.Field name="categoryId">
              {(field: any) => (
                <Field data-invalid={fieldInvalid(field, submitted)}>
                  <FieldLabel htmlFor={field.name}>Categoria</FieldLabel>
                  <TaxonomySelect
                    field={field}
                    submitted={submitted}
                    items={categories}
                    emptyLabel="Sem categoria"
                    placeholder="Sem categoria"
                  />
                  <FieldDescription id={`${field.name}-description`}>
                    Um produto pode ficar sem categoria.
                  </FieldDescription>
                </Field>
              )}
            </form.Field>

            <form.Field name="departmentId">
              {(field: any) => (
                <Field data-invalid={fieldInvalid(field, submitted)}>
                  <FieldLabel htmlFor={field.name}>Departamento</FieldLabel>
                  <TaxonomySelect
                    field={field}
                    submitted={submitted}
                    items={departments}
                    emptyLabel="Sem departamento"
                    placeholder="Sem departamento"
                  />
                  <FieldDescription id={`${field.name}-description`}>
                    Um produto pode ficar sem departamento.
                  </FieldDescription>
                </Field>
              )}
            </form.Field>
          </div>

          <form.Field name="tagIds">
            {(field: any) => (
              <FieldSet>
                <FieldLegend variant="label">Tags</FieldLegend>
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
                  <div className="flex flex-wrap gap-3">
                    {tags.map((tag) => {
                      const id = `${field.name}-${tag.id}`;

                      return (
                        <Field key={tag.id} orientation="horizontal" className="w-auto">
                          <Checkbox
                            id={id}
                            checked={field.state.value.includes(tag.id)}
                            onCheckedChange={(checked: boolean) =>
                              field.handleChange(
                                checked
                                  ? [...field.state.value, tag.id]
                                  : field.state.value.filter((item: string) => item !== tag.id),
                              )
                            }
                          />
                          <FieldLabel htmlFor={id}>{tag.name}</FieldLabel>
                        </Field>
                      );
                    })}
                  </div>
                )}
              </FieldSet>
            )}
          </form.Field>

          <div className="flex flex-wrap items-center gap-6">
            <form.Field name="available">
              {(field: any) => (
                <Field orientation="horizontal" className="w-auto">
                  <Checkbox
                    id={field.name}
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                  />
                  <FieldLabel htmlFor={field.name}>Disponível para venda</FieldLabel>
                </Field>
              )}
            </form.Field>

            <form.Field name="sortOrder">
              {(field: any) => (
                <Field data-invalid={fieldInvalid(field, submitted)}>
                  <FieldLabel htmlFor={field.name}>Ordem</FieldLabel>
                  <Input
                    id={field.name}
                    className="max-w-[10rem]"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={maskIntegerInput(String(field.state.value))}
                    aria-invalid={fieldInvalid(field, submitted)}
                    aria-describedby={fieldDescribedBy(field, field.name, submitted, false)}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, "");
                      field.handleChange(digits === "" ? 0 : Number(digits));
                    }}
                    onBlur={field.handleBlur}
                  />
                  {fieldError(field, field.name, submitted)}
                </Field>
              )}
            </form.Field>
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

function DeleteProductButton({ storeSlug, productId }: { storeSlug: string; productId: string }) {
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
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="destructive"
        onClick={() => {
          setServerError(null);
          setConfirming(true);
        }}
      >
        Excluir produto
      </Button>

      {serverError ? (
        <Alert variant="destructive">
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
  seo,
  categories,
  departments,
  tags,
}: {
  storeSlug: string;
  product?: PanelProductDetail;
  seo?: PanelSeo;
  categories: TaxonomyItem[];
  departments: TaxonomyItem[];
  tags: TaxonomyItem[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const initialVariations: VariationValues[] = product
    ? product.variations.map((variation) => ({
        id: variation.id,
        name: variation.name,
        priceCents: variation.priceCents,
        stockMode: variation.stockMode,
        stockQty: variation.stockQty,
      }))
    : [{ name: "", priceCents: 0, stockMode: "controlled", stockQty: 0 }];

  const defaultValues = {
    storeSlug,
    name: product?.name ?? "",
    description: product?.description ?? "",
    categoryId: product?.categoryId ?? null,
    departmentId: product?.departmentId ?? null,
    tagIds: product?.tags.map((tag) => tag.id) ?? [],
    available: product?.available ?? true,
    sortOrder: product?.sortOrder ?? 0,
    variations: initialVariations,
  };

  const mutation = useMutation({
    mutationFn: async (values: any) => {
      const payload = {
        ...values,
        description: String(values.description ?? "").trim() === "" ? null : values.description,
      };

      if (product) return client().panel.updateProduct({ ...payload, productId: product.id });

      return client().panel.createProduct(payload);
    },
    onSuccess: (result) => {
      if (product) {
        setSaved(true);
        router.refresh();

        return;
      }

      // The note lives on the edit page, so it survives the navigation.
      router.push(`/dashboard/${storeSlug}/catalog/products/${result.product.id}?created=1`);
    },
    onError: (error) => {
      setSaved(false);
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
      await mutation.mutateAsync(value);
    },
  });

  return (
    <TooltipProvider>
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <form className="flex flex-col gap-6" onSubmit={(event) => submitWithFocus(form, event)}>
          <form.Subscribe selector={(state: any) => state.isSubmitted}>
            {(submitted: boolean) => (
              <ProductFields
                form={form}
                submitted={submitted}
                categories={categories}
                departments={departments}
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

          {saved ? (
            <p role="status" className="text-sm text-muted-foreground">
              Alterações salvas.
            </p>
          ) : null}

          <div
            className={cn(
              "flex flex-wrap items-center gap-2",
              product ? "justify-between" : "justify-end",
            )}
          >
            {product ? <DeleteProductButton storeSlug={storeSlug} productId={product.id} /> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/dashboard/${storeSlug}/catalog/products`)}
              >
                Cancelar
              </Button>
              <form.Subscribe selector={(state: any) => state.isSubmitting}>
                {(isSubmitting: boolean) => (
                  <Button type="submit" disabled={isSubmitting || mutation.isPending}>
                    {isSubmitting || mutation.isPending ? (
                      <Spinner data-icon="inline-start" />
                    ) : null}
                    {product ? "Salvar alterações" : "Criar produto"}
                  </Button>
                )}
              </form.Subscribe>
            </div>
          </div>
        </form>

        <section aria-labelledby="product-seo-heading" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <h3 id="product-seo-heading" className="text-base font-semibold tracking-tight">
              SEO
            </h3>
            <p className="text-sm text-pretty text-muted-foreground">
              Como o produto aparece na busca e ao ser compartilhado.
            </p>
          </div>
          {product && seo ? (
            <SeoForm
              storeSlug={storeSlug}
              entityType="product"
              entityId={product.id}
              entityName={product.name}
              initialData={seo}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Salve o produto para editar o SEO.</p>
          )}
        </section>
      </div>
    </TooltipProvider>
  );
}
