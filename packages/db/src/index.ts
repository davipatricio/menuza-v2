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

export type { Contract, Models } from "../prisma/generated/client/contract.ts";
