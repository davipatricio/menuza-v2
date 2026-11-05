import { describe, expect, test } from "bun:test";

import { kitOrderCents, kitUnitCents } from "../src/features/catalog/lib/kit-price.ts";

describe("kitUnitCents", () => {
  test("fixed cobra o piso e ignora a soma dos pratos", () => {
    const price = kitUnitCents({
      pricingMode: "fixed",
      baseCents: 4_990,
      percentOff: null,
      chosenCents: [1_000, 2_000, 3_000],
    });

    expect(price.subtotalCents).toBe(4_990);
    expect(price.totalCents).toBe(4_990);
  });

  test("sum cobra a soma quando ela supera o piso", () => {
    const price = kitUnitCents({
      pricingMode: "sum",
      baseCents: 1_000,
      percentOff: null,
      chosenCents: [2_500, 3_000],
    });

    expect(price.subtotalCents).toBe(5_500);
  });

  test("sum respeita o piso quando a soma é menor", () => {
    const price = kitUnitCents({
      pricingMode: "sum",
      baseCents: 5_000,
      percentOff: null,
      chosenCents: [1_000],
    });

    expect(price.subtotalCents).toBe(5_000);
  });

  test("o percentual do kit incide depois do piso", () => {
    const price = kitUnitCents({
      pricingMode: "sum",
      baseCents: 5_000,
      percentOff: 10,
      chosenCents: [1_000],
    });

    expect(price.discountCents).toBe(500);
    expect(price.totalCents).toBe(4_500);
  });

  test("percentual nulo ou zero não desconta", () => {
    for (const percentOff of [null, 0]) {
      const price = kitUnitCents({
        pricingMode: "fixed",
        baseCents: 3_000,
        percentOff,
        chosenCents: [],
      });

      expect(price.discountCents).toBe(0);
      expect(price.totalCents).toBe(3_000);
    }
  });
});

describe("kitOrderCents", () => {
  const bands = [
    { minQuantity: 3, percent: 5 },
    { minQuantity: 10, percent: 12 },
  ];

  test("sem faixa alcançada, o total é o bruto", () => {
    const order = kitOrderCents({ unitCents: 4_000, kitCount: 2, bands });

    expect(order.band).toBeNull();
    expect(order.totalCents).toBe(8_000);
  });

  test("a faixa não é cumulativa: só a maior alcançada incide", () => {
    const order = kitOrderCents({ unitCents: 4_000, kitCount: 10, bands });

    expect(order.band?.percent).toBe(12);
    expect(order.discountCents).toBe(4_800);
    expect(order.totalCents).toBe(35_200);
  });

  test("entre faixas vale a menor alcançada", () => {
    const order = kitOrderCents({ unitCents: 4_000, kitCount: 5, bands });

    expect(order.band?.minQuantity).toBe(3);
    expect(order.totalCents).toBe(19_000);
  });
});
