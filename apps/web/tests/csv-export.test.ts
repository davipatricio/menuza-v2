import { describe, expect, test } from "bun:test";
import { sanitizeCsvCell } from "../src/lib/csv-export.ts";

describe("csv-export", () => {
  test("neutralizes formula injection characters", () => {
    expect(sanitizeCsvCell("=1+1")).toBe("'=1+1");
    expect(sanitizeCsvCell("+cmd")).toBe("'+cmd");
    expect(sanitizeCsvCell("-5")).toBe("'-5");
    expect(sanitizeCsvCell("@SUM(A1:A5)")).toBe("'@SUM(A1:A5)");
  });

  test("properly quotes commas and quotes", () => {
    expect(sanitizeCsvCell('Hello, "World"')).toBe('"Hello, ""World"""');
    expect(sanitizeCsvCell("Simple text")).toBe("Simple text");
  });

  test("handles empty and nullish", () => {
    expect(sanitizeCsvCell(null)).toBe("");
    expect(sanitizeCsvCell(undefined)).toBe("");
  });
});
