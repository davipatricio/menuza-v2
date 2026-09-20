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

export { withTenant, unscoped, getActiveTenantId, isUnscoped } from "@menuza/tenant-context";

export type { Contract, Models } from "../prisma/generated/client/contract.ts";
