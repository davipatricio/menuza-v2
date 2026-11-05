/**
 * URL state for the kits list. `listKits` returns every kit of the store, so the
 * filtering stays in the client; the keys live in the URL all the same, for
 * reload and sharing.
 */
import {
  createLoader,
  type inferParserType,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

export const kitSearchParams = {
  q: parseAsString.withDefault(""),
  status: parseAsStringLiteral(["all", "active", "archived"] as const).withDefault("all"),
  kind: parseAsStringLiteral([
    "all",
    "fixed",
    "custom_quantities",
    "fixed_total",
  ] as const).withDefault("all"),
};

export const loadKitSearchParams = createLoader(kitSearchParams);

export type KitSearchParams = inferParserType<typeof kitSearchParams>;
