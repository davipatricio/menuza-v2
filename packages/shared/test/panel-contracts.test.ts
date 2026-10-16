import { describe, expect, test } from "bun:test";
import * as v from "valibot";
import {
  CreateCouponInputSchema,
  CreateStoreInputSchema,
  RegisterInputSchema,
  RESERVED_STORE_SLUGS,
  StoreSlugSchema,
  UpdateCouponInputSchema,
} from "../src/panel/contracts.ts";

describe("StoreSlugSchema", () => {
  test("accepts valid lowercase slugs at the length bounds", () => {
    for (const slug of ["abc", "padaria-nova", "a".repeat(23) + "b"]) {
      expect(v.safeParse(StoreSlugSchema, slug).success).toBe(true);
    }
  });

  test("rejects too short, too long, uppercase and edge hyphens", () => {
    for (const slug of [
      "ab",
      "a".repeat(25),
      "ABC",
      "Padaria",
      "-abc",
      "abc-",
      "padaria nova",
      "padaria_nova",
      "",
    ]) {
      expect(v.safeParse(StoreSlugSchema, slug).success).toBe(false);
    }
  });

  test("rejects every reserved slug", () => {
    for (const slug of RESERVED_STORE_SLUGS) {
      if (slug.length < 3 || slug.length > 24) continue;

      expect(v.safeParse(StoreSlugSchema, slug).success).toBe(false);
    }
  });
});

describe("RegisterInputSchema", () => {
  const valid = {
    name: "Ana",
    email: "ana@example.com",
    birthdate: "1990-01-01",
    password: "12345678",
  };

  test("accepts a valid payload and normalizes name and email", () => {
    const result = v.safeParse(RegisterInputSchema, {
      ...valid,
      name: "  Ana  ",
      email: "  Ana@Example.COM ",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.output.name).toBe("Ana");
      expect(result.output.email).toBe("ana@example.com");
    }
  });

  test("rejects an underage or invalid birthdate", () => {
    expect(v.safeParse(RegisterInputSchema, { ...valid, birthdate: "2015-01-01" }).success).toBe(
      false,
    );
    expect(v.safeParse(RegisterInputSchema, { ...valid, birthdate: "2030-01-01" }).success).toBe(
      false,
    );
    expect(v.safeParse(RegisterInputSchema, { ...valid, birthdate: "01/01/1990" }).success).toBe(
      false,
    );
  });

  test("rejects a short password, short name, bad e-mail and unknown keys", () => {
    expect(v.safeParse(RegisterInputSchema, { ...valid, password: "1234567" }).success).toBe(false);
    expect(v.safeParse(RegisterInputSchema, { ...valid, name: "A" }).success).toBe(false);
    expect(v.safeParse(RegisterInputSchema, { ...valid, email: "no-at" }).success).toBe(false);
    expect(v.safeParse(RegisterInputSchema, { ...valid, extra: true }).success).toBe(false);
  });
});

describe("CreateStoreInputSchema", () => {
  test("accepts a valid store and rejects a reserved slug", () => {
    expect(
      v.safeParse(CreateStoreInputSchema, { displayName: "Padaria Nova", slug: "padaria-nova" })
        .success,
    ).toBe(true);
    expect(
      v.safeParse(CreateStoreInputSchema, { displayName: "Painel", slug: "dashboard" }).success,
    ).toBe(false);
  });
});

describe("coupon discount bounds", () => {
  const createBase = {
    storeSlug: "mawifoods",
    code: "PROMO10",
    stackable: false,
    firstPurchaseOnly: false,
    status: "active" as const,
  };

  const updateBase = { ...createBase, couponId: "coupon-1" };

  test("accepts fixed cents and percentage up to 100", () => {
    expect(
      v.safeParse(CreateCouponInputSchema, {
        ...createBase,
        discountType: "fixed",
        discountValue: 1500,
      }).success,
    ).toBe(true);
    expect(
      v.safeParse(CreateCouponInputSchema, {
        ...createBase,
        discountType: "percentage",
        discountValue: 100,
      }).success,
    ).toBe(true);
    expect(
      v.safeParse(UpdateCouponInputSchema, {
        ...updateBase,
        discountType: "percentage",
        discountValue: 100,
      }).success,
    ).toBe(true);
  });

  test("rejects percentage above 100 with a pt-BR message", () => {
    for (const schema of [CreateCouponInputSchema, UpdateCouponInputSchema]) {
      const base = schema === CreateCouponInputSchema ? createBase : updateBase;

      const result = v.safeParse(schema, {
        ...base,
        discountType: "percentage",
        discountValue: 101,
      });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.issues.some((issue) => issue.message.includes("1 a 100"))).toBe(true);
      }
    }
  });

  test("freight discount is an optional percentage from 0 to 100", () => {
    for (const schema of [CreateCouponInputSchema, UpdateCouponInputSchema]) {
      const base = schema === CreateCouponInputSchema ? createBase : updateBase;

      // Order discount and freight discount coexist: one coupon, two percentages.
      expect(
        v.safeParse(schema, {
          ...base,
          discountType: "fixed",
          discountValue: 1500,
          shippingDiscountPercent: 50,
        }).success,
      ).toBe(true);

      // Omitted is fine — the freight discount is opt-in.
      expect(
        v.safeParse(schema, { ...base, discountType: "fixed", discountValue: 1500 }).success,
      ).toBe(true);

      const over = v.safeParse(schema, {
        ...base,
        discountType: "fixed",
        discountValue: 1500,
        shippingDiscountPercent: 101,
      });

      expect(over.success).toBe(false);

      if (!over.success) {
        expect(over.issues.some((issue) => issue.message.includes("0 a 100"))).toBe(true);
      }
    }
  });

  test("empty code is rejected with pt-BR copy, not Valibot's English default", () => {
    const result = v.safeParse(CreateCouponInputSchema, {
      ...createBase,
      code: "",
      discountType: "percentage",
      discountValue: 10,
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.issues.every((issue) => issue.message.startsWith("Informe o código"))).toBe(
        true,
      );
    }
  });
});
