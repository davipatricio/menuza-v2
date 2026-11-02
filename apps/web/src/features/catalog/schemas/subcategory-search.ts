/**
 * URL state for the subcategories list. The taxonomy lists sort and filter in
 * SQL, so the page forwards these keys to `listSubcategories`.
 */
import {
  createLoader,
  type inferParserType,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

export const subcategorySearchParams = {
  q: parseAsString.withDefault(""),
  status: parseAsStringLiteral(["all", "active", "inactive"] as const).withDefault("all"),
  category: parseAsString.withDefault(""),
  sort: parseAsStringLiteral(["name", "itemsCount", "updatedAt", "sortOrder"] as const).withDefault(
    "sortOrder",
  ),
  order: parseAsStringLiteral(["asc", "desc"] as const).withDefault("asc"),
};

export const loadSubcategorySearchParams = createLoader(subcategorySearchParams);

export type SubcategorySearchParams = inferParserType<typeof subcategorySearchParams>;
