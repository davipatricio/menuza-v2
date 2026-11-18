import { describe, expect, test } from "bun:test";

import { kitOrderCents, kitUnitCents } from "../src/features/catalog/lib/kit-price.ts";

describe("kitUnitCents", () => {
  test("cobra baseCents quando não há valor extra", () => {
    const price = kitUnitCents({
      baseCents: 4_990,
      percentOff: null,
    });

    expect(price.subtotalCents).toBe(4_990);
    expect(price.discountCents).toBe(0);
    expect(price.totalCents).toBe(4_990);
  });

  test("soma extraCents ao baseCents", () => {
    const price = kitUnitCents({
      baseCents: 5_000,
      percentOff: null,
      extraCents: 1_500,
    });

    expect(price.subtotalCents).toBe(6_500);
    expect(price.discountCents).toBe(0);
    expect(price.totalCents).toBe(6_500);
  });

  test("o percentual do kit incide sobre baseCents + extraCents", () => {
    const price = kitUnitCents({
      baseCents: 5_000,
      percentOff: 10,
      extraCents: 1_000,
    });

    expect(price.subtotalCents).toBe(6_000);
    expect(price.discountCents).toBe(600);
    expect(price.totalCents).toBe(5_400);
  });

  test("percentual nulo ou zero não desconta", () => {
    for (const percentOff of [null, 0]) {
      const price = kitUnitCents({
        baseCents: 3_000,
        percentOff,
        extraCents: 500,
      });

      expect(price.discountCents).toBe(0);
      expect(price.totalCents).toBe(3_500);
    }
  });

  test("trunca fração de centavo no desconto do kit igual ao Rust percent_of", () => {
    const price = kitUnitCents({
      baseCents: 999,
      percentOff: 15,
    });

    expect(price.discountCents).toBe(149);
    expect(price.totalCents).toBe(850);
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

  test("trunca fração de centavo na faixa progressiva igual ao Rust percent_of", () => {
    const order = kitOrderCents({ unitCents: 333, kitCount: 3, bands });

    expect(order.discountCents).toBe(49);
    expect(order.totalCents).toBe(950);
  });
});
