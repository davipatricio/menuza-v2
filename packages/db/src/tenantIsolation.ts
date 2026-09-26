/**
 * Fail-closed multi-tenant isolation for Prisma 8.
 *
 * Ensures that any read, update, delete, or insert on a tenant-scoped model:
 *  - Must include an explicit conjunctive equality filter on `tenantId` (`where.tenantId = ...`).
 *  - Prohibits operators like `neq`, `in`, or disjunctions (`or`) from bypassing tenant scoping.
 *  - Prohibits mutating `tenantId` during updates (no cross-tenant reassignment).
 *  - If executed inside an active tenant scope (e.g. from tenantMiddleware or withTenant),
 *    the `tenantId` MUST match the active tenant scope (rejecting cross-tenant queries).
 *  - Global queries (e.g. storefront host → tenant lookup in the tenant API)
 *    must be explicitly marked via `unscoped()`.
 */
import { getActiveTenantId, isUnscoped } from "./scope/scope.ts";
import type { SqlMiddleware } from "@prisma/orm-postgres/family-runtime";
import contractJson from "../prisma/generated/client/contract.json" with { type: "json" };

export class TenantIsolationError extends Error {
  readonly code = "TENANT_ISOLATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

interface ContractFieldDef {
  readonly nullable?: boolean;
}

interface ContractModelDef {
  readonly fields?: Record<string, ContractFieldDef>;
}

interface ContractStructure {
  readonly domain?: {
    readonly namespaces?: {
      readonly public?: {
        readonly models?: Record<string, ContractModelDef>;
      };
    };
  };
}

// SAFETY: contract.json is emitted by Prisma contract emit matching ContractStructure.
const contract = contractJson as ContractStructure;

const publicModels = contract.domain?.namespaces?.public?.models ?? {};

export const TENANT_SCOPED_MODELS = new Set<string>(
  Object.entries(publicModels)
    .filter(([, def]) => Boolean(def.fields && "tenantId" in def.fields))
    .map(([name]) => name),
);

/** Matches `tenantId = <param>` in either operand order. */
function isTenantEquality(node: any): boolean {
  const leftIsTenant = node.left?.kind === "column-ref" && node.left.column === "tenantId";
  const rightIsTenant = node.right?.kind === "column-ref" && node.right.column === "tenantId";

  if (leftIsTenant && node.right?.kind === "param-ref") return true;

  return rightIsTenant && node.left?.kind === "param-ref";
}

/**
 * Finds a top-level conjunctive equality constraint on `tenantId` in the WHERE clause.
 * Returns the equality target value if present, or `null` if absent or not strictly conjunctive.
 */
function findConjunctiveTenantEquality(where: any): string | null {
  if (!where) return null;

  // Single binary eq: tenantId = '...'
  if (where.kind === "binary" && where.op === "eq") {
    if (!isTenantEquality(where)) return null;

    const value = where.left?.kind === "param-ref" ? where.left.value : where.right?.value;

    return String(value);
  }

  // Conjunctive 'and' expressions: at least one branch must enforce tenant equality
  if (where.kind === "and" && Array.isArray(where.exprs)) {
    for (const expr of where.exprs) {
      const found = findConjunctiveTenantEquality(expr);

      if (found !== null) {
        return found;
      }
    }
  }

  return null;
}

/** Resolves the value a binary node compares `tenantId` against, if either side is a bound param. */
function readTenantParamValue(expr: any): string | undefined {
  if (expr.left?.kind === "param-ref") return String(expr.left.value);

  if (expr.right?.kind === "param-ref") return String(expr.right.value);

  return undefined;
}

/** True when either side of a binary node references the `tenantId` column. */
function touchesTenantColumn(expr: any): boolean {
  return (
    (expr.left?.kind === "column-ref" && expr.left.column === "tenantId") ||
    (expr.right?.kind === "column-ref" && expr.right.column === "tenantId")
  );
}

function assertTenantBinaryRef(expr: any, activeTenant: string): void {
  if (!touchesTenantColumn(expr)) return;

  if (expr.op !== "eq") {
    throw new TenantIsolationError(
      `Disallowed operator "${expr.op}" on tenantId in tenant-scoped model`,
    );
  }

  const val = readTenantParamValue(expr);

  if (val !== undefined && val !== activeTenant) {
    throw new TenantIsolationError(
      `Cross-tenant access violation: query contains tenantId "${val}" which does not match active tenant "${activeTenant}"`,
    );
  }
}

/**
 * Validates that no sub-expression within `where` references another tenant or uses non-equality operators on tenantId.
 */
function validateNoCrossTenantRefs(expr: any, activeTenant: string): void {
  if (!expr) return;

  if (expr.kind === "binary") assertTenantBinaryRef(expr, activeTenant);

  if (Array.isArray(expr.exprs)) {
    for (const child of expr.exprs) {
      validateNoCrossTenantRefs(child, activeTenant);
    }
  }
}

/** Every inserted row must carry the active tenantId. */
function assertInsertRows(ast: any, tableName: string, activeTenantId: string | undefined): void {
  for (const row of ast.rows || []) {
    const rowTenantId = row.tenantId?.value;

    if (!rowTenantId) {
      throw new TenantIsolationError(
        `Tenant-scoped model "${tableName}" inserted without tenantId`,
      );
    }

    if (activeTenantId && rowTenantId !== activeTenantId) {
      throw new TenantIsolationError(
        `Cross-tenant access violation: inserted tenantId "${rowTenantId}" does not match active tenantId "${activeTenantId}"`,
      );
    }
  }
}

/** Reassigning `tenantId` on a tenant-scoped model is a cross-tenant row transfer; never allowed. */
function assertNoTenantReassignment(
  ast: any,
  tableName: string,
  activeTenantId: string | undefined,
): void {
  if (ast.kind !== "update" || !ast.set || !("tenantId" in ast.set)) return;

  const newTenantId = ast.set.tenantId?.value;

  if (activeTenantId && newTenantId !== activeTenantId) {
    throw new TenantIsolationError(
      `Cross-tenant access violation: cannot reassign tenantId in model "${tableName}" to "${newTenantId}"`,
    );
  }

  if (!activeTenantId) {
    throw new TenantIsolationError(
      `Cannot reassign tenantId on tenant-scoped model "${tableName}" outside unscoped()`,
    );
  }
}

/** Select, update and delete must filter on the active tenant, with no stray reference. */
function assertWhereClause(ast: any, tableName: string, activeTenantId: string | undefined): void {
  const conjunctiveTenantId = findConjunctiveTenantEquality(ast.where);

  if (!conjunctiveTenantId) {
    throw new TenantIsolationError(
      `Tenant-scoped model "${tableName}" queried without where.tenantId equality filter`,
    );
  }

  if (!activeTenantId) return;

  if (conjunctiveTenantId !== activeTenantId) {
    throw new TenantIsolationError(
      `Cross-tenant access violation: query tenantId "${conjunctiveTenantId}" does not match active tenantId "${activeTenantId}"`,
    );
  }

  validateNoCrossTenantRefs(ast.where, activeTenantId);
}

export function tenantIsolationMiddleware(): SqlMiddleware {
  const checkPlan = (plan: any) => {
    if (!plan?.ast) return;

    // Determine target table name
    const tableName = plan.ast.table?.name || plan.ast.from?.name;

    if (!tableName || !TENANT_SCOPED_MODELS.has(tableName)) {
      return;
    }

    // Explicit unscoped escape hatch (e.g. host domain resolution in the tenant API)
    if (isUnscoped()) {
      return;
    }

    const activeTenantId = getActiveTenantId();

    if (plan.ast.kind === "insert") {
      assertInsertRows(plan.ast, tableName, activeTenantId);

      return;
    }

    assertNoTenantReassignment(plan.ast, tableName, activeTenantId);
    assertWhereClause(plan.ast, tableName, activeTenantId);
  };

  return {
    name: "tenant-isolation",
    familyId: "sql",
    beforeQuery: checkPlan,
    beforeExecute: checkPlan,
  };
}
