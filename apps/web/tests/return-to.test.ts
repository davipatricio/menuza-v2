import { describe, expect, test } from "bun:test";
import { safeReturnTo } from "../src/lib/return-to.ts";

describe("safeReturnTo", () => {
  test("keeps a same-origin absolute path", () => {
    expect(safeReturnTo("/oauth/authorize?client_id=abc")).toBe("/oauth/authorize?client_id=abc");
  });

  test("falls back to the dashboard for a hostile or empty value", () => {
    expect(safeReturnTo("https://evil.example/phish")).toBe("/dashboard");
    expect(safeReturnTo("//evil.example/phish")).toBe("/dashboard");
    expect(safeReturnTo("dashboard")).toBe("/dashboard");
    expect(safeReturnTo(undefined)).toBe("/dashboard");
    expect(safeReturnTo(null)).toBe("/dashboard");
  });

  test("uses the first value of a repeated query param", () => {
    expect(safeReturnTo(["/oauth/authorize", "//evil.example"])).toBe("/oauth/authorize");
  });
});
