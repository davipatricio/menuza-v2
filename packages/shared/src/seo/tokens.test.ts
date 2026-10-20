import { describe, expect, test } from "bun:test";
import { applySeoTokens } from "./tokens.ts";
import type { SeoContext } from "./types.ts";

const CONTEXT: SeoContext = { storeName: "Pão da Vila", entityName: "Pão de queijo" };

describe("applySeoTokens", () => {
  test("replaces all three tokens", () => {
    expect(applySeoTokens("%entity% — %store% em %city%", { ...CONTEXT, city: "Recife" })).toBe(
      "Pão de queijo — Pão da Vila em Recife",
    );
  });

  test("leaves unknown tokens untouched", () => {
    expect(applySeoTokens("%foo% %entity% %BAR%", CONTEXT)).toBe("%foo% Pão de queijo %BAR%");
  });

  test("resolves %city% to nothing when the context carries no city", () => {
    expect(applySeoTokens("%entity% · %city%", CONTEXT)).toBe("Pão de queijo ·");
  });

  test("collapses the whitespace a substitution introduces", () => {
    expect(applySeoTokens("%entity%   em    %store%", { ...CONTEXT, city: undefined })).toBe(
      "Pão de queijo em Pão da Vila",
    );
    expect(applySeoTokens("  %city% %entity%  ", CONTEXT)).toBe("Pão de queijo");
  });

  test("returns a token-free template byte for byte", () => {
    expect(applySeoTokens("  Menuza   storefront  ", CONTEXT)).toBe("  Menuza   storefront  ");
    expect(applySeoTokens("", CONTEXT)).toBe("");
  });
});
