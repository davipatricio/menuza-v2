import { describe, expect, test } from "bun:test";
import {
  FRONT_OF_PACK_RULES,
  buildNutritionLabel,
  frontOfPackThreshold,
  isFrontOfPackRecommended,
  kilojoules,
  percentDv,
  roundNutrient,
  type NutritionInput,
} from "./index.ts";

const base: NutritionInput = {
  basis: "solid",
  labelFormat: "vertical",
  portionMilli: 30_000,
  householdMeasure: "2 colheres de sopa",
  servingsPerPack: 4,
  energyKcal: 320,
  carbsMg: 38_000,
  totalSugarsMg: 2_400,
  addedSugarsMg: 1_200,
  proteinMg: 8_500,
  totalFatMg: 12_000,
  saturatedFatMg: 4_100,
  transFatMg: 0,
  fiberMg: 2_100,
  sodiumMg: 420,
  showHighAddedSugar: false,
  showHighSatFat: false,
  showHighSodium: false,
};

describe("Anexo III rounding", () => {
  test("energy and values at or above 10 are integers", () => {
    expect(roundNutrient(320.4, "kcal")).toEqual({ value: 320, decimals: 0 });
    expect(roundNutrient(12.5, "g")).toEqual({ value: 13, decimals: 0 });
  });

  test("1 to 10 keeps one decimal, and a zero decimal becomes an integer", () => {
    expect(roundNutrient(4.14, "g")).toEqual({ value: 4.1, decimals: 1 });
    expect(roundNutrient(4.15, "g")).toEqual({ value: 4.2, decimals: 1 });
    expect(roundNutrient(5, "g")).toEqual({ value: 5, decimals: 0 });
  });

  test("below 1 g keeps one decimal and below 1 mg keeps two", () => {
    expect(roundNutrient(0.64, "g")).toEqual({ value: 0.6, decimals: 1 });
    expect(roundNutrient(0.25, "mg")).toEqual({ value: 0.25, decimals: 2 });
    expect(roundNutrient(0.2, "mg")).toEqual({ value: 0.2, decimals: 1 });
  });
});

describe("derived values", () => {
  test("%VD uses the already rounded portion and total sugars has none", () => {
    expect(percentDv(11, 300)).toBe(4);
    expect(percentDv(19, 300)).toBe(6);
    expect(percentDv(11, null)).toBeNull();
    expect(kilojoules(160)).toBe(669);
  });

  test("the label follows the declared order and indentation", () => {
    const label = buildNutritionLabel(base);

    expect(label.rows.map((row) => row.key)).toEqual([
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
    ]);
    expect(label.rows.find((row) => row.key === "totalSugarsMg")?.indent).toBe(1);
    expect(label.rows.find((row) => row.key === "addedSugarsMg")?.indent).toBe(2);
  });

  test("a 30 g portion is one third of the 100 g column", () => {
    const label = buildNutritionLabel(base);
    const carbs = label.rows.find((row) => row.key === "carbsMg");
    const energy = label.rows.find((row) => row.key === "energyKcal");
    const sugars = label.rows.find((row) => row.key === "totalSugarsMg");

    expect(carbs?.per100).toEqual({ value: 38, decimals: 0, kj: null });
    expect(carbs?.view).toEqual({ value: 11, decimals: 0, kj: null });
    expect(carbs?.percentDv).toBe(4);
    expect(energy?.view).toEqual({ value: 96, decimals: 0, kj: 402 });
    expect(sugars?.percentDv).toBeNull();
  });

  test("a quantity rounded to zero on the portion still follows the 100 g threshold", () => {
    const label = buildNutritionLabel({
      ...base,
      portionMilli: 1_000,
      proteinMg: 600,
    });

    const protein = label.rows.find((row) => row.key === "proteinMg");

    expect(protein?.nonSignificant).toBe(false);
    expect(protein?.view).toEqual({ value: 0, decimals: 0, kj: null });
  });

  test("a non-significant 100 g value is declared as zero, not as a rounded crumb", () => {
    const label = buildNutritionLabel({ ...base, transFatMg: 40 });
    const trans = label.rows.find((row) => row.key === "transFatMg");

    expect(trans?.per100).toEqual({ value: 0, decimals: 0, kj: null });
    expect(trans?.view).toEqual({ value: 0, decimals: 0, kj: null });
  });
});

describe("front-of-pack", () => {
  test("the thresholds are inclusive and differ by basis", () => {
    const addedSugar = FRONT_OF_PACK_RULES.find((rule) => rule.key === "addedSugar");
    const sodium = FRONT_OF_PACK_RULES.find((rule) => rule.key === "sodium");

    if (!addedSugar || !sodium) throw new Error("front-of-pack rules are incomplete");

    expect(frontOfPackThreshold(addedSugar, "solid")).toBe(15_000);
    expect(frontOfPackThreshold(addedSugar, "liquid")).toBe(7_500);
    expect(frontOfPackThreshold(sodium, "solid")).toBe(600);
    expect(frontOfPackThreshold(sodium, "liquid")).toBe(300);

    expect(isFrontOfPackRecommended(addedSugar, { ...base, addedSugarsMg: 15_000 })).toBe(true);
    expect(isFrontOfPackRecommended(addedSugar, { ...base, addedSugarsMg: 14_999 })).toBe(false);
    expect(
      isFrontOfPackRecommended(addedSugar, {
        ...base,
        basis: "liquid",
        addedSugarsMg: 7_500,
      }),
    ).toBe(true);
  });

  test("only the switches the store turned on become chips", () => {
    const label = buildNutritionLabel({
      ...base,
      addedSugarsMg: 16_000,
      sodiumMg: 700,
      showHighAddedSugar: true,
    });

    expect(label.alerts).toEqual([{ key: "addedSugar", label: "Açúcar adicionado" }]);
  });
});

describe("simplified declaration", () => {
  test("non-significant constituents leave the grid and go to the legal sentence", () => {
    const label = buildNutritionLabel({ ...base, labelFormat: "simplified" });

    expect(label.rows.map((row) => row.key)).not.toContain("transFatMg");
    expect(label.rows.map((row) => row.key)).toContain("addedSugarsMg");
    expect(label.simplifiedNotice).toContain("Gorduras trans");
    expect(label.simplifiedNotice).not.toContain("Açúcares adicionados");
  });

  test("all ten non-significant leaves only the sentence", () => {
    const label = buildNutritionLabel({
      ...base,
      labelFormat: "simplified",
      energyKcal: 0,
      carbsMg: 0,
      totalSugarsMg: 0,
      addedSugarsMg: 0,
      proteinMg: 0,
      totalFatMg: 0,
      saturatedFatMg: 0,
      transFatMg: 0,
      fiberMg: 0,
      sodiumMg: 0,
    });

    expect(label.rows).toHaveLength(0);
    expect(label.simplifiedNotice).toStartWith("Não contém quantidades significativas de");
    expect(label.simplifiedNotice).toContain("Sódio");
  });
});

describe("views and completeness", () => {
  test("per 100 g hides the second column and bases %VD on 100 g", () => {
    const label = buildNutritionLabel(base, { mode: "per100" });
    const sodium = label.rows.find((row) => row.key === "sodiumMg");

    expect(label.columns.view).toBeNull();
    expect(label.official).toBe(false);
    expect(label.footnote).toContain("100 g");
    expect(sodium?.percentDv).toBe(21);
  });

  test("100 g portion hides duplicate column", () => {
    const label = buildNutritionLabel({ ...base, portionMilli: 100_000 });

    expect(label.columns.view).toBeNull();
    expect(label.official).toBe(true);
  });

  test("custom amount is a simulation and says so", () => {
    const label = buildNutritionLabel(base, { mode: "custom", amountMilli: 300_000 });
    const sodium = label.rows.find((row) => row.key === "sodiumMg");

    expect(label.columns.view).toBe("300 g");
    expect(label.footnote).toContain("Simulação");
    expect(sodium?.percentDv).toBe(63);
  });

  test("missing required data is listed for the editor", () => {
    const label = buildNutritionLabel({
      ...base,
      portionMilli: null,
      householdMeasure: null,
      servingsPerPack: null,
      proteinMg: null,
    });

    expect(label.missingFields).toEqual([
      "Proteínas",
      "Porção",
      "Porções por embalagem",
      "Medida caseira",
    ]);
    expect(label.rows.find((row) => row.key === "proteinMg")?.per100.value).toBeNull();
  });
});
