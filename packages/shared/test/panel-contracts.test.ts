import { describe, expect, test } from "bun:test";
import * as v from "valibot";
import {
  CreateStoreInputSchema,
  RegisterInputSchema,
  RESERVED_STORE_SLUGS,
  StoreSlugSchema,
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
