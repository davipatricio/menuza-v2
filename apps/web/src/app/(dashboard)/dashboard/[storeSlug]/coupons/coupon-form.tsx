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
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardAction,
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
import { Switch } from "@/components/ui/switch.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { DatePicker } from "../../signup/_components/date-picker.tsx";
import { fieldErrors } from "../../signup/_components/form-errors.ts";
import { formatBrlInput, maskBrlInput, maskIntegerInput, parseBrlToCents } from "@/lib/format.ts";
import { CreateCouponInputSchema, UpdateCouponInputSchema } from "@menuza/shared/tenant";
import type { PanelCouponSummary } from "@menuza/shared/tenant";
import { CouponProductPicker, type ProductOption } from "./coupon-product-picker.tsx";

type PanelCouponType = PanelCouponSummary;

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
  badge,
  children,
}: {
  title: string;
  description?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {badge ? <CardAction>{badge}</CardAction> : null}
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

// Same reading as the server's `effectiveCouponStatus`: the window is a pair of
// UTC wall-clock days and an end date runs through 23:59:59, so it is only
// expired once its own day is behind the clock.
const TODAY_ISO = TODAY.toISOString().slice(0, 10);

function endDateHasPassed(endsAt: string | undefined): boolean {
  return endsAt !== undefined && endsAt !== "" && endsAt < TODAY_ISO;
}

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
  describedBy,
}: {
  id?: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  onBlur?: () => void;
  placeholder?: string;
  describedBy?: string;
}) {
  return (
    <Input
      id={id}
      className="max-w-[14rem]"
      type="text"
      inputMode="numeric"
      autoComplete="off"
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

function splitValue(coupon: PanelCouponSummary) {
  return coupon.discountType === "fixed" ? (coupon.valueCents ?? 0) : (coupon.valuePercent ?? 0);
}

/**
 * Future coupon rules. Rendered as disabled "Em breve" cards: no fields, no
 * payload keys, nothing reaches the submit handler.
 */
const FUTURE_SECTIONS = [
  {
    title: "Regiões válidas",
    body: "Restrinja o cupom a bairros, cidades, raio ou faixa de CEP.",
  },
  {
    title: "Requisitos",
    body: "Conta criada há mais de X dias, mais de X pedidos, conta criada antes ou depois de uma data e valor mínimo de pedido.",
  },
];

function CouponFormFields({
  form,
  submitted,
  products,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any;
  submitted: boolean;
  products: ProductOption[];
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

          <form.Field name="status">
            {(field: any) => (
              <Field orientation="horizontal" className="flex-wrap">
                <Switch
                  id="status"
                  name="status"
                  checked={field.state.value === "active"}
                  onCheckedChange={(checked) => field.handleChange(checked ? "active" : "disabled")}
                  aria-label="Ativo"
                  aria-describedby="status-description"
                />
                <FieldLabel htmlFor="status">Ativo</FieldLabel>
                <FieldDescription id="status-description" className="w-full">
                  Desativado deixa de aceitar resgates.
                </FieldDescription>
              </Field>
            )}
          </form.Field>

          <form.Subscribe selector={(state: any) => state.values.endsAt}>
            {(endsAt: string | undefined) =>
              endDateHasPassed(endsAt) ? (
                <p className="text-sm text-muted-foreground">
                  A data de término já passou: o cupom será salvo como expirado.
                </p>
              ) : null
            }
          </form.Subscribe>
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

      <FormSection title="Limites e validade" description="Controle de uso e prazo.">
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
            <form.Field name="perCustomerLimit">
              {(field: any) => (
                <Field data-invalid={invalid(field)}>
                  <FieldLabel htmlFor={field.name}>Limite por cliente</FieldLabel>
                  <IntegerInput
                    id={field.name}
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    placeholder="1"
                    describedBy={`${field.name}-description`}
                  />
                  <FieldDescription id={`${field.name}-description`}>
                    Opcional. Vazio = ilimitado.
                  </FieldDescription>
                </Field>
              )}
            </form.Field>
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
                <Field orientation="horizontal" className="flex-wrap">
                  <Switch
                    id={field.name}
                    name={field.name}
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                    aria-label="Primeira compra"
                    aria-describedby={`${field.name}-description`}
                  />
                  <FieldLabel htmlFor={field.name}>Primeira compra</FieldLabel>
                  <FieldDescription id={`${field.name}-description`} className="w-full">
                    Restringe o cupom ao primeiro pedido do cliente. Independente do limite por
                    cliente.
                  </FieldDescription>
                </Field>
              )}
            </form.Field>
          </div>
        </FieldGroup>
      </FormSection>

      <FormSection
        title="Produtos válidos"
        description="Escopo opcional. Sem produtos selecionados, o cupom vale para todos os produtos da loja. Até 200 produtos."
      >
        <FieldGroup className="gap-4">
          <form.Field name="productScopeMode">
            {(field: any) => (
              <Field orientation="horizontal" className="flex-wrap">
                <Switch
                  id={field.name}
                  name={field.name}
                  checked={field.state.value === "exclude"}
                  onCheckedChange={(checked) => field.handleChange(checked ? "exclude" : "include")}
                  aria-label="Bloquear uso em produtos específicos"
                  aria-describedby={`${field.name}-description`}
                />
                <FieldLabel htmlFor={field.name}>Bloquear uso em produtos específicos</FieldLabel>
                <FieldDescription id={`${field.name}-description`} className="w-full">
                  {field.state.value === "exclude"
                    ? "Vale para todos os produtos, exceto os listados."
                    : "Vale só para os produtos listados."}
                </FieldDescription>
              </Field>
            )}
          </form.Field>

          <form.Field name="productIds">
            {(field: any) => (
              <Field data-invalid={invalid(field)}>
                <FieldLabel htmlFor={field.name}>Produtos</FieldLabel>
                <CouponProductPicker
                  id={field.name}
                  products={products}
                  value={field.state.value}
                  onChange={field.handleChange}
                  invalid={invalid(field)}
                  describedBy={describedBy(field, field.name)}
                  className="w-full"
                />
                <FieldDescription id={`${field.name}-description`}>
                  Busque pelo nome e selecione um ou mais produtos. Remova um chip pelo X ou com
                  Backspace.
                </FieldDescription>
                {error(field, field.name)}
              </Field>
            )}
          </form.Field>
        </FieldGroup>
      </FormSection>

      {FUTURE_SECTIONS.map((section) => (
        <FormSection
          key={section.title}
          title={section.title}
          badge={
            <Badge variant="outline" className="text-muted-foreground">
              Em breve
            </Badge>
          }
        >
          <p data-disabled="true" className="text-sm text-pretty text-muted-foreground">
            {section.body}
          </p>
        </FormSection>
      ))}
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

export function CouponCreateForm({
  storeSlug,
  products,
}: {
  storeSlug: string;
  products: ProductOption[];
}) {
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
      productScopeMode: "include",
      productIds: [],
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
          <CouponFormFields form={form} submitted={submitted} products={products} />
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
  products,
}: {
  storeSlug: string;
  coupon: PanelCouponType;
  products: ProductOption[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (values: any) =>
      client().panel.updateCoupon({
        ...values,
        storeSlug,
        couponId: coupon.id,
        // Empty limit is an explicit "ilimitado", not an omitted key: the update
        // schema is optional-nullable, so send null.
        usageLimit: values.usageLimit ?? null,
        perCustomerLimit: values.perCustomerLimit ?? null,
      }),
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
      perCustomerLimit: coupon.perCustomerLimit ?? undefined,
      minimumOrderCents: coupon.minimumOrderCents ?? undefined,
      maximumDiscountCents: coupon.maximumDiscountCents ?? undefined,
      shippingDiscountPercent: coupon.shippingDiscountPercent ?? undefined,
      startsAt: coupon.startsAt?.slice(0, 10),
      endsAt: coupon.endsAt?.slice(0, 10),
      stackable: coupon.stackable,
      firstPurchaseOnly: coupon.firstPurchaseOnly,
      status: coupon.status === "active" ? "active" : "disabled",
      productScopeMode: coupon.productScopeMode,
      productIds: coupon.productIds,
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
        {(submitted: boolean) => (
          <CouponFormFields form={form} submitted={submitted} products={products} />
        )}
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
