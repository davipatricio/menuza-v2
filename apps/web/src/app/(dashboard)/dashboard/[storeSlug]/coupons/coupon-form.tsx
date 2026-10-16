"use client";

import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "@tanstack/react-form";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { tenantContractObject } from "@menuza/shared/tenant";
import type { RouterContractClient } from "@orpc/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";

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
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { DatePicker } from "../../signup/_components/date-picker.tsx";
import { fieldErrors } from "../../signup/_components/form-errors.ts";
import { formatBrlInput, maskBrlInput, maskIntegerInput, parseBrlToCents } from "@/lib/format.ts";
import { CreateCouponInputSchema, UpdateCouponInputSchema } from "@menuza/shared/tenant";
import type { PanelCoupon } from "@menuza/shared/tenant";

type PanelCouponType = PanelCoupon;

const COUPON_STATUS_ITEMS_CREATE = [
  { label: "Ativo", value: "active" },
  { label: "Desativado", value: "disabled" },
] as const;

const COUPON_STATUS_ITEMS_EDIT = [
  ...COUPON_STATUS_ITEMS_CREATE,
  { label: "Expirado", value: "expired" },
] as const;

const GENERIC_CREATE_ERROR = "Não foi possível criar o cupom. Tente novamente.";

const GENERIC_UPDATE_ERROR = "Não foi possível salvar o cupom. Tente novamente.";

/**
 * The contract schemas drive both the submit and the blur validators. Their input
 * types are wider than what `defaultValues` infers (an optional field written as
 * `undefined` infers `undefined`, not `T | undefined`), so the form still types
 * against the defaults while Valibot validates the real value at submit.
 */
const createCouponSchema: any = CreateCouponInputSchema;

const updateCouponSchema: any = UpdateCouponInputSchema;

/**
 * Maps the API's error codes to pt-BR. The contract never sends user copy, so
 * an unmapped code falls back to the generic sentence rather than leaking the
 * English `ORPCError.message`.
 */
function serverMessage(error: Error, fallback: string): string {
  if (error instanceof ORPCError) {
    if (error.code === "CONFLICT") return "Já existe um cupom com esse código.";

    if (error.code === "FORBIDDEN")
      return "Você não tem permissão para gerenciar cupons nesta loja.";

    if (error.code === "NOT_FOUND") return "Loja não encontrada.";

    if (error.code === "BAD_REQUEST") return "Revise os campos destacados e tente novamente.";

    return fallback;
  }

  return error.message || fallback;
}

type ContractClient = RouterContractClient<typeof tenantContractObject>;

function client() {
  return createORPCClient<ContractClient>(new RPCLink({ url: "/tenant/rpc" }));
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

// The coupon window's picker bounds, fixed at module load: `new Date()` during
// render is impure, and the calendar's year dropdown only lists the years
// inside them (react-day-picker's fallback is the last 100 years, which would
// hide a future expiry).
const TODAY = new Date();

const COUPON_MIN_DATE = new Date(TODAY.getFullYear() - 5, 0, 1);

const COUPON_MAX_DATE = new Date(TODAY.getFullYear() + 10, 11, 31);

const COUPON_DEFAULT_MONTH = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);

/**
 * Campo de dinheiro em reais. O estado do formulário continua em centavos
 * inteiros; texto inválido vira `NaN` para o schema recusar, e campo vazio
 * vira `undefined` (limite opcional não preenchido).
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

/** Inteiro positivo com milhar agrupado na digitação; vazio vira `undefined`. */
function IntegerInput({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  disabled,
  describedBy,
}: {
  id?: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <Input
      id={id}
      className="max-w-[14rem]"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      disabled={disabled}
      value={value === undefined ? "" : maskIntegerInput(String(value))}
      placeholder={placeholder}
      aria-describedby={describedBy}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "");
        onChange(digits === "" ? undefined : Number(digits));
      }}
      onBlur={onBlur}
    />
  );
}

function splitValue(coupon: PanelCoupon) {
  return coupon.discountType === "fixed" ? (coupon.valueCents ?? 0) : (coupon.valuePercent ?? 0);
}

function CouponFormFields({
  form,
  mode,
  submitted,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any;
  mode: "create" | "edit";
  submitted: boolean;
}) {
  // An error shows once the field was touched OR the form was submitted, so a
  // submit never fails silently on a field the user never visited.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invalid = (field: any) =>
    (field.state.meta.isTouched || submitted) && !field.state.meta.isValid;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const describedBy = (field: any, name: string, hasDescription = true) =>
    [hasDescription ? `${name}-description` : null, invalid(field) ? `${name}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const error = (field: any, name: string) =>
    invalid(field) ? (
      <FieldError id={`${name}-error`} errors={fieldErrors(field.state.meta.errors)} />
    ) : null;

  return (
    <>
      <FormSection title="Identificação" description="Código e descrição interna da promoção.">
        <FieldGroup className="gap-4">
          <form.Field name="code">
            {(field: any) => (
              <Field data-invalid={invalid(field)}>
                <FieldLabel htmlFor={field.name}>Código</FieldLabel>
                <Input
                  id={field.name}
                  className="max-w-[16rem]"
                  autoCapitalize="characters"
                  value={field.state.value}
                  aria-invalid={invalid(field)}
                  aria-describedby={describedBy(field, field.name)}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={() => {
                    field.handleChange(field.state.value.toUpperCase());
                    field.handleBlur();
                  }}
                  placeholder="PROMO10"
                />
                <FieldDescription id={`${field.name}-description`}>
                  Até 64 caracteres. Salvo em maiúsculas.
                </FieldDescription>
                {error(field, field.name)}
              </Field>
            )}
          </form.Field>

          <form.Field name="description">
            {(field: any) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Descrição</FieldLabel>
                <Textarea
                  id={field.name}
                  rows={3}
                  maxLength={280}
                  value={field.state.value ?? ""}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="Ex.: campanha de aniversário da loja"
                />
                <FieldDescription id={`${field.name}-description`}>
                  Opcional. Uso interno da equipe, até 280 caracteres.
                </FieldDescription>
              </Field>
            )}
          </form.Field>
        </FieldGroup>
      </FormSection>

      <FormSection title="Desconto" description="Percentual ou valor fixo em reais.">
        <FieldGroup className="gap-4">
          <form.Field name="discountType">
            {(field: any) => (
              <Field>
                <FieldTitle id={`${field.name}-label`}>Tipo</FieldTitle>
                <ToggleGroup
                  variant="outline"
                  aria-labelledby={`${field.name}-label`}
                  value={[field.state.value]}
                  onValueChange={(next: string[]) => {
                    const selected = next[0];

                    if (!selected || selected === field.state.value) return;

                    const previous = field.state.value;
                    field.handleChange(selected);
                    const current = form.getFieldValue("discountValue");

                    if (!Number.isFinite(current)) {
                      form.setFieldValue("discountValue", selected === "percentage" ? 10 : 1000);

                      return;
                    }

                    // Recalcula o número visível na troca de unidade: R$ 15,00 vira
                    // 15%, e 10% vira R$ 10,00 — nunca deixa 1500 num campo de %.
                    form.setFieldValue(
                      "discountValue",
                      previous === "fixed" && selected === "percentage"
                        ? Math.min(100, Math.max(1, Math.round(current / 100)))
                        : current * 100,
                    );
                  }}
                >
                  <ToggleGroupItem value="percentage">Percentual</ToggleGroupItem>
                  <ToggleGroupItem value="fixed">Valor fixo</ToggleGroupItem>
                </ToggleGroup>
              </Field>
            )}
          </form.Field>

          <form.Subscribe selector={(state: any) => state.values.discountType}>
            {(discountType: "percentage" | "fixed") => (
              <form.Field
                name="discountValue"
                validators={{
                  onChangeListenTo: ["discountType"],
                  onChange: ({ value, fieldApi }: any) => {
                    // O `v.check` do schema é de formulário (sem path), então a
                    // regra de ≤100% precisa de um validador de campo para aparecer.
                    if (fieldApi.form.getFieldValue("discountType") === "percentage" && value > 100)
                      return { message: "Para desconto percentual, use um valor de 1 a 100." };

                    return undefined;
                  },
                }}
              >
                {(field: any) => (
                  <Field data-invalid={invalid(field)}>
                    <FieldLabel htmlFor={field.name}>Valor do desconto</FieldLabel>
                    {discountType === "percentage" ? (
                      <InputGroup className="max-w-[14rem]">
                        <InputGroupInput
                          id={field.name}
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={field.state.value ?? ""}
                          placeholder="10"
                          aria-invalid={invalid(field)}
                          aria-describedby={describedBy(field, field.name)}
                          onChange={(event) => {
                            const digits = event.target.value.replace(/\D/g, "");
                            field.handleChange(digits === "" ? undefined : Number(digits));
                          }}
                          onBlur={field.handleBlur}
                        />
                        <InputGroupAddon align="inline-end">%</InputGroupAddon>
                      </InputGroup>
                    ) : (
                      <MoneyInput
                        id={field.name}
                        value={field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                        placeholder="15,00"
                        invalid={invalid(field)}
                        describedBy={describedBy(field, field.name)}
                      />
                    )}
                    <FieldDescription id={`${field.name}-description`}>
                      {discountType === "percentage"
                        ? "Número inteiro de 1 a 100."
                        : "Digite o valor em reais."}
                    </FieldDescription>
                    {error(field, field.name)}
                  </Field>
                )}
              </form.Field>
            )}
          </form.Subscribe>

          <div className="grid gap-3 md:grid-cols-2">
            <form.Field name="minimumOrderCents">
              {(field: any) => (
                <Field data-invalid={invalid(field)}>
                  <FieldLabel htmlFor={field.name}>Pedido mínimo</FieldLabel>
                  <MoneyInput
                    id={field.name}
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    placeholder="0,00"
                    invalid={invalid(field)}
                    describedBy={describedBy(field, field.name)}
                  />
                  <FieldDescription id={`${field.name}-description`}>
                    Opcional. Vazio = sem mínimo.
                  </FieldDescription>
                  {error(field, field.name)}
                </Field>
              )}
            </form.Field>
            <form.Subscribe selector={(state: any) => state.values.discountType}>
              {(discountType: "percentage" | "fixed") => (
                <form.Field name="maximumDiscountCents">
                  {(field: any) => (
                    <Field data-invalid={invalid(field)}>
                      <FieldLabel htmlFor={field.name}>Desconto máximo</FieldLabel>
                      <MoneyInput
                        id={field.name}
                        value={field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                        placeholder="0,00"
                        disabled={discountType === "fixed"}
                        invalid={invalid(field)}
                        describedBy={describedBy(field, field.name)}
                      />
                      <FieldDescription id={`${field.name}-description`}>
                        Opcional. Vazio = sem teto. Só vale para percentual.
                      </FieldDescription>
                      {error(field, field.name)}
                    </Field>
                  )}
                </form.Field>
              )}
            </form.Subscribe>
          </div>
          <form.Field name="shippingDiscountPercent">
            {(field: any) => (
              <Field data-invalid={invalid(field)}>
                <FieldLabel htmlFor={field.name}>Desconto no frete</FieldLabel>
                <InputGroup className="max-w-[14rem]">
                  <InputGroupInput
                    id={field.name}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={field.state.value ?? ""}
                    placeholder="0"
                    aria-invalid={invalid(field)}
                    aria-describedby={describedBy(field, field.name)}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, "");
                      field.handleChange(digits === "" ? undefined : Number(digits));
                    }}
                    onBlur={field.handleBlur}
                  />
                  <InputGroupAddon align="inline-end">%</InputGroupAddon>
                </InputGroup>
                <FieldDescription id={`${field.name}-description`}>
                  Opcional. Percentual do frete, de 0 a 100. Soma-se ao desconto do pedido.
                </FieldDescription>
                {error(field, field.name)}
              </Field>
            )}
          </form.Field>
        </FieldGroup>
      </FormSection>

      <FormSection title="Limites e validade" description="Controle de uso, prazo e status.">
        <FieldGroup className="gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <form.Field name="usageLimit">
              {(field: any) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Uso máximo global</FieldLabel>
                  <IntegerInput
                    id={field.name}
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    placeholder="100"
                    describedBy={`${field.name}-description`}
                  />
                  <FieldDescription id={`${field.name}-description`}>
                    Opcional. Vazio = ilimitado. Conta o total de pedidos, não é por cliente.
                  </FieldDescription>
                </Field>
              )}
            </form.Field>
            <form.Subscribe selector={(state: any) => state.values.firstPurchaseOnly}>
              {(firstPurchaseOnly: boolean) => (
                <form.Field name="perCustomerLimit">
                  {(field: any) => (
                    <Field data-invalid={invalid(field)}>
                      <FieldLabel htmlFor={field.name}>Limite por cliente</FieldLabel>
                      <IntegerInput
                        id={field.name}
                        value={firstPurchaseOnly ? 1 : field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                        disabled={firstPurchaseOnly}
                        placeholder="1"
                        describedBy={`${field.name}-description`}
                      />
                      <FieldDescription id={`${field.name}-description`}>
                        {firstPurchaseOnly
                          ? 'Travado em 1 enquanto "Uso único por cliente" estiver marcado.'
                          : "Opcional. Vazio = ilimitado."}
                      </FieldDescription>
                    </Field>
                  )}
                </form.Field>
              )}
            </form.Subscribe>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <form.Field name="startsAt">
              {(field: any) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Início</FieldLabel>
                  <DatePicker
                    id={field.name}
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    minDate={COUPON_MIN_DATE}
                    maxDate={COUPON_MAX_DATE}
                    defaultMonth={COUPON_DEFAULT_MONTH}
                    describedBy={`${field.name}-description`}
                  />
                  <FieldDescription id={`${field.name}-description`}>
                    Opcional. Vazio = sem data de início.
                  </FieldDescription>
                </Field>
              )}
            </form.Field>
            <form.Field
              name="endsAt"
              validators={{
                onChangeListenTo: ["startsAt"],
                onChange: ({ value, fieldApi }: any) => {
                  const startsAt = fieldApi.form.getFieldValue("startsAt");

                  // Datas ISO `YYYY-MM-DD` comparam em ordem lexicográfica.
                  if (value && startsAt && value < startsAt)
                    return { message: "A data final não pode ser anterior à data inicial." };

                  return undefined;
                },
              }}
            >
              {(field: any) => (
                <Field data-invalid={invalid(field)}>
                  <FieldLabel htmlFor={field.name}>Fim</FieldLabel>
                  <DatePicker
                    id={field.name}
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    invalid={invalid(field)}
                    minDate={COUPON_MIN_DATE}
                    maxDate={COUPON_MAX_DATE}
                    defaultMonth={COUPON_DEFAULT_MONTH}
                    describedBy={describedBy(field, field.name)}
                  />
                  <FieldDescription id={`${field.name}-description`}>
                    Opcional. Vazio = sem data de término.
                  </FieldDescription>
                  {error(field, field.name)}
                </Field>
              )}
            </form.Field>
          </div>
          <form.Field name="status">
            {(field: any) => (
              <Field>
                <FieldTitle id={`${field.name}-label`}>Status</FieldTitle>
                <ToggleGroup
                  variant="outline"
                  aria-labelledby={`${field.name}-label`}
                  value={[field.state.value]}
                  onValueChange={(next: string[]) => {
                    if (next[0]) field.handleChange(next[0]);
                  }}
                >
                  {(mode === "edit" ? COUPON_STATUS_ITEMS_EDIT : COUPON_STATUS_ITEMS_CREATE).map(
                    (option) => (
                      <ToggleGroupItem key={option.value} value={option.value}>
                        {option.label}
                      </ToggleGroupItem>
                    ),
                  )}
                </ToggleGroup>
              </Field>
            )}
          </form.Field>
          <div className="flex flex-wrap gap-4">
            <form.Field name="stackable">
              {(field: any) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id={field.name}
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                  />
                  <FieldLabel htmlFor={field.name}>
                    Permite empilhamento com outros cupons
                  </FieldLabel>
                </Field>
              )}
            </form.Field>
            <form.Field name="firstPurchaseOnly">
              {(field: any) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id={field.name}
                    checked={field.state.value}
                    onCheckedChange={(checked: boolean) => {
                      field.handleChange(checked);
                      // "Uso único por cliente" and a per-customer limit are the
                      // same rule, so the checkbox owns the number.
                      form.setFieldValue("perCustomerLimit", checked ? 1 : undefined);
                    }}
                  />
                  <FieldLabel htmlFor={field.name}>Uso único por cliente</FieldLabel>
                </Field>
              )}
            </form.Field>
          </div>
        </FieldGroup>
      </FormSection>
    </>
  );
}

/** Submit handler shared by both forms: blocks native validation and focuses the first error. */
function submitWithFocus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any,
  event: FormEvent<HTMLFormElement>,
) {
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

export function CouponCreateForm({ storeSlug }: { storeSlug: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (values: any) => client().panel.createCoupon(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tenant", storeSlug, "coupons"] });
      router.push(`/dashboard/${storeSlug}/coupons`);
      router.refresh();
    },
    onError: (error) => setServerError(serverMessage(error, GENERIC_CREATE_ERROR)),
  });

  const form = useForm({
    defaultValues: {
      storeSlug,
      code: "",
      description: undefined,
      discountType: "percentage",
      discountValue: 10,
      usageLimit: undefined,
      perCustomerLimit: undefined,
      minimumOrderCents: undefined,
      maximumDiscountCents: undefined,
      shippingDiscountPercent: undefined,
      startsAt: undefined,
      endsAt: undefined,
      stackable: false,
      firstPurchaseOnly: false,
      status: "active",
    },
    validators: {
      onSubmit: createCouponSchema,
      onBlur: createCouponSchema,
    },
    onSubmit: async ({ value }) => {
      setServerError(null);
      await mutation.mutateAsync(value);
    },
  });

  return (
    <form
      className="flex w-full max-w-3xl flex-col gap-6"
      onSubmit={(event) => submitWithFocus(form, event)}
    >
      <form.Subscribe selector={(state: any) => state.isSubmitted}>
        {(submitted: boolean) => (
          <CouponFormFields form={form} mode="create" submitted={submitted} />
        )}
      </form.Subscribe>
      {serverError ? (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível criar o cupom</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <form.Subscribe selector={(state: any) => state.isSubmitting}>
          {(isSubmitting: boolean) => (
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {isSubmitting || mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              Criar cupom
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}

export function CouponEditForm({
  storeSlug,
  coupon,
}: {
  storeSlug: string;
  coupon: PanelCouponType;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (values: any) =>
      client().panel.updateCoupon({ ...values, storeSlug, couponId: coupon.id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tenant", storeSlug, "coupons"] });
      router.push(`/dashboard/${storeSlug}/coupons`);
      router.refresh();
    },
    onError: (error) => setServerError(serverMessage(error, GENERIC_UPDATE_ERROR)),
  });

  const form = useForm({
    defaultValues: {
      storeSlug,
      couponId: coupon.id,
      code: coupon.code,
      description: coupon.description ?? undefined,
      discountType: coupon.discountType,
      discountValue: splitValue(coupon),
      usageLimit: coupon.usageLimit ?? undefined,
      // "Uso único por cliente" means a per-customer limit of 1, so a legacy row
      // that has the flag without the number loads as 1 instead of blank.
      perCustomerLimit: coupon.firstPurchaseOnly ? 1 : (coupon.perCustomerLimit ?? undefined),
      minimumOrderCents: coupon.minimumOrderCents ?? undefined,
      maximumDiscountCents: coupon.maximumDiscountCents ?? undefined,
      shippingDiscountPercent: coupon.shippingDiscountPercent ?? undefined,
      startsAt: coupon.startsAt?.slice(0, 10),
      endsAt: coupon.endsAt?.slice(0, 10),
      stackable: coupon.stackable,
      firstPurchaseOnly: coupon.firstPurchaseOnly,
      status: coupon.status,
    },
    validators: {
      onSubmit: updateCouponSchema,
      onBlur: updateCouponSchema,
    },
    onSubmit: async ({ value }) => {
      setServerError(null);
      await mutation.mutateAsync(value);
    },
  });

  return (
    <form
      className="flex w-full max-w-3xl flex-col gap-6"
      onSubmit={(event) => submitWithFocus(form, event)}
    >
      <form.Subscribe selector={(state: any) => state.isSubmitted}>
        {(submitted: boolean) => <CouponFormFields form={form} mode="edit" submitted={submitted} />}
      </form.Subscribe>
      {serverError ? (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível salvar o cupom</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Voltar
        </Button>
        <form.Subscribe selector={(state: any) => state.isSubmitting}>
          {(isSubmitting: boolean) => (
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {isSubmitting || mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              Salvar cupom
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
