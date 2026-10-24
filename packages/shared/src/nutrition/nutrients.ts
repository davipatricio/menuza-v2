/**
 * Nutrition label domain: the 10 mandatory constituents of RDC 429/2020 and
 * IN 75/2020, their VDR, the Anexo III rounding bands and the Anexo XV
 * front-of-pack thresholds.
 *
 * Pure and browser-safe: no React, no DB, no env. Measures arrive in the
 * smallest unit the label declares (kcal for energy, mg for nutrients) so the
 * panel, the public API and the storefront all derive the same numbers.
 */

export type NutritionBasis = "solid" | "liquid";

export type NutritionLabelFormat = "vertical" | "simplified";

export type NutritionSource = "manual" | "lab" | "supplier_label" | "database" | "estimate";

export type NutrientKey =
  | "energyKcal"
  | "carbsMg"
  | "totalSugarsMg"
  | "addedSugarsMg"
  | "proteinMg"
  | "totalFatMg"
  | "saturatedFatMg"
  | "transFatMg"
  | "fiberMg"
  | "sodiumMg";

export type FrontOfPackKey = "addedSugar" | "satFat" | "sodium";

/** The label-relevant slice shared by the panel and the public payload. */
export type NutritionInput = {
  basis: NutritionBasis;
  labelFormat: NutritionLabelFormat;
  portionMilli: number | null;
  householdMeasure: string | null;
  servingsPerPack: number | null;
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
  showHighAddedSugar: boolean;
  showHighSatFat: boolean;
  showHighSodium: boolean;
};

export type NutrientDefinition = {
  key: NutrientKey;
  label: string;
  unit: "kcal" | "g" | "mg";
  /** 0 = no indent, 1 = first level, 2 = second level (Anexo XI). */
  indent: 0 | 1 | 2;
  /** VDR in the display unit. `null` means the constituent has no %VD. */
  vdr: number | null;
  /**
   * Anexo IV non-significant ceiling, in the display unit for energy (kcal)
   * and in mg for every other constituent. `null` means "only zero counts".
   */
  nonSignificant: number | null;
};

/** The declared order, names, units, indentation and VDRs of the IN 75. */
export const NUTRIENTS: readonly NutrientDefinition[] = [
  {
    key: "energyKcal",
    label: "Valor energético",
    unit: "kcal",
    indent: 0,
    vdr: 2000,
    nonSignificant: 4,
  },
  { key: "carbsMg", label: "Carboidratos", unit: "g", indent: 0, vdr: 300, nonSignificant: 500 },
  {
    key: "totalSugarsMg",
    label: "Açúcares totais",
    unit: "g",
    indent: 1,
    vdr: null,
    nonSignificant: 500,
  },
  {
    key: "addedSugarsMg",
    label: "Açúcares adicionados",
    unit: "g",
    indent: 2,
    vdr: 50,
    nonSignificant: null,
  },
  { key: "proteinMg", label: "Proteínas", unit: "g", indent: 0, vdr: 50, nonSignificant: 500 },
  {
    key: "totalFatMg",
    label: "Gorduras totais",
    unit: "g",
    indent: 0,
    vdr: 65,
    nonSignificant: 500,
  },
  {
    key: "saturatedFatMg",
    label: "Gorduras saturadas",
    unit: "g",
    indent: 1,
    vdr: 20,
    nonSignificant: 100,
  },
  { key: "transFatMg", label: "Gorduras trans", unit: "g", indent: 1, vdr: 2, nonSignificant: 100 },
  {
    key: "fiberMg",
    label: "Fibras alimentares",
    unit: "g",
    indent: 0,
    vdr: 25,
    nonSignificant: 500,
  },
  { key: "sodiumMg", label: "Sódio", unit: "mg", indent: 0, vdr: 2000, nonSignificant: 5 },
] as const;

export type FrontOfPackRule = {
  key: FrontOfPackKey;
  label: string;
  field: "addedSugarsMg" | "saturatedFatMg" | "sodiumMg";
  showField: "showHighAddedSugar" | "showHighSatFat" | "showHighSodium";
  solidThreshold: number;
  liquidThreshold: number;
  unit: "g" | "mg";
};

/**
 * Anexo XV. The alert is evaluated per 100 g or 100 mL, never per portion.
 * `>=` is inclusive: 15 g/100 g is already "alto em".
 */
export const FRONT_OF_PACK_RULES: readonly FrontOfPackRule[] = [
  {
    key: "addedSugar",
    label: "Açúcar adicionado",
    field: "addedSugarsMg",
    showField: "showHighAddedSugar",
    solidThreshold: 15_000,
    liquidThreshold: 7_500,
    unit: "g",
  },
  {
    key: "satFat",
    label: "Gordura saturada",
    field: "saturatedFatMg",
    showField: "showHighSatFat",
    solidThreshold: 6_000,
    liquidThreshold: 3_000,
    unit: "g",
  },
  {
    key: "sodium",
    label: "Sódio",
    field: "sodiumMg",
    showField: "showHighSodium",
    solidThreshold: 600,
    liquidThreshold: 300,
    unit: "mg",
  },
] as const;

export function frontOfPackThreshold(rule: FrontOfPackRule, basis: NutritionBasis): number {
  return basis === "liquid" ? rule.liquidThreshold : rule.solidThreshold;
}

/** True when the product's own value already reaches the legal threshold. */
export function isFrontOfPackRecommended(rule: FrontOfPackRule, input: NutritionInput): boolean {
  const value = input[rule.field];

  return value !== null && value >= frontOfPackThreshold(rule, input.basis);
}

export function recommendedFrontOfPack(input: NutritionInput): FrontOfPackKey[] {
  return FRONT_OF_PACK_RULES.flatMap((rule) =>
    isFrontOfPackRecommended(rule, input) ? [rule.key] : [],
  );
}

/** The alerts the store explicitly chose to show, in the Anexo XV order. */
export function selectedFrontOfPack(input: NutritionInput): FrontOfPackRule[] {
  return FRONT_OF_PACK_RULES.filter((rule) => input[rule.showField]);
}

/** `1000` for a solid basis (mg), `1000` for a liquid basis (µL). */
export function basisUnit(basis: NutritionBasis): "g" | "mL" {
  return basis === "liquid" ? "mL" : "g";
}

/** `30` for 30 g/mL stored as thousandths. */
export function milliToAmount(milli: number): number {
  return milli / 1000;
}

/** 1 kcal = 4.184 kJ, declared as an integer. */
export function kilojoules(kcal: number): number {
  return Math.round(kcal * 4.184);
}

export type RoundedValue = {
  value: number;
  decimals: 0 | 1 | 2;
};

/**
 * Anexo III rounding bands. Energy is always an integer. For nutrients the
 * band depends on the display value, not on the stored unit: 4.1 g and 4.1 mg
 * follow the same 1–10 rule.
 */
export function roundNutrient(value: number, unit: "kcal" | "g" | "mg"): RoundedValue {
  if (!Number.isFinite(value) || value <= 0) return { value: 0, decimals: 0 };

  if (unit === "kcal") {
    return { value: Math.round(value), decimals: 0 };
  }

  if (value >= 10) {
    return { value: Math.round(value), decimals: 0 };
  }

  if (value >= 1) {
    const rounded = Math.round(value * 10) / 10;

    return { value: rounded, decimals: Number.isInteger(rounded) ? 0 : 1 };
  }

  if (unit === "g") {
    const rounded = Math.round(value * 10) / 10;

    return { value: rounded, decimals: rounded === 0 ? 0 : 1 };
  }

  const rounded = Math.round(value * 100) / 100;

  if (Number.isInteger(rounded)) return { value: rounded, decimals: 0 };

  if (Number.isInteger(rounded * 10)) return { value: rounded, decimals: 1 };

  return { value: rounded, decimals: 2 };
}

/** True when the 100 g/mL value is at or below the Anexo IV ceiling. */
export function isNonSignificant(definition: NutrientDefinition, value: number | null): boolean {
  if (value === null) return false;

  if (definition.key === "addedSugarsMg") return value === 0;

  if (definition.nonSignificant === null) return value === 0;

  return value <= definition.nonSignificant;
}

/**
 * A portion in thousandths and a per-100 value in mg. `value * portionMilli /
 * 100_000` is `value * (portion g) / 100 g`.
 */
export function perPortionMg(valueMg: number, portionMilli: number): number {
  return (valueMg * portionMilli) / 100_000;
}

/**
 * The %VD is computed from the quantity already rounded for display, as the
 * RDC requires. Total sugars has no VDR and therefore no percentage.
 */
export function percentDv(declared: number, vdr: number | null): number | null {
  if (vdr === null) return null;

  return Math.round((declared / vdr) * 100);
}
