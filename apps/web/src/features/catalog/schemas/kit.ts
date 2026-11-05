/**
 * Estado do editor de kit e as regras que o `validate()` do contrato aplica no
 * servidor. O espelho é deliberado: a prévia e o submit precisam recusar antes
 * da viagem, com mensagem por campo, e o servidor continua sendo a autoridade.
 *
 * A resolução do preço mora em `../lib/kit-price.ts`; aqui só se valida o que é
 * enviado.
 */
import * as v from "valibot";

export type KitKindValue = "fixed" | "custom_quantities" | "fixed_total";

export type KitPricingModeValue = "fixed" | "sum";

export type KitUnavailableValue = "hide" | "block";

export type KitGroupValues = {
  /** Chave local estável; o editor usa como `id` do contrato. */
  key: string;
  name: string;
  minItems: number | null;
  maxItems: number | null;
};

export type KitItemValues = {
  key: string;
  productId: string;
  variationId: string;
  groupId: string | null;
  quantity: number | null;
  minQty: number | null;
  maxQty: number | null;
  step: number;
  allowSwap: boolean;
  swapVariationIds: string[];
};

export type KitBandValues = { minQuantity: number; percent: number };

export type KitFormValues = {
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  kind: KitKindValue;
  pricingMode: KitPricingModeValue;
  baseCents: number;
  percentOff: number | null;
  minItems: number | null;
  maxItems: number | null;
  maxKitsPerOrder: number | null;
  unavailableBehavior: KitUnavailableValue;
  couponStackable: boolean;
  available: boolean;
  archived: boolean;
  sortOrder: number;
  groups: KitGroupValues[];
  items: KitItemValues[];
  bands: KitBandValues[];
};

export const KIT_KINDS: KitKindValue[] = ["fixed", "custom_quantities", "fixed_total"];

export const KIT_PRICING_MODES: KitPricingModeValue[] = ["fixed", "sum"];

export const KIT_UNAVAILABLE_BEHAVIORS: KitUnavailableValue[] = ["hide", "block"];

export const KIT_LIMITS = {
  name: 120,
  slug: 80,
  description: 2000,
  imageUrl: 500,
  groupName: 60,
  groups: 20,
  items: 200,
  bands: 20,
  swaps: 50,
} as const;

/** Erros por caminho (`items.3.quantity`, `groups.0.name`, `form`). */
export type KitErrors = Record<string, string>;

export function emptyKit(slugSeed = ""): KitFormValues {
  return {
    name: "",
    slug: slugSeed,
    description: "",
    imageUrl: "",
    kind: "fixed",
    pricingMode: "fixed",
    baseCents: 0,
    percentOff: null,
    minItems: 1,
    maxItems: null,
    maxKitsPerOrder: null,
    unavailableBehavior: "hide",
    couponStackable: true,
    available: true,
    archived: false,
    sortOrder: 0,
    groups: [],
    items: [],
    bands: [],
  };
}

/** ASCII slug: o mesmo alfabeto que o contrato aceita. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, KIT_LIMITS.slug);
}

function isBlank(value: string) {
  return value.trim() === "";
}

function lengthOf(value: string) {
  return [...value.trim()].length;
}

function bounded(value: number | null, label: string, min: number, max: number): string | null {
  if (value === null) return null;

  if (!Number.isInteger(value) || value < min || value > max)
    return `${label} deve ficar entre ${min} e ${max}.`;

  return null;
}

function multipleOf(step: number, value: number) {
  return value % step === 0;
}

/**
 * Todas as regras do `validate()` do contrato, na mesma ordem de leitura do
 * formulário. Um kit só é enviável quando isto devolve um objeto vazio.
 */
export function validateKit(values: KitFormValues) {
  const errors: KitErrors = {};

  if (isBlank(values.name) || lengthOf(values.name) > KIT_LIMITS.name)
    errors.name = `Informe um nome de até ${KIT_LIMITS.name} caracteres.`;

  if (
    isBlank(values.slug) ||
    values.slug.length > KIT_LIMITS.slug ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug)
  )
    errors.slug = "Use apenas letras minúsculas, números e hífen, sem hífen nas pontas.";

  if (lengthOf(values.description) > KIT_LIMITS.description)
    errors.description = `A descrição aceita até ${KIT_LIMITS.description} caracteres.`;

  if (isBlank(values.imageUrl) || lengthOf(values.imageUrl) > KIT_LIMITS.imageUrl)
    errors.imageUrl = "Informe a URL da foto do kit.";

  if (!Number.isInteger(values.baseCents) || values.baseCents < 0)
    errors.baseCents = "O preço não pode ser negativo.";

  if (values.percentOff !== null && bounded(values.percentOff, "O desconto", 0, 100) !== null)
    errors.percentOff = "O desconto deve ficar entre 0 e 100%.";

  if (values.sortOrder < 0) errors.sortOrder = "A ordem não pode ser negativa.";

  if (values.maxKitsPerOrder !== null && values.maxKitsPerOrder < 1)
    errors.maxKitsPerOrder = "O limite por pedido começa em 1.";

  // Kit-level bounds: min >= 0, max >= 1, min <= max.
  if (values.minItems !== null && values.minItems < 0)
    errors.minItems = "O mínimo de itens não pode ser negativo.";

  if (values.maxItems !== null && values.maxItems < 1)
    errors.maxItems = "O máximo de itens começa em 1.";

  if (values.minItems !== null && values.maxItems !== null && values.minItems > values.maxItems)
    errors.maxItems = "O máximo precisa ser maior ou igual ao mínimo.";

  if (values.kind === "fixed_total" && (values.minItems === null || values.maxItems === null))
    errors.minItems = "No total fixo, informe o mínimo e o máximo de itens do kit.";

  if (values.items.length === 0) errors.form = "Adicione pelo menos um prato ao kit.";

  if (values.items.length > KIT_LIMITS.items)
    errors.form = `Um kit aceita até ${KIT_LIMITS.items} pratos.`;

  if (values.groups.length > KIT_LIMITS.groups)
    errors.form = `Um kit aceita até ${KIT_LIMITS.groups} grupos.`;

  if (values.bands.length > KIT_LIMITS.bands)
    errors.form = `Um kit aceita até ${KIT_LIMITS.bands} faixas de desconto.`;

  // Grupos: nome obrigatório, faixa coerente, todo grupo com ao menos um prato.
  const groupKeys = new Set<string>();

  values.groups.forEach((group, index) => {
    const path = `groups.${index}`;

    if (groupKeys.has(group.key)) errors[`${path}.name`] = "Grupo repetido.";

    groupKeys.add(group.key);

    if (isBlank(group.name) || lengthOf(group.name) > KIT_LIMITS.groupName)
      errors[`${path}.name`] = `Dê um nome de até ${KIT_LIMITS.groupName} caracteres.`;

    if (group.minItems !== null && group.minItems < 0)
      errors[`${path}.minItems`] = "O mínimo do grupo não pode ser negativo.";

    if (group.maxItems !== null && group.maxItems < 1)
      errors[`${path}.maxItems`] = "O máximo do grupo começa em 1.";

    if (group.minItems !== null && group.maxItems !== null && group.minItems > group.maxItems)
      errors[`${path}.maxItems`] = "O máximo precisa ser maior ou igual ao mínimo.";

    if (!values.items.some((item) => item.groupId === group.key))
      errors[`${path}.name`] = "Este grupo não tem pratos. Adicione um prato ou remova o grupo.";
  });

  // Pratos: o tipo do kit decide quais campos valem.
  values.items.forEach((item, index) => {
    const path = `items.${index}`;

    if (item.productId === "" || item.variationId === "")
      errors[`${path}.productId`] = "Escolha o produto e a variação do prato.";

    if (item.groupId !== null && !groupKeys.has(item.groupId))
      errors[`${path}.groupId`] = "Grupo inexistente.";

    if (!Number.isInteger(item.step) || item.step < 1)
      errors[`${path}.step`] = "O passo começa em 1.";

    if (item.allowSwap && item.swapVariationIds.length > KIT_LIMITS.swaps)
      errors[`${path}.swapVariationIds`] = `Marque até ${KIT_LIMITS.swaps} variações.`;

    if (!item.allowSwap && item.swapVariationIds.length > 0)
      errors[`${path}.swapVariationIds`] = "Marque a troca antes de escolher as variações.";

    if (new Set(item.swapVariationIds).size !== item.swapVariationIds.length)
      errors[`${path}.swapVariationIds`] = "Uma variação aparece mais de uma vez.";

    if (item.allowSwap && item.swapVariationIds.includes(item.variationId))
      errors[`${path}.swapVariationIds`] = "A variação padrão não precisa estar na lista de troca.";

    if (values.kind === "fixed") {
      if (item.quantity === null || item.quantity < 1)
        errors[`${path}.quantity`] = "A quantidade começa em 1.";

      if (item.minQty !== null || item.maxQty !== null)
        errors[`${path}.minQty`] = "No kit fixo a quantidade é travada; não use mínimo e máximo.";

      return;
    }

    if (item.quantity !== null)
      errors[`${path}.quantity`] = "Só o kit fixo trava a quantidade do prato.";

    const step = Number.isInteger(item.step) && item.step > 0 ? item.step : 1;

    if (item.minQty !== null && item.minQty < 0)
      errors[`${path}.minQty`] = "O mínimo não pode ser negativo.";

    if (item.maxQty !== null && item.maxQty < 1) errors[`${path}.maxQty`] = "O máximo começa em 1.";

    if (item.minQty !== null && item.maxQty !== null && item.minQty > item.maxQty)
      errors[`${path}.maxQty`] = "O máximo precisa ser maior ou igual ao mínimo.";

    if (
      errors[`${path}.minQty`] === undefined &&
      item.minQty !== null &&
      !multipleOf(step, item.minQty)
    )
      errors[`${path}.minQty`] = `O mínimo precisa ser múltiplo de ${step}.`;

    if (
      errors[`${path}.maxQty`] === undefined &&
      item.maxQty !== null &&
      !multipleOf(step, item.maxQty)
    )
      errors[`${path}.maxQty`] = `O máximo precisa ser múltiplo de ${step}.`;
  });

  // Faixas: percentual 1–100, gatilho a partir de 2 kits, sem repetir o gatilho.
  const thresholds = new Set<number>();

  values.bands.forEach((band, index) => {
    const path = `bands.${index}`;

    if (band.minQuantity < 2) errors[`${path}.minQuantity`] = "A faixa começa em 2 kits.";

    if (thresholds.has(band.minQuantity))
      errors[`${path}.minQuantity`] = "Já existe uma faixa com esta quantidade.";

    thresholds.add(band.minQuantity);

    if (!Number.isInteger(band.percent) || band.percent < 1 || band.percent > 100)
      errors[`${path}.percent`] = "O percentual deve ficar entre 1 e 100.";
  });

  return errors;
}

/** O payload do contrato, montado a partir do estado do editor. */
export function kitPayload(values: KitFormValues) {
  return {
    archived: values.archived,
    available: values.available,
    bands: values.bands.map((band) => ({
      minQuantity: band.minQuantity,
      percent: band.percent,
    })),
    baseCents: values.baseCents,
    couponStackable: values.couponStackable,
    description: isBlank(values.description) ? null : values.description.trim(),
    groups: values.groups.map((group) => ({
      id: group.key,
      name: group.name.trim(),
      maxItems: group.maxItems,
      minItems: group.minItems,
      sortOrder: values.groups.indexOf(group),
    })),
    imageUrl: values.imageUrl.trim(),
    items: values.items.map((item, index) => ({
      allowSwap: item.allowSwap,
      groupId: item.groupId,
      id: null,
      maxQty: item.maxQty,
      minQty: item.minQty,
      productId: item.productId,
      quantity: item.quantity,
      sortOrder: index,
      step: item.step,
      swapVariationIds: item.swapVariationIds,
      variationId: item.variationId,
    })),
    kind: values.kind,
    maxItems: values.maxItems,
    maxKitsPerOrder: values.maxKitsPerOrder,
    minItems: values.minItems,
    name: values.name.trim(),
    percentOff: values.percentOff,
    pricingMode: values.pricingMode,
    slug: values.slug,
    sortOrder: values.sortOrder,
    unavailableBehavior: values.unavailableBehavior,
  };
}

/**
 * O transporte das escritas de kit. `validateKit()` decide se o kit é válido;
 * este schema garante que o formato que atravessa o server function é o do
 * contrato, sem inventar um segundo conjunto de regras de negócio.
 */
const kitGroupSchema = v.object({
  id: v.string(),
  name: v.string(),
  maxItems: v.nullable(v.number()),
  minItems: v.nullable(v.number()),
  sortOrder: v.optional(v.number()),
});

const kitItemSchema = v.object({
  allowSwap: v.boolean(),
  groupId: v.nullable(v.string()),
  id: v.nullable(v.string()),
  maxQty: v.nullable(v.number()),
  minQty: v.nullable(v.number()),
  productId: v.string(),
  quantity: v.nullable(v.number()),
  sortOrder: v.optional(v.number()),
  step: v.optional(v.number()),
  swapVariationIds: v.optional(v.array(v.string())),
  variationId: v.string(),
});

const kitBandSchema = v.object({ minQuantity: v.number(), percent: v.number() });

const kitWriteFields = {
  archived: v.boolean(),
  available: v.boolean(),
  bands: v.array(kitBandSchema),
  baseCents: v.number(),
  couponStackable: v.boolean(),
  description: v.nullable(v.string()),
  groups: v.array(kitGroupSchema),
  imageUrl: v.string(),
  items: v.array(kitItemSchema),
  kind: v.picklist(KIT_KINDS),
  maxItems: v.nullable(v.number()),
  maxKitsPerOrder: v.nullable(v.number()),
  minItems: v.nullable(v.number()),
  name: v.string(),
  percentOff: v.nullable(v.number()),
  pricingMode: v.picklist(KIT_PRICING_MODES),
  slug: v.string(),
  sortOrder: v.optional(v.number()),
  unavailableBehavior: v.picklist(KIT_UNAVAILABLE_BEHAVIORS),
};

export const createKitInputSchema = v.object({
  storeSlug: v.string(),
  ...kitWriteFields,
});

export const updateKitInputSchema = v.object({
  storeSlug: v.string(),
  kitId: v.string(),
  ...kitWriteFields,
});
