/**
 * URL state for the departments list. The taxonomy lists sort and filter in
 * SQL, so the page forwards these keys to `listDepartments` and the client
 * toolbar only writes them back to the URL.
 */
import {
  createLoader,
  type inferParserType,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

export const departmentSearchParams = {
  q: parseAsString.withDefault(""),
  status: parseAsStringLiteral(["all", "active", "inactive"] as const).withDefault("all"),
  sort: parseAsStringLiteral(["name", "itemsCount", "updatedAt"] as const).withDefault("name"),
  order: parseAsStringLiteral(["asc", "desc"] as const).withDefault("asc"),
};

export const loadDepartmentSearchParams = createLoader(departmentSearchParams);

export type DepartmentSearchParams = inferParserType<typeof departmentSearchParams>;
