/**
 * URL state for the tags list. The dashboard writes the header sort here and
 * the page forwards it to `listTags`, which orders the server response.
 */
import { createLoader, type inferParserType, parseAsStringLiteral } from "nuqs/server";

export const tagSearchParams = {
  sort: parseAsStringLiteral(["name", "itemsCount"] as const).withDefault("name"),
  order: parseAsStringLiteral(["asc", "desc"] as const).withDefault("asc"),
};

export const loadTagSearchParams = createLoader(tagSearchParams);

export type TagSearchParams = inferParserType<typeof tagSearchParams>;
