/**
 * The label view model. Both the dashboard preview and the storefront render
 * this object, so the portion, the rounding, the %VD and the "Alto em" chips
 * cannot drift between the two surfaces.
 */
import {
  FRONT_OF_PACK_RULES,
  NUTRIENTS,
  basisUnit,
  isNonSignificant,
  kilojoules,
  milliToAmount,
  percentDv,
  roundNutrient,
  selectedFrontOfPack,
  type FrontOfPackKey,
  type NutrientDefinition,
  type NutrientKey,
  type NutritionBasis,
  type NutritionInput,
  type NutritionLabelFormat,
} from "./nutrients.ts";

export type NutritionViewMode = "portion" | "per100" | "custom";

export type NutritionView = {
  mode: NutritionViewMode;
  /** Used only by `custom`; thousandths of a gram or millilitre. */
  amountMilli?: number;
};

export type NutritionCell = {
  value: number | null;
  decimals: 0 | 1 | 2;
  /** Present only on the energy row. */
  kj: number | null;
};

export type NutritionRowModel = {
  key: NutrientKey;
  label: string;
  indent: 0 | 1 | 2;
  unit: "kcal" | "g" | "mg";
  per100: NutritionCell;
  view: NutritionCell;
  percentDv: number | null;
  nonSignificant: boolean;
  missing: boolean;
};

export type NutritionAlert = {
  key: FrontOfPackKey;
  label: string;
};

export type NutritionLabelModel = {
  format: NutritionLabelFormat;
  basis: NutritionBasis;
  unit: "g" | "mL";
  servingsLine: string;
  portionLine: string;
  columns: {
    per100: string;
    view: string | null;
    percent: string;
  };
  rows: NutritionRowModel[];
  simplifiedNotice: string | null;
  alerts: NutritionAlert[];
  footnote: string;
  viewMode: NutritionViewMode;
  official: boolean;
  missingFields: string[];
};

/** `30` for 30 g/mL; up to three decimals, no trailing zeroes, pt-BR comma. */
export function formatAmount(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;

  return String(rounded).replace(".", ",");
}

function emptyCell(): NutritionCell {
  return { value: null, decimals: 0, kj: null };
}

function cellFor(
  definition: NutrientDefinition,
  value: number | null,
  amountMilli: number | null,
): NutritionCell {
  if (value === null || amountMilli === null) return emptyCell();

  const scale = amountMilli / 100_000;
  const scaled = value * scale;

  // A value below the Anexo IV ceiling is declared as zero on every basis.
  if (isNonSignificant(definition, value)) {
    return {
      value: 0,
      decimals: 0,
      kj: definition.unit === "kcal" ? 0 : null,
    };
  }

  if (definition.unit === "kcal") {
    const kcal = Math.round(scaled);

    return { value: kcal, decimals: 0, kj: kilojoules(kcal) };
  }

  const rounded =
    definition.unit === "g" ? roundNutrient(scaled / 1000, "g") : roundNutrient(scaled, "mg");

  return { value: rounded.value, decimals: rounded.decimals, kj: null };
}

function viewLabel(
  mode: NutritionViewMode,
  unit: "g" | "mL",
  amountMilli: number | null,
): string | null {
  if (mode === "per100") return null;

  if (amountMilli === null) return `— ${unit}`;

  // When portion matches the 100 g/mL base, a second column would duplicate the first.
  if (amountMilli === 100_000) return null;

  return `${formatAmount(milliToAmount(amountMilli))} ${unit}`;
}

function viewAmount(input: NutritionInput, view: NutritionView): number | null {
  if (view.mode === "per100") return 100_000;

  if (view.mode === "custom") return view.amountMilli ?? null;

  return input.portionMilli;
}

function servingsLine(servings: number | null): string {
  if (servings === null || servings <= 0) return "Porções por embalagem: não informado";

  if (servings >= 3) return `Porções por embalagem: ${servings}`;

  return `Porções por embalagem: cerca de ${servings}`;
}

function portionLine(input: NutritionInput, unit: "g" | "mL"): string {
  if (input.portionMilli === null || input.portionMilli <= 0) return "Porção: não informada";

  const amount = `${formatAmount(milliToAmount(input.portionMilli))} ${unit}`;
  const measure = input.householdMeasure?.trim();

  return measure ? `Porção: ${amount} (${measure})` : `Porção: ${amount}`;
}

function footnote(input: NutritionInput, view: NutritionView, unit: "g" | "mL"): string {
  if (view.mode === "per100") {
    return `*Percentual de valores diários calculado sobre 100 ${unit}.`;
  }

  if (view.mode === "custom") {
    const amount = view.amountMilli ?? null;

    const label =
      amount === null
        ? "quantidade personalizada"
        : `${formatAmount(milliToAmount(amount))} ${unit}`;

    return `*Percentual de valores diários calculado sobre ${label}. Simulação, não é a porção de referência.`;
  }

  return "*Percentual de valores diários fornecidos pela porção.";
}

function listLabels(labels: readonly string[]): string {
  if (labels.length === 0) return "";

  if (labels.length === 1) return labels[0] ?? "";

  return `${labels.slice(0, -1).join(", ")} e ${labels.at(-1) ?? ""}`;
}

function simplifiedNotice(rows: readonly NutritionRowModel[]): string | null {
  const omitted = rows.flatMap((row) => (row.nonSignificant && !row.missing ? [row.label] : []));

  if (omitted.length === 0) return null;

  return `Não contém quantidades significativas de ${listLabels(omitted)}.`;
}

function missingFields(input: NutritionInput, rows: readonly NutritionRowModel[]): string[] {
  const missing = rows.flatMap((row) => (row.missing ? [row.label] : []));

  if (input.portionMilli === null || input.portionMilli <= 0) missing.push("Porção");

  if (input.servingsPerPack === null || input.servingsPerPack <= 0) {
    missing.push("Porções por embalagem");
  }

  if (input.householdMeasure === null || input.householdMeasure.trim() === "") {
    missing.push("Medida caseira");
  }

  return missing;
}

/**
 * Builds the label for one view. `portion` is the official table; `per100` and
 * `custom` are comparisons/simulations and are marked as such in the footnote.
 */
export function buildNutritionLabel(
  input: NutritionInput,
  view: NutritionView = { mode: "portion" },
): NutritionLabelModel {
  const unit = basisUnit(input.basis);
  const amountMilli = viewAmount(input, view);

  const rows = NUTRIENTS.map((definition): NutritionRowModel => {
    const value = input[definition.key];
    const per100 = cellFor(definition, value, 100_000);
    const current = cellFor(definition, value, amountMilli);
    const missing = value === null;
    const nonSignificant = isNonSignificant(definition, value);

    return {
      key: definition.key,
      label: definition.label,
      indent: definition.indent,
      unit: definition.unit,
      per100,
      view: current,
      percentDv: current.value === null ? null : percentDv(current.value, definition.vdr),
      nonSignificant,
      missing,
    };
  });

  const visible =
    input.labelFormat === "simplified"
      ? rows.filter((row) => !row.nonSignificant || row.missing)
      : rows;

  return {
    format: input.labelFormat,
    basis: input.basis,
    unit,
    servingsLine: servingsLine(input.servingsPerPack),
    portionLine: portionLine(input, unit),
    columns: {
      per100: `100 ${unit}`,
      view: viewLabel(view.mode, unit, amountMilli),
      percent: "%VD*",
    },
    rows: visible,
    simplifiedNotice: input.labelFormat === "simplified" ? simplifiedNotice(rows) : null,
    alerts: selectedFrontOfPack(input).map((rule) => ({ key: rule.key, label: rule.label })),
    footnote: footnote(input, view, unit),
    viewMode: view.mode,
    official: view.mode === "portion",
    missingFields: missingFields(input, rows),
  };
}

/** The order the three warning chips follow on both surfaces. */
export const FRONT_OF_PACK_ORDER: readonly FrontOfPackKey[] = FRONT_OF_PACK_RULES.map(
  (rule) => rule.key,
);
