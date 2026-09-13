import { describe, expect, test } from "bun:test";

import { isFourXxCode } from "../src/errors/severity.ts";
import { sharedErrorCodes } from "../src/errors/index.ts";

const CANONICAL_CODES = [
  "TENANT_NOT_RESOLVED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "VALIDATION_FAILED",
  "RATE_LIMITED",
  "INTERNAL",
] as const;

describe("isFourXxCode", () => {
  test("classifies 4xx client codes as true", () => {
    expect(isFourXxCode("UNAUTHORIZED")).toBe(true);
    expect(isFourXxCode("NOT_FOUND")).toBe(true);
    expect(isFourXxCode("TENANT_NOT_RESOLVED")).toBe(true);
  });

  test("classifies 5xx and unknown codes as false", () => {
    expect(isFourXxCode("INTERNAL")).toBe(false);
    expect(isFourXxCode("FOO")).toBe(false);
    expect(isFourXxCode(undefined)).toBe(false);
  });
});

describe("sharedErrorCodes", () => {
  test("exposes all eight canonical codes", () => {
    for (const code of CANONICAL_CODES) {
      expect(sharedErrorCodes).toHaveProperty(code);
    }

    expect(Object.keys(sharedErrorCodes)).toHaveLength(CANONICAL_CODES.length);
  });

  test("carries a non-empty message for every code", () => {
    for (const [code, entry] of Object.entries(sharedErrorCodes)) {
      expect(CANONICAL_CODES).toContain(code);
      expect(entry.message.length).toBeGreaterThan(0);
    }
  });
});
