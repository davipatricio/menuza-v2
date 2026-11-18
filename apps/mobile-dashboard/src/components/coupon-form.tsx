import type {
  CouponInput,
  CouponProductScopeMode,
  DiscountType,
  PanelCouponSummary,
} from "@menuza/api-client/model";
import type { ReactNode } from "react";
import { useState } from "react";
import { Text, View } from "react-native";

import type { ChipOption } from "@/components/form.tsx";
import { ChipGroup, FormScreen, SwitchRow, TextField } from "@/components/form.tsx";
import { useUnsavedChangesGuard } from "@/lib/navigation.ts";

/**
 * The coupon editor shared by create and edit.
 *
 * The API replaces every field on update, so the draft carries the two values
 * this form does not show (`usageLimit`, `stackable`) and the freight cut: the
 * edit screen seeds them from the coupon and sends them back untouched, rather
 * than clearing them behind the operator's back.
 */
export interface CouponFormValues {
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: string;
  minimumOrder: string;
  maximumDiscount: string;
  perCustomerLimit: string;
  firstPurchaseOnly: boolean;
  startsAt: string;
  endsAt: string;
  active: boolean;
  productScopeMode: CouponProductScopeMode;
  productIds: string;
  kitIds: string;
  usageLimit: number | null;
  shippingDiscountPercent: number | null;
  stackable: boolean;
}

const DISCOUNT_TYPE_OPTIONS: readonly ChipOption<DiscountType>[] = [
  { value: "percentage", label: "Percentual" },
  { value: "fixed", label: "Valor fixo" },
];

const SCOPE_OPTIONS: readonly ChipOption<CouponProductScopeMode>[] = [
  { value: "include", label: "Somente os produtos listados" },
  { value: "exclude", label: "Todos, exceto os listados" },
];

export const EMPTY_COUPON_FORM: CouponFormValues = {
  code: "",
  description: "",
  discountType: "percentage",
  discountValue: "10",
  minimumOrder: "",
  maximumDiscount: "",
  perCustomerLimit: "",
  firstPurchaseOnly: false,
  startsAt: "",
  endsAt: "",
  active: true,
  productScopeMode: "include",
  productIds: "",
  kitIds: "",
  usageLimit: null,
  shippingDiscountPercent: null,
  stackable: false,
};

export function couponFormValues(coupon: PanelCouponSummary): CouponFormValues {
  const fixed = coupon.discountType === "fixed";

  return {
    code: coupon.code,
    description: coupon.description ?? "",
    discountType: coupon.discountType,
    discountValue: fixed ? centsToText(coupon.valueCents ?? 0) : String(coupon.valuePercent ?? ""),
    minimumOrder: coupon.minimumOrderCents === null ? "" : centsToText(coupon.minimumOrderCents),
    maximumDiscount:
      coupon.maximumDiscountCents === null ? "" : centsToText(coupon.maximumDiscountCents),
    perCustomerLimit: coupon.perCustomerLimit === null ? "" : String(coupon.perCustomerLimit),
    firstPurchaseOnly: coupon.firstPurchaseOnly,
    startsAt: coupon.startsAt?.slice(0, 10) ?? "",
    endsAt: coupon.endsAt?.slice(0, 10) ?? "",
    active: coupon.status === "active",
    productScopeMode: coupon.productScopeMode,
    productIds: coupon.productIds.join(", "),
    kitIds: coupon.kitIds.join(", "),
    usageLimit: coupon.usageLimit,
    shippingDiscountPercent: coupon.shippingDiscountPercent,
    stackable: coupon.stackable,
  };
}

/** `1550` → `15,50`, the pt-BR text the money fields edit. */
function centsToText(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** `undefined` is an empty optional field, `null` is text the parse refused. */
function parseCents(input: string): number | null | undefined {
  const cleaned = input
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\s+/g, "");

  if (cleaned === "") return undefined;

  if (/^\d+(,\d{1,2})?$/.test(cleaned) || /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(cleaned)) {
    return Math.round(Number(cleaned.replace(/\./g, "").replace(",", ".")) * 100);
  }

  if (/^\d+(\.\d{1,2})?$/.test(cleaned)) return Math.round(Number(cleaned) * 100);

  return null;
}

/** A positive whole number; `undefined` is empty, `null` is invalid. */
function parseLimit(input: string): number | null | undefined {
  const trimmed = input.trim();

  if (trimmed === "") return undefined;

  if (!/^\d+$/.test(trimmed)) return null;

  const value = Number(trimmed);

  return value >= 1 ? value : null;
}

/** `AAAA-MM-DD`, and a real calendar day (the API widens it to the day bounds). */
function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function splitIds(input: string): string[] {
  return input
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
}

type CouponDraft = { input: CouponInput } | { problem: string };

/** The form's text turned into the contract's payload, or the first problem found. */
function couponDraft(values: CouponFormValues): CouponDraft {
  const code = values.code.trim().toUpperCase();

  if (code === "" || code.length > 64) {
    return { problem: "Informe um código de 1 a 64 caracteres." };
  }

  const discountValue =
    values.discountType === "percentage"
      ? parseLimit(values.discountValue)
      : parseCents(values.discountValue);

  if (discountValue === undefined || discountValue === null) {
    return {
      problem:
        values.discountType === "percentage"
          ? "O percentual precisa ser um número inteiro de 1 a 100."
          : "Informe o valor do desconto em reais, por exemplo 15,00.",
    };
  }

  if (values.discountType === "percentage" && discountValue > 100) {
    return { problem: "O percentual precisa ser um número inteiro de 1 a 100." };
  }

  const minimum = parseCents(values.minimumOrder);
  const maximum = parseCents(values.maximumDiscount);
  const perCustomer = parseLimit(values.perCustomerLimit);

  if (minimum === null) {
    return { problem: "O pedido mínimo precisa ser um valor em reais, por exemplo 30,00." };
  }

  if (maximum === null) {
    return { problem: "O desconto máximo precisa ser um valor em reais, por exemplo 20,00." };
  }

  if (perCustomer === null) {
    return { problem: "O limite por cliente precisa ser um número inteiro maior que zero." };
  }

  const startsAt = values.startsAt.trim();
  const endsAt = values.endsAt.trim();

  if (startsAt !== "" && !isIsoDate(startsAt)) {
    return { problem: "A data de início precisa estar no formato AAAA-MM-DD." };
  }

  if (endsAt !== "" && !isIsoDate(endsAt)) {
    return { problem: "A data de término precisa estar no formato AAAA-MM-DD." };
  }

  if (startsAt !== "" && endsAt !== "" && endsAt < startsAt) {
    return { problem: "A data de término não pode ser anterior à data de início." };
  }

  return {
    input: {
      code,
      description: values.description.trim() === "" ? null : values.description.trim(),
      discountType: values.discountType,
      discountValue,
      endsAt: endsAt === "" ? null : endsAt,
      firstPurchaseOnly: values.firstPurchaseOnly,
      kitIds: splitIds(values.kitIds),
      maximumDiscountCents: maximum ?? null,
      minimumOrderCents: minimum ?? null,
      perCustomerLimit: perCustomer ?? null,
      productIds: splitIds(values.productIds),
      productScopeMode: values.productScopeMode,
      shippingDiscountPercent: values.shippingDiscountPercent,
      stackable: values.stackable,
      startsAt: startsAt === "" ? null : startsAt,
      status: values.active ? "active" : "disabled",
      usageLimit: values.usageLimit,
    },
  };
}

export function CouponEditor({
  title,
  initial,
  saveLabel,
  onSubmit,
  saving,
  error,
  saved,
}: {
  title: string;
  initial: CouponFormValues;
  saveLabel: string;
  onSubmit: (input: CouponInput) => void;
  saving: boolean;
  error?: string | null;
  saved?: boolean;
}) {
  const [values, setValues] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useUnsavedChangesGuard(dirty && !saved);

  function change<K extends keyof CouponFormValues>(key: K, value: CouponFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setProblem(null);
  }

  // The two discount units share one number, so the switch converts the text
  // instead of leaving R$ 15,00 looking like 1.500%.
  function changeDiscountType(next: DiscountType) {
    if (next === values.discountType) return;

    const cents = parseCents(values.discountValue);
    const readable = cents === undefined || cents === null ? 1000 : cents;
    const percent = Math.min(100, Math.max(1, Math.round(readable / 100)));
    const converted = next === "percentage" ? String(percent) : centsToText(readable);

    setValues((current) => ({ ...current, discountType: next, discountValue: converted }));
    setDirty(true);
    setProblem(null);
  }

  function save() {
    const draft = couponDraft(values);

    if ("problem" in draft) {
      setProblem(draft.problem);

      return;
    }

    setProblem(null);
    onSubmit(draft.input);
  }

  return (
    <FormScreen
      error={problem ?? error}
      onSave={save}
      saveLabel={saveLabel}
      saved={saved}
      saving={saving}
      title={title}
    >
      <FormSection title="Identificação">
        <TextField
          autoCapitalize="none"
          autoCorrect={false}
          hint="Até 64 caracteres. Salvo em maiúsculas."
          label="Código"
          maxLength={64}
          onChangeText={(value) => change("code", value)}
          placeholder="PROMO10"
          value={values.code}
        />
        <TextField
          hint="Opcional, uso interno da equipe. Até 280 caracteres."
          label="Descrição"
          maxLength={280}
          multiline
          onChangeText={(value) => change("description", value)}
          value={values.description}
        />
        <SwitchRow
          description="Desativado deixa de aceitar resgates."
          label="Ativo"
          onValueChange={(value) => change("active", value)}
          value={values.active}
        />
      </FormSection>

      <FormSection title="Desconto">
        <ChipGroup
          label="Tipo de desconto"
          onChange={changeDiscountType}
          options={DISCOUNT_TYPE_OPTIONS}
          value={values.discountType}
        />
        <TextField
          autoCorrect={false}
          hint={
            values.discountType === "percentage"
              ? "Número inteiro de 1 a 100."
              : "Valor em reais, por exemplo 15,00."
          }
          keyboardType={values.discountType === "percentage" ? "numeric" : "decimal-pad"}
          label={
            values.discountType === "percentage"
              ? "Valor do desconto (%)"
              : "Valor do desconto (R$)"
          }
          onChangeText={(value) => change("discountValue", value)}
          placeholder={values.discountType === "percentage" ? "10" : "15,00"}
          value={values.discountValue}
        />
        <TextField
          autoCorrect={false}
          hint="Opcional. Vazio = sem mínimo."
          keyboardType="decimal-pad"
          label="Pedido mínimo (R$)"
          onChangeText={(value) => change("minimumOrder", value)}
          placeholder="0,00"
          value={values.minimumOrder}
        />
        <TextField
          autoCorrect={false}
          hint="Opcional. Vazio = sem teto. Só se aplica ao desconto percentual."
          keyboardType="decimal-pad"
          label="Desconto máximo (R$)"
          onChangeText={(value) => change("maximumDiscount", value)}
          placeholder="0,00"
          value={values.maximumDiscount}
        />
      </FormSection>

      <FormSection title="Limites e validade">
        <TextField
          autoCorrect={false}
          hint="Opcional. Vazio = ilimitado."
          keyboardType="numeric"
          label="Limite por cliente"
          onChangeText={(value) => change("perCustomerLimit", value)}
          placeholder="1"
          value={values.perCustomerLimit}
        />
        <SwitchRow
          description="Restringe o cupom ao primeiro pedido do cliente."
          label="Somente na primeira compra"
          onValueChange={(value) => change("firstPurchaseOnly", value)}
          value={values.firstPurchaseOnly}
        />
        <TextField
          autoCapitalize="none"
          autoCorrect={false}
          hint="Opcional, no formato AAAA-MM-DD. Vazio = sem data de início."
          label="Início"
          maxLength={10}
          onChangeText={(value) => change("startsAt", value)}
          placeholder="2026-12-01"
          value={values.startsAt}
        />
        <TextField
          autoCapitalize="none"
          autoCorrect={false}
          hint="Opcional, no formato AAAA-MM-DD. Vazio = sem data de término."
          label="Fim"
          maxLength={10}
          onChangeText={(value) => change("endsAt", value)}
          placeholder="2026-12-31"
          value={values.endsAt}
        />
      </FormSection>

      <FormSection title="Produtos e kits">
        <ChipGroup
          label="Aplicação"
          onChange={(value) => change("productScopeMode", value)}
          options={SCOPE_OPTIONS}
          value={values.productScopeMode}
        />
        <TextField
          autoCapitalize="none"
          autoCorrect={false}
          hint="Opcional. IDs separados por vírgula. Vazio = todos os produtos."
          label="Produtos (IDs)"
          onChangeText={(value) => change("productIds", value)}
          placeholder="id-1, id-2"
          value={values.productIds}
        />
        <TextField
          autoCapitalize="none"
          autoCorrect={false}
          hint="Opcional. IDs separados por vírgula."
          label="Kits (IDs)"
          onChangeText={(value) => change("kitIds", value)}
          placeholder="id-1, id-2"
          value={values.kitIds}
        />
      </FormSection>
    </FormScreen>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text className="text-sm font-semibold text-foreground">{title}</Text>
      <View className="gap-4 rounded-xl border border-border bg-card p-4">{children}</View>
    </View>
  );
}
