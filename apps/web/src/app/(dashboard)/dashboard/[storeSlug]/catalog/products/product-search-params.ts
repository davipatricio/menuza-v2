/**
 * URL state for the products list. Shared by the Server Component that filters
 * the catalog and the client toolbar that writes the filters back to the URL.
 */
import {
  createLoader,
  type inferParserType,
  parseAsArrayOf,
  parseAsBoolean,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

export const productSearchParams = {
  q: parseAsString.withDefault(""),
  status: parseAsStringLiteral(["all", "active", "inactive"] as const).withDefault("all"),
  visibility: parseAsStringLiteral(["all", "archived", "hidden", "private"] as const).withDefault(
    "all",
  ),
  category: parseAsString.withDefault(""),
  department: parseAsString.withDefault(""),
  tags: parseAsArrayOf(parseAsString).withDefault([]),
  view: parseAsStringLiteral(["table", "grid", "tree"] as const).withDefault("table"),
  priced: parseAsBoolean.withDefault(false),
  untagged: parseAsBoolean.withDefault(false),
};

export const loadProductSearchParams = createLoader(productSearchParams);

export type ProductSearchParams = inferParserType<typeof productSearchParams>;
