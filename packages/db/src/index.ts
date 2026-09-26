/**
 * Public surface: types + the singleton client.
 * Server-only: do NOT import from browser code.
 */
export { db, pingDb, disconnectDb, type Db } from "./client.ts";

export {
  TenantIsolationError,
  TENANT_SCOPED_MODELS,
  tenantIsolationMiddleware,
} from "./tenantIsolation.ts";

export { withTenant, unscoped, getActiveTenantId, isUnscoped } from "./scope/scope.ts";

export type { TenantContext, OptionalTenantContext } from "./scope/types.ts";

// ORM predicate combinators. Re-exported so consumers compose `where` callbacks
// without taking a direct dependency on the Prisma package: `@menuza/db` owns
// that version pin, and the combinators only exist alongside a contract.
export { and, or, not } from "@prisma/orm-postgres/orm-client";

export type { Contract, Models } from "../prisma/generated/client/contract.ts";
