"use client";

/**
 * Aba "Tabela nutricional" do editor de produto.
 *
 * O estado do formulário fica nas unidades que a pessoa digita: gramas para os
 * macros, kcal para a energia, mg para o sódio e gramas (ou mL) para a porção.
 * A conversão para a menor unidade que o contrato guarda — mg inteiros e
 * milésimos de grama — acontece só em `payloadOf`, na hora de salvar e de
 * montar a prévia. Tela e loja nunca discordam porque as duas chamam
 * `buildNutritionLabel`.
 */
import { useState, type FormEvent } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import { useMutation } from "@tanstack/react-query";
import { CircleHelp, TriangleAlert } from "lucide-react";
import * as v from "valibot";
import {
  FRONT_OF_PACK_RULES,
  NUTRIENTS,
  basisUnit,
  buildNutritionLabel,
  formatAmount,
  frontOfPackThreshold,
  isFrontOfPackRecommended,
} from "@menuza/shared/nutrition";
import type {
  FrontOfPackKey,
  FrontOfPackRule,
  NutrientKey,
  NutritionInput,
  NutritionRowModel,
  NutritionView,
  NutritionViewMode,
} from "@menuza/shared/nutrition";
import {
  NutritionBasisSchema,
  NutritionLabelFormatSchema,
  NutritionSourceSchema,
  tenantContractObject,
} from "@menuza/shared/tenant";
import type {
  NutritionBasis,
  NutritionLabelFormat,
  NutritionSource,
  PanelProductNutrition,
} from "@menuza/shared/tenant";
import { NutritionLabel } from "@/components/nutrition/nutrition-label.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
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
import { formatNutrient, formatPercent } from "@/lib/format.ts";
import {
  NUTRITION_BASIS_LABELS,
  NUTRITION_LABEL_FORMAT_LABELS,
  NUTRITION_SOURCE_LABELS,
} from "@/lib/panel-labels.ts";
import { fieldErrors } from "../../../../signup/_components/form-errors.ts";
import { useDirtySection } from "../product-editor-guard.tsx";

type ContractClient = RouterContractClient<typeof tenantContractObject>;

function client() {
  return createORPCClient<ContractClient>(new RPCLink({ url: "/tenant/rpc" }));
}

const GENERIC_SAVE_ERROR = "Não foi possível salvar a tabela nutricional. Tente novamente.";

const BASES: readonly NutritionBasis[] = ["solid", "liquid"];

const LABEL_FORMATS: readonly NutritionLabelFormat[] = ["vertical", "simplified"];

const SOURCES: readonly NutritionSource[] = [
  "manual",
  "lab",
  "supplier_label",
  "database",
  "estimate",
];

/** Os três modos da prévia, na ordem em que o grupo aparece. */
const PREVIEW_MODES: readonly { value: NutritionViewMode; label: string }[] = [
  { value: "portion", label: "Porção" },
  { value: "per100", label: "100" },
  { value: "custom", label: "Personalizada" },
];

/** O substantivo da frase da lupa; o rótulo da regra é singular e sem artigo. */
const FRONT_OF_PACK_NOUNS: Record<FrontOfPackKey, string> = {
  addedSugar: "açúcares adicionados",
  satFat: "gorduras saturadas",
  sodium: "sódio",
};

/**
 * `energyKcal` não converte; os macros viajam em gramas na tela e em mg no
 * contrato; o sódio já é mg nos dois lados.
 */
type NutrientFieldName =
  | "energyKcal"
  | "carbsG"
  | "totalSugarsG"
  | "addedSugarsG"
  | "proteinG"
  | "totalFatG"
  | "saturatedFatG"
  | "transFatG"
  | "fiberG"
  | "sodiumMg";

type NutrientFieldSpec = {
  key: NutrientKey;
  field: NutrientFieldName;
  unit: "kcal" | "g" | "mg";
  /** Casas aceitas na digitação: inteiro para kcal/mg, milésimo para gramas. */
  decimals: number;
};

/** A ordem declarada da IN 75, que é a ordem em que a tabela é impressa. */
const NUTRIENT_FIELDS: readonly NutrientFieldSpec[] = [
  { key: "energyKcal", field: "energyKcal", unit: "kcal", decimals: 0 },
  { key: "carbsMg", field: "carbsG", unit: "g", decimals: 3 },
  { key: "totalSugarsMg", field: "totalSugarsG", unit: "g", decimals: 3 },
  { key: "addedSugarsMg", field: "addedSugarsG", unit: "g", decimals: 3 },
  { key: "proteinMg", field: "proteinG", unit: "g", decimals: 3 },
  { key: "totalFatMg", field: "totalFatG", unit: "g", decimals: 3 },
  { key: "saturatedFatMg", field: "saturatedFatG", unit: "g", decimals: 3 },
  { key: "transFatMg", field: "transFatG", unit: "g", decimals: 3 },
  { key: "fiberMg", field: "fiberG", unit: "g", decimals: 3 },
  { key: "sodiumMg", field: "sodiumMg", unit: "mg", decimals: 0 },
];

/** O estado do formulário, nas unidades de exibição. */
type NutritionFormValues = {
  basis: NutritionBasis;
  labelFormat: NutritionLabelFormat;
  source: NutritionSource;
  portionGrams: number | null;
  householdMeasure: string;
  servingsPerPack: number | null;
  energyKcal: number | null;
  carbsG: number | null;
  totalSugarsG: number | null;
  addedSugarsG: number | null;
  proteinG: number | null;
  totalFatG: number | null;
  saturatedFatG: number | null;
  transFatG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
  showHighAddedSugar: boolean;
  showHighSatFat: boolean;
  showHighSodium: boolean;
  published: boolean;
  notes: string;
};

/** O mesmo conteúdo no formato que o contrato entende (mg, milésimos). */
type NutritionPayload = {
  basis: NutritionBasis;
  labelFormat: NutritionLabelFormat;
  source: NutritionSource;
  energyKcal: number | null;
  carbsMg: number | null;
  totalSugarsMg: number | null;
  addedSugarsMg: number | null;
  proteinMg: number | null;
  totalFatMg: number | null;
  saturatedFatMg: number | null;
  transFatMg: number | null;
  fiberMg: number | null;
  sodiumMg: number | null;
  portionMilli: number | null;
  householdMeasure: string | null;
  servingsPerPack: number | null;
  showHighAddedSugar: boolean;
  showHighSatFat: boolean;
  showHighSodium: boolean;
  published: boolean;
  notes: string | null;
};

type NumberFieldApi = {
  state: {
    value: number | null;
    meta: { isTouched: boolean; isValid: boolean; errors: ReadonlyArray<unknown> };
  };
  handleChange: (value: number | null) => void;
  handleBlur: () => void;
};

type FieldLike = {
  state: { meta: { isTouched: boolean; isValid: boolean; errors: ReadonlyArray<unknown> } };
};

/**
 * O contrato valida o payload em mg; o formulário digita em gramas, então o
 * schema abaixo é o mesmo conjunto de regras nas unidades da tela.
 */
const nutrientValue = v.nullable(
  v.pipe(v.number("Informe um número válido."), v.minValue(0, "O valor não pode ser negativo.")),
);

const portionValue = v.nullable(
  v.pipe(
    v.number("Informe um número válido."),
    v.minValue(0.001, "A porção deve ser maior que zero."),
  ),
);

const servingsValue = v.nullable(
  v.pipe(
    v.number("Informe um número válido."),
    v.integer("Use um número inteiro."),
    v.minValue(1, "Informe ao menos uma porção por embalagem."),
  ),
);

const NutritionFormSchema = v.pipe(
  v.object({
    basis: NutritionBasisSchema,
    labelFormat: NutritionLabelFormatSchema,
    source: NutritionSourceSchema,
    portionGrams: portionValue,
    householdMeasure: v.pipe(v.string(), v.maxLength(80, "Use no máximo 80 caracteres.")),
    servingsPerPack: servingsValue,
    energyKcal: nutrientValue,
    carbsG: nutrientValue,
    totalSugarsG: nutrientValue,
    addedSugarsG: nutrientValue,
    proteinG: nutrientValue,
    totalFatG: nutrientValue,
    saturatedFatG: nutrientValue,
    transFatG: nutrientValue,
    fiberG: nutrientValue,
    sodiumMg: nutrientValue,
    showHighAddedSugar: v.boolean(),
    showHighSatFat: v.boolean(),
    showHighSodium: v.boolean(),
    published: v.boolean(),
    notes: v.pipe(v.string(), v.maxLength(500, "Use no máximo 500 caracteres.")),
  }),
  v.forward(
    v.check(
      (values) =>
        values.addedSugarsG === null ||
        values.totalSugarsG === null ||
        values.addedSugarsG <= values.totalSugarsG,
      "Açúcares adicionados não podem passar dos açúcares totais.",
    ),
    ["addedSugarsG"],
  ),
  v.forward(
    v.check((values) => {
      const { saturatedFatG, transFatG, totalFatG } = values;

      if (saturatedFatG === null || transFatG === null || totalFatG === null) return true;

      return saturatedFatG + transFatG <= totalFatG;
    }, "Saturadas e trans não podem passar das gorduras totais."),
    ["saturatedFatG"],
  ),
);

/** Todos os ids levam o prefixo: a aba Produto continua montada ao lado. */
function domId(name: string): string {
  return `nutrition-${name}`;
}

/** Gramas → mg inteiros, a unidade que o contrato guarda para os macros. */
function gramsToMg(grams: number | null): number | null {
  return grams === null ? null : Math.round(grams * 1000);
}

/** Gramas ou mL → milésimos, a unidade que o contrato guarda para a porção. */
function amountToMilli(amount: number | null): number | null {
  return amount === null ? null : Math.round(amount * 1000);
}

/** O caminho inverso, para reabrir o formulário a partir do que foi salvo. */
function milliToGrams(milli: number | null): number | null {
  return milli === null ? null : milli / 1000;
}

/**
 * O que a tabela tem antes do primeiro save: base sólida, formato vertical e
 * nenhum valor informado. `null` é "não informado", nunca um zero inventado
 * pela tela — um zero é uma declaração do rótulo.
 */
const EMPTY_NUTRITION = {
  basis: "solid",
  labelFormat: "vertical",
  source: "manual",
  energyKcal: null,
  carbsMg: null,
  totalSugarsMg: null,
  addedSugarsMg: null,
  proteinMg: null,
  totalFatMg: null,
  saturatedFatMg: null,
  transFatMg: null,
  fiberMg: null,
  sodiumMg: null,
  portionMilli: null,
  householdMeasure: null,
  servingsPerPack: null,
  showHighAddedSugar: false,
  showHighSatFat: false,
  showHighSodium: false,
  published: false,
  notes: null,
} satisfies Omit<PanelProductNutrition, "referenceAt" | "updatedAt">;

/** O que está salvo, nas unidades de exibição. */
function valuesFrom(nutrition: PanelProductNutrition | null): NutritionFormValues {
  const saved = nutrition ?? EMPTY_NUTRITION;

  return {
    basis: saved.basis,
    labelFormat: saved.labelFormat,
    source: saved.source,
    portionGrams: milliToGrams(saved.portionMilli),
    householdMeasure: saved.householdMeasure ?? "",
    servingsPerPack: saved.servingsPerPack,
    energyKcal: saved.energyKcal,
    carbsG: milliToGrams(saved.carbsMg),
    totalSugarsG: milliToGrams(saved.totalSugarsMg),
    addedSugarsG: milliToGrams(saved.addedSugarsMg),
    proteinG: milliToGrams(saved.proteinMg),
    totalFatG: milliToGrams(saved.totalFatMg),
    saturatedFatG: milliToGrams(saved.saturatedFatMg),
    transFatG: milliToGrams(saved.transFatMg),
    fiberG: milliToGrams(saved.fiberMg),
    sodiumMg: saved.sodiumMg,
    showHighAddedSugar: saved.showHighAddedSugar,
    showHighSatFat: saved.showHighSatFat,
    showHighSodium: saved.showHighSodium,
    published: saved.published,
    notes: saved.notes ?? "",
  };
}

/**
 * A única conversão de unidades do arquivo. Texto vazio vira `null`, que é
 * "não informado" e limpa o campo no contrato.
 */
function payloadOf(values: NutritionFormValues): NutritionPayload {
  const householdMeasure = values.householdMeasure.trim();
  const notes = values.notes.trim();

  return {
    basis: values.basis,
    labelFormat: values.labelFormat,
    source: values.source,
    energyKcal: values.energyKcal,
    carbsMg: gramsToMg(values.carbsG),
    totalSugarsMg: gramsToMg(values.totalSugarsG),
    addedSugarsMg: gramsToMg(values.addedSugarsG),
    proteinMg: gramsToMg(values.proteinG),
    totalFatMg: gramsToMg(values.totalFatG),
    saturatedFatMg: gramsToMg(values.saturatedFatG),
    transFatMg: gramsToMg(values.transFatG),
    fiberMg: gramsToMg(values.fiberG),
    sodiumMg: values.sodiumMg,
    portionMilli: amountToMilli(values.portionGrams),
    householdMeasure: householdMeasure === "" ? null : householdMeasure,
    servingsPerPack: values.servingsPerPack,
    showHighAddedSugar: values.showHighAddedSugar,
    showHighSatFat: values.showHighSatFat,
    showHighSodium: values.showHighSodium,
    published: values.published,
    notes: notes === "" ? null : notes,
  };
}

const PAYLOAD_KEYS = [
  "basis",
  "labelFormat",
  "source",
  "energyKcal",
  "carbsMg",
  "totalSugarsMg",
  "addedSugarsMg",
  "proteinMg",
  "totalFatMg",
  "saturatedFatMg",
  "transFatMg",
  "fiberMg",
  "sodiumMg",
  "portionMilli",
  "householdMeasure",
  "servingsPerPack",
  "showHighAddedSugar",
  "showHighSatFat",
  "showHighSodium",
  "published",
  "notes",
] as const;

/** Escreve uma chave de tipo união sem alargar o tipo do valor. */
function setPayloadKey<K extends keyof NutritionPayload>(
  patch: Partial<NutritionPayload>,
  key: K,
  value: NutritionPayload[K],
): void {
  patch[key] = value;
}

/**
 * Um patch parcial, como `updateProduct`: campo omitido mantém o que está
 * salvo, `null` limpa. Comparar os dois payloads já normaliza "" para `null`.
 */
function nutritionPatch(values: NutritionFormValues, baseline: NutritionFormValues) {
  const next = payloadOf(values);
  const before = payloadOf(baseline);
  const patch: Partial<NutritionPayload> = {};

  for (const key of PAYLOAD_KEYS) {
    if (next[key] !== before[key]) setPayloadKey(patch, key, next[key]);
  }

  return patch;
}

/** Só os campos que a tabela renderiza; `source` e `notes` ficam de fora. */
function labelInputOf(payload: NutritionPayload): NutritionInput {
  return {
    basis: payload.basis,
    labelFormat: payload.labelFormat,
    portionMilli: payload.portionMilli,
    householdMeasure: payload.householdMeasure,
    servingsPerPack: payload.servingsPerPack,
    energyKcal: payload.energyKcal,
    carbsMg: payload.carbsMg,
    totalSugarsMg: payload.totalSugarsMg,
    addedSugarsMg: payload.addedSugarsMg,
    proteinMg: payload.proteinMg,
    totalFatMg: payload.totalFatMg,
    saturatedFatMg: payload.saturatedFatMg,
    transFatMg: payload.transFatMg,
    fiberMg: payload.fiberMg,
    sodiumMg: payload.sodiumMg,
    showHighAddedSugar: payload.showHighAddedSugar,
    showHighSatFat: payload.showHighSatFat,
    showHighSodium: payload.showHighSodium,
  };
}

/** `1.5` vira `"1,5"`: o campo devolve o mesmo texto que recebeu. */
function numberText(value: number | null): string {
  if (value === null) return "";

  return String(Math.round(value * 1000) / 1000).replace(".", ",");
}

/** Máscara de digitação pt-BR: dígitos e uma vírgula, com `decimals` casas. */
function maskDecimalInput(raw: string, decimals: number): string {
  const cleaned = raw.replace(/[^\d.,]/g, "").replace(/\./g, ",");
  const [whole = "", ...rest] = cleaned.split(",");
  const integer = whole.replace(/^0+(?=\d)/, "");

  if (decimals === 0 || rest.length === 0) return integer;

  const fraction = rest.join("").slice(0, decimals);

  return `${integer === "" ? "0" : integer},${fraction}`;
}

/** `"1,5"` vira `1.5`; vazio vira `null`, que é "não informado". */
function parseDecimalInput(text: string): number | null {
  const normalized = text.replace(",", ".").trim();

  if (normalized === "" || normalized === ".") return null;

  const value = Number(normalized);

  return Number.isFinite(value) ? value : null;
}

function toBasis(value: string): NutritionBasis | null {
  return value === "solid" || value === "liquid" ? value : null;
}

function toLabelFormat(value: string): NutritionLabelFormat | null {
  return value === "vertical" || value === "simplified" ? value : null;
}

function toSource(value: string): NutritionSource | null {
  return SOURCES.find((source) => source === value) ?? null;
}

function toViewMode(value: string): NutritionViewMode | null {
  if (value === "portion" || value === "per100" || value === "custom") return value;

  return null;
}

/** Um erro aparece quando o campo foi tocado ou o formulário foi enviado. */
function fieldInvalid(field: FieldLike, submitted: boolean): boolean {
  return (field.state.meta.isTouched || submitted) && !field.state.meta.isValid;
}

function formatList(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";

  return `${labels.slice(0, -1).join(", ")} e ${labels.at(-1) ?? ""}`;
}

function nutrientLabel(key: NutrientKey): string {
  return NUTRIENTS.find((nutrient) => nutrient.key === key)?.label ?? key;
}

/** "Na porção: 11 g · 4% VD"; sem valor diário, diz que não há %VD. */
function nutrientDescription(row: NutritionRowModel | undefined, label: string): string {
  if (row === undefined || row.missing) return "Ainda não informado";

  const percent =
    row.percentDv === null ? `${label}: sem %VD` : `${formatPercent(row.percentDv)} VD`;

  if (row.view.value === null) {
    return `Informe a porção para ver o valor por porção · ${percent}`;
  }

  return `Na porção: ${formatNutrient(row.view.value, row.view.decimals)} ${row.unit} · ${percent}`;
}

/** mg (unidade do limiar) no texto que a regra declara: g ou mg. */
function thresholdText(rule: FrontOfPackRule, milliValue: number): string {
  if (rule.unit === "mg") return `${formatAmount(milliValue)} mg`;

  return `${formatAmount(milliValue / 1000)} g`;
}

/**
 * O texto da lupa. Os números vêm de `FRONT_OF_PACK_RULES`, então mudar a
 * Anexo XV no domínio muda a explicação junto, sem duplicar limiar na tela.
 */
function frontOfPackTooltip(rule: FrontOfPackRule): string {
  const solid = thresholdText(rule, frontOfPackThreshold(rule, "solid"));
  const liquid = thresholdText(rule, frontOfPackThreshold(rule, "liquid"));

  return `Mostre quando o produto for um alimento embalado e tiver ${solid} ou mais de ${FRONT_OF_PACK_NOUNS[rule.key]} por 100 g (${liquid} por 100 mL em líquidos). Em prato preparado no estabelecimento, não use esta lupa.`;
}

/** O valor atual contra o limiar, na base escolhida. */
function frontOfPackStatus(rule: FrontOfPackRule, input: NutritionInput): string {
  const unit = basisUnit(input.basis);
  const limit = thresholdText(rule, frontOfPackThreshold(rule, input.basis));
  const value = input[rule.field];

  if (value === null) return `Ainda não informado · limite de ${limit} por 100 ${unit}`;

  return `Atual: ${thresholdText(rule, value)} por 100 ${unit} · limite de ${limit}`;
}

function serverMessage(error: Error): string {
  if (error instanceof ORPCError) {
    if (error.code === "FORBIDDEN") {
      return "Você não tem permissão para editar a tabela nutricional nesta loja.";
    }

    if (error.code === "NOT_FOUND") return "Produto não encontrado nesta loja.";

    // The rules of the table (publishing checklist, sugar/fat ordering) answer
    // with the sentence that names the fix, so show it instead of a generic one.
    if (error.code === "BAD_REQUEST" || error.code === "VALIDATION_FAILED") {
      return error.message || "Revise os campos destacados e tente novamente.";
    }

    return GENERIC_SAVE_ERROR;
  }

  return error.message || GENERIC_SAVE_ERROR;
}

/** Bloqueia a validação nativa e foca o primeiro campo inválido após o submit. */
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

/**
 * Campo numérico com unidade. O texto digitado mora aqui para a vírgula
 * sobreviver entre teclas; o número parseado vai para o formulário.
 */
function DecimalField({
  field,
  name,
  label,
  unit,
  decimals,
  description,
  invalid,
}: {
  field: NumberFieldApi;
  name: string;
  label: string;
  unit?: string;
  decimals: number;
  description: string;
  invalid: boolean;
}) {
  const id = domId(name);
  const [text, setText] = useState(() => numberText(field.state.value));
  const describedBy = invalid ? `${id}-description ${id}-error` : `${id}-description`;

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup className="w-24 max-w-full">
        {unit === undefined ? null : <InputGroupAddon align="inline-end">{unit}</InputGroupAddon>}
        <InputGroupInput
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={text}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onChange={(event) => {
            const masked = maskDecimalInput(event.target.value, decimals);

            setText(masked);
            field.handleChange(parseDecimalInput(masked));
          }}
          onBlur={field.handleBlur}
        />
      </InputGroup>
      <FieldDescription id={`${id}-description`}>{description}</FieldDescription>
      {invalid ? (
        <FieldError id={`${id}-error`} errors={fieldErrors(field.state.meta.errors)} />
      ) : null}
    </Field>
  );
}

/** Uma lupa da rotulagem frontal: switch, explicação e recomendação. */
function FrontOfPackRow({
  rule,
  input,
  checked,
  onCheckedChange,
}: {
  rule: FrontOfPackRule;
  input: NutritionInput;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = domId(rule.showField);

  return (
    <Field>
      <div className="flex flex-wrap items-center gap-2">
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
        <FieldLabel htmlFor={id}>{`Alto em ${rule.label}`}</FieldLabel>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                aria-label={`Quando mostrar o alerta de ${FRONT_OF_PACK_NOUNS[rule.key]}`}
              />
            }
          >
            <CircleHelp data-icon aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent className="max-w-72 text-pretty">
            {frontOfPackTooltip(rule)}
          </TooltipContent>
        </Tooltip>
        {isFrontOfPackRecommended(rule, input) ? <Badge variant="secondary">Sugerido</Badge> : null}
      </div>
      <FieldDescription id={`${id}-description`}>{frontOfPackStatus(rule, input)}</FieldDescription>
    </Field>
  );
}

function BasePortionCard({
  form,
  submitted,
  basis,
}: {
  form: any;
  submitted: boolean;
  basis: NutritionBasis;
}) {
  const unit = basisUnit(basis);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Base e porção</CardTitle>
        <CardDescription>
          A tabela é declarada por 100 g ou por 100 mL; a porção é o que o cliente vê ao lado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <form.Field name="basis">
            {(field: any) => (
              <Field className="sm:col-span-2">
                <FieldTitle id={domId("basis-label")}>Base da tabela</FieldTitle>
                <ToggleGroup
                  variant="outline"
                  aria-labelledby={domId("basis-label")}
                  value={[field.state.value]}
                  onValueChange={(next: string[]) => {
                    const selected = toBasis(next[0] ?? "");

                    if (selected) field.handleChange(selected);
                  }}
                >
                  {BASES.map((option) => (
                    <ToggleGroupItem key={option} value={option}>
                      {NUTRITION_BASIS_LABELS[option]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldDescription>Líquidos usam 100 mL e a porção em mililitros.</FieldDescription>
              </Field>
            )}
          </form.Field>

          <form.Field name="portionGrams">
            {(field: any) => (
              <DecimalField
                field={field}
                name="portionGrams"
                label="Porção"
                unit={unit}
                decimals={3}
                description={`Quantidade de uma porção, em ${unit === "g" ? "gramas" : "mililitros"}.`}
                invalid={fieldInvalid(field, submitted)}
              />
            )}
          </form.Field>

          <form.Field name="servingsPerPack">
            {(field: any) => (
              <DecimalField
                field={field}
                name="servingsPerPack"
                label="Porções por embalagem"
                decimals={0}
                description="Quantas porções a embalagem rende."
                invalid={fieldInvalid(field, submitted)}
              />
            )}
          </form.Field>

          <form.Field name="householdMeasure">
            {(field: any) => (
              <Field className="sm:col-span-2" data-invalid={fieldInvalid(field, submitted)}>
                <FieldLabel htmlFor={domId("householdMeasure")}>Medida caseira</FieldLabel>
                <Input
                  className="max-w-48"
                  id={domId("householdMeasure")}
                  maxLength={80}
                  autoComplete="off"
                  value={field.state.value}
                  placeholder="Ex.: 1 fatia"
                  aria-invalid={fieldInvalid(field, submitted)}
                  aria-describedby={
                    fieldInvalid(field, submitted)
                      ? `${domId("householdMeasure")}-description ${domId("householdMeasure")}-error`
                      : `${domId("householdMeasure")}-description`
                  }
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
                <FieldDescription id={domId("householdMeasure-description")}>
                  Aparece entre parênteses na tabela: "Porção: 30 g (1 fatia)".
                </FieldDescription>
                {fieldInvalid(field, submitted) ? (
                  <FieldError
                    id={domId("householdMeasure-error")}
                    errors={fieldErrors(field.state.meta.errors)}
                  />
                ) : null}
              </Field>
            )}
          </form.Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function NutrientsCard({
  form,
  submitted,
  rows,
  unit,
}: {
  form: any;
  submitted: boolean;
  rows: readonly NutritionRowModel[];
  unit: "g" | "mL";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{`Nutrientes por 100 ${unit}`}</CardTitle>
        <CardDescription>
          Só os valores declarados aparecem na tabela. Deixe vazio o que a ficha técnica não traz.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          {NUTRIENT_FIELDS.map((spec) => (
            <form.Field key={spec.field} name={spec.field}>
              {(field: any) => (
                <DecimalField
                  field={field}
                  name={spec.field}
                  label={nutrientLabel(spec.key)}
                  unit={spec.unit}
                  decimals={spec.decimals}
                  description={nutrientDescription(
                    rows.find((row) => row.key === spec.key),
                    nutrientLabel(spec.key),
                  )}
                  invalid={fieldInvalid(field, submitted)}
                />
              )}
            </form.Field>
          ))}
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function FormatAndPublishCard({
  form,
  input,
  values,
  missing,
}: {
  form: any;
  input: NutritionInput;
  values: NutritionFormValues;
  missing: readonly string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Formato, alertas e publicação</CardTitle>
        <CardDescription>
          A lupa "Alto em" é a rotulagem frontal: vale para alimento embalado e é calculada por 100
          g ou 100 mL, nunca pela porção.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form.Field name="labelFormat">
          {(field: any) => (
            <Field>
              <FieldTitle id={domId("labelFormat-label")}>Formato da tabela</FieldTitle>
              <ToggleGroup
                variant="outline"
                aria-labelledby={domId("labelFormat-label")}
                value={[field.state.value]}
                onValueChange={(next: string[]) => {
                  const selected = toLabelFormat(next[0] ?? "");

                  if (selected) field.handleChange(selected);
                }}
              >
                {LABEL_FORMATS.map((option) => (
                  <ToggleGroupItem key={option} value={option}>
                    {NUTRITION_LABEL_FORMAT_LABELS[option]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription>
                O simplificado omite os constituintes sem quantidade significativa e explica embaixo
                da tabela o que ficou de fora.
              </FieldDescription>
            </Field>
          )}
        </form.Field>

        <div className="flex flex-col gap-4">
          {FRONT_OF_PACK_RULES.map((rule) => (
            <form.Field key={rule.key} name={rule.showField}>
              {(field: any) => (
                <FrontOfPackRow
                  rule={rule}
                  input={input}
                  checked={field.state.value}
                  onCheckedChange={field.handleChange}
                />
              )}
            </form.Field>
          ))}
        </div>

        <Separator />

        <PublicationFields form={form} values={values} missing={missing} />
      </CardContent>
    </Card>
  );
}

/** A frase embaixo do switch: por que ele está travado, ou o que ele faz. */
function publishHint(published: boolean, missing: readonly string[]): string {
  if (published && missing.length > 0) {
    return `Publicada, mas falta ${formatList(missing)}; o salvamento será recusado até completar.`;
  }

  if (published) return "Aparece no cardápio e na página do produto.";

  if (missing.length > 0) return `Complete a tabela para publicar: falta ${formatList(missing)}.`;

  return "Desligado, a tabela fica só aqui no painel.";
}

function PublicationFields({
  form,
  values,
  missing,
}: {
  form: any;
  values: NutritionFormValues;
  missing: readonly string[];
}) {
  const id = domId("published");
  const blocked = !values.published && missing.length > 0;
  const sourceLabelId = domId("source-label");

  return (
    <div className="flex flex-col gap-4">
      <form.Field name="published">
        {(field: any) => (
          <Field>
            <div className="flex flex-wrap items-center gap-2">
              <Switch
                id={id}
                checked={field.state.value}
                disabled={blocked}
                aria-describedby={`${id}-description`}
                onCheckedChange={field.handleChange}
              />
              <FieldLabel htmlFor={id}>Mostrar no cardápio</FieldLabel>
            </div>
            <FieldDescription id={`${id}-description`}>
              {publishHint(field.state.value, missing)}
            </FieldDescription>
          </Field>
        )}
      </form.Field>

      {values.published && missing.length > 0 ? (
        <Alert>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Tabela incompleta</AlertTitle>
          <AlertDescription>
            {`Falta ${formatList(missing)} para a tabela ficar completa. Com a publicação ligada, o salvamento é recusado até que todos os campos estejam preenchidos.`}
          </AlertDescription>
        </Alert>
      ) : null}

      <form.Field name="source">
        {(field: any) => (
          <Field>
            <FieldTitle id={sourceLabelId}>Origem dos valores</FieldTitle>
            <ToggleGroup
              variant="outline"
              className="flex-wrap"
              aria-labelledby={sourceLabelId}
              value={[field.state.value]}
              onValueChange={(next: string[]) => {
                const selected = toSource(next[0] ?? "");

                if (selected) field.handleChange(selected);
              }}
            >
              {SOURCES.map((option) => (
                <ToggleGroupItem key={option} value={option}>
                  {NUTRITION_SOURCE_LABELS[option]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription>
              De onde vieram os números. Análise laboratorial e rótulo do fornecedor são as fontes
              mais defensáveis.
            </FieldDescription>
          </Field>
        )}
      </form.Field>

      <form.Field name="notes">
        {(field: any) => (
          <Field>
            <FieldLabel htmlFor={domId("notes")}>Observações</FieldLabel>
            <Textarea
              id={domId("notes")}
              rows={3}
              maxLength={500}
              value={field.state.value}
              placeholder="Ficha técnica, laboratório, data da análise."
              aria-describedby={domId("notes-description")}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
            />
            <FieldDescription id={domId("notes-description")}>
              Opcional, não aparece no cardápio. {(field.state.value ?? "").length}/500 caracteres.
            </FieldDescription>
          </Field>
        )}
      </form.Field>
    </div>
  );
}

/** A prévia nunca escreve no formulário: ela só lê os valores já digitados. */
function PreviewCard({ input }: { input: NutritionInput }) {
  const [mode, setMode] = useState<NutritionViewMode>("portion");
  const [customText, setCustomText] = useState("");
  const unit = basisUnit(input.basis);
  const customAmount = amountToMilli(parseDecimalInput(customText));

  const view: NutritionView =
    mode === "custom" ? { mode: "custom", amountMilli: customAmount ?? undefined } : { mode };

  const model = buildNutritionLabel(input, view);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prévia do rótulo</CardTitle>
        <CardDescription>A prévia usa as mesmas funções da loja.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field>
          <FieldTitle id={domId("preview-mode-label")}>Ver por</FieldTitle>
          <ToggleGroup
            variant="outline"
            size="sm"
            aria-labelledby={domId("preview-mode-label")}
            value={[mode]}
            onValueChange={(next: string[]) => {
              const selected = toViewMode(next[0] ?? "");

              if (selected) setMode(selected);
            }}
          >
            {PREVIEW_MODES.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value}>
                {option.value === "per100" ? `${option.label} ${unit}` : option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>

        {mode === "custom" ? (
          <Field>
            <FieldLabel htmlFor={domId("preview-amount")}>Quantidade personalizada</FieldLabel>
            <InputGroup className="w-36 max-w-full">
              <InputGroupAddon align="inline-end">{unit}</InputGroupAddon>
              <InputGroupInput
                id={domId("preview-amount")}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                value={customText}
                placeholder="0"
                aria-describedby={domId("preview-amount-description")}
                onChange={(event) => setCustomText(maskDecimalInput(event.target.value, 3))}
              />
            </InputGroup>
            <FieldDescription id={domId("preview-amount-description")}>
              Simulação: o %VD é calculado sobre esta quantidade, não é a porção de referência.
            </FieldDescription>
          </Field>
        ) : null}

        <NutritionLabel model={model} compact />
      </CardContent>
    </Card>
  );
}

/**
 * O formulário é dono do próprio estado, do próprio `<form>` e da própria base
 * de comparação: nada de nutrição viaja no patch do produto.
 */
export function ProductNutrition({
  storeSlug,
  productId,
  nutrition,
}: {
  storeSlug: string;
  productId: string;
  nutrition: PanelProductNutrition | null;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const initialValues = valuesFrom(nutrition);
  const [baseline, setBaseline] = useState<NutritionFormValues>(initialValues);

  const mutation = useMutation({
    mutationFn: async (values: NutritionFormValues) => {
      const patch = nutritionPatch(values, baseline);

      if (Object.keys(patch).length === 0) return null;

      const { product } = await client().panel.saveProductNutrition({
        storeSlug,
        productId,
        ...patch,
      });

      return product;
    },
    onSuccess: (product) => {
      if (!product) {
        setStatus("Nenhuma alteração para salvar.");

        return;
      }

      setBaseline(valuesFrom(product.nutrition));
      setStatus("Tabela nutricional salva.");
    },
    onError: (error) => {
      setStatus(null);
      setServerError(serverMessage(error));
    },
  });

  const form = useForm({
    defaultValues: initialValues,
    validators: {
      onSubmit: NutritionFormSchema,
      onBlur: NutritionFormSchema,
    },
    onSubmit: async ({ value }) => {
      setServerError(null);
      setStatus(null);
      await mutation.mutateAsync(value);
    },
  });

  const values: NutritionFormValues = useStore(form.store, (state: any) => state.values);
  const payload = payloadOf(values);
  const input = labelInputOf(payload);
  const dirty = Object.keys(nutritionPatch(values, baseline)).length > 0;

  useDirtySection("nutrition", dirty);

  // A tabela completa serve as descrições e a lista de campos que faltam; a
  // prévia usa o formato escolhido, que pode omitir constituintes.
  const fullModel = buildNutritionLabel({ ...input, labelFormat: "vertical" }, { mode: "portion" });

  return (
    <TooltipProvider>
      <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <form
          className="flex min-w-0 flex-col gap-6"
          onSubmit={(event) => submitWithFocus(form, event)}
        >
          <form.Subscribe selector={(state: any) => state.isSubmitted}>
            {(submitted: boolean) => (
              <>
                <BasePortionCard form={form} submitted={submitted} basis={values.basis} />
                <NutrientsCard
                  form={form}
                  submitted={submitted}
                  rows={fullModel.rows}
                  unit={basisUnit(values.basis)}
                />
                <FormatAndPublishCard
                  form={form}
                  input={input}
                  values={values}
                  missing={fullModel.missingFields}
                />

                {serverError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Não foi possível salvar a tabela nutricional</AlertTitle>
                    <AlertDescription>{serverError}</AlertDescription>
                  </Alert>
                ) : null}

                {status ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    {status}
                  </p>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2">
                  <form.Subscribe selector={(state: any) => state.isSubmitting}>
                    {(isSubmitting: boolean) => (
                      <Button type="submit" disabled={isSubmitting || mutation.isPending}>
                        {isSubmitting || mutation.isPending ? (
                          <Spinner data-icon="inline-start" />
                        ) : null}
                        Salvar tabela nutricional
                      </Button>
                    )}
                  </form.Subscribe>
                </div>
              </>
            )}
          </form.Subscribe>
        </form>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <form.Subscribe selector={(state: any) => state.values}>
            {(current: NutritionFormValues) => (
              <PreviewCard input={labelInputOf(payloadOf(current))} />
            )}
          </form.Subscribe>
        </aside>
      </div>
    </TooltipProvider>
  );
}
