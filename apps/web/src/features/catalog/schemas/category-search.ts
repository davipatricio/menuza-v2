/**
 * URL state for the categories list. The taxonomy lists sort and filter in SQL,
 * so the page forwards these keys to `listCategories` and the client toolbar
 * only writes them back to the URL.
 */
import {
  createLoader,
  type inferParserType,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

export const categorySearchParams = {
  q: parseAsString.withDefault(""),
  status: parseAsStringLiteral(["all", "active", "inactive"] as const).withDefault("all"),
  department: parseAsString.withDefault(""),
  sort: parseAsStringLiteral(["name", "itemsCount", "updatedAt", "sortOrder"] as const).withDefault(
    "sortOrder",
  ),
  order: parseAsStringLiteral(["asc", "desc"] as const).withDefault("asc"),
};

export const loadCategorySearchParams = createLoader(categorySearchParams);

export type CategorySearchParams = inferParserType<typeof categorySearchParams>;
