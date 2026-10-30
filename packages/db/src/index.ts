/**
 * Public surface: types + the singleton client.
 * Server-only: do NOT import from browser code.
 */
export { db, pingDb, disconnectDb, type Db, type DbTransaction } from "./client.ts";

export {
  TenantIsolationError,
  TENANT_SCOPED_MODELS,
  tenantIsolationMiddleware,
} from "./tenantIsolation.ts";

export { withTenant, unscoped, getActiveTenantId, isUnscoped } from "./scope/scope.ts";

export type { TenantContext, OptionalTenantContext } from "./scope/types.ts";

// The stock a variation carries. The schema says a controlled variation has a
// quantity and an unlimited one has none; this is where that quantity moves.
export {
  releaseVariationStock,
  reserveVariationStock,
  stockLinesFor,
  type StockLine,
  type StockOrderLine,
  type StockReservation,
} from "./stock.ts";

// The coupon ledger. Shared by the commerce checkout and the dashboard order
// actions, so a release agrees on both paths.
export { releaseCouponRedemptions } from "./couponRedemption.ts";

// ORM predicate combinators. Re-exported so consumers compose `where` callbacks
// without taking a direct dependency on the Prisma package: `@menuza/db` owns
// that version pin, and the combinators only exist alongside a contract.
export { and, or, not } from "@prisma/orm-postgres/orm-client";

export type { Contract, Models } from "../prisma/generated/client/contract.ts";
