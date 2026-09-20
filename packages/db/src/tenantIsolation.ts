/**
 * Fail-closed multi-tenant isolation for Prisma 8.
 *
 * Ensures that any read, update, delete, or insert on a tenant-scoped model:
 *  - Must include an explicit conjunctive equality filter on `tenantId` (`where.tenantId = ...`).
 *  - Prohibits operators like `neq`, `in`, or disjunctions (`or`) from bypassing tenant scoping.
 *  - Prohibits mutating `tenantId` during updates (no cross-tenant reassignment).
 *  - If executed inside an active tenant scope (e.g. from tenantMiddleware or withTenant),
 *    the `tenantId` MUST match the active tenant scope (rejecting cross-tenant queries).
 *  - Global queries (e.g. proxy domain-by-host lookup) must be explicitly marked via `unscoped()`.
 */
import { getActiveTenantId, isUnscoped } from "@menuza/tenant-context";
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

/**
 * Finds a top-level conjunctive equality constraint on `tenantId` in the WHERE clause.
 * Returns the equality target value if present, or `null` if absent or not strictly conjunctive.
 */
function findConjunctiveTenantEquality(where: any): string | null {
  if (!where) return null;

  // Single binary eq: tenantId = '...'
  if (where.kind === "binary" && where.op === "eq") {
    if (
      where.left?.kind === "column-ref" &&
      where.left.column === "tenantId" &&
      where.right?.kind === "param-ref"
    ) {
      return String(where.right.value);
    }

    if (
      where.right?.kind === "column-ref" &&
      where.right.column === "tenantId" &&
      where.left?.kind === "param-ref"
    ) {
      return String(where.left.value);
    }

    return null;
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

/**
 * Validates that no sub-expression within `where` references another tenant or uses non-equality operators on tenantId.
 */
function validateNoCrossTenantRefs(expr: any, activeTenant: string): void {
  if (!expr) return;

  if (expr.kind === "binary") {
    const isTenantCol =
      (expr.left?.kind === "column-ref" && expr.left.column === "tenantId") ||
      (expr.right?.kind === "column-ref" && expr.right.column === "tenantId");

    if (isTenantCol) {
      if (expr.op !== "eq") {
        throw new TenantIsolationError(
          `Disallowed operator "${expr.op}" on tenantId in tenant-scoped model`,
        );
      }

      const val =
        expr.left?.kind === "param-ref"
          ? String(expr.left.value)
          : expr.right?.kind === "param-ref"
            ? String(expr.right.value)
            : undefined;

      if (val !== undefined && val !== activeTenant) {
        throw new TenantIsolationError(
          `Cross-tenant access violation: query contains tenantId "${val}" which does not match active tenant "${activeTenant}"`,
        );
      }
    }
  }

  if (Array.isArray(expr.exprs)) {
    for (const child of expr.exprs) {
      validateNoCrossTenantRefs(child, activeTenant);
    }
  }
}

export function tenantIsolationMiddleware(): SqlMiddleware {
  const checkPlan = (plan: any) => {
    if (!plan?.ast) return;

    // Determine target table name
    const tableName = plan.ast.table?.name || plan.ast.from?.name;

    if (!tableName || !TENANT_SCOPED_MODELS.has(tableName)) {
      return;
    }

    // Explicit unscoped escape hatch (e.g. host domain resolution in proxy.ts)
    if (isUnscoped()) {
      return;
    }

    const activeTenantId = getActiveTenantId();

    // Check insert statements
    if (plan.ast.kind === "insert") {
      const rows = plan.ast.rows || [];

      for (const row of rows) {
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

      return;
    }

    // Check update assignments (prevent cross-tenant row transfers)
    if (plan.ast.kind === "update" && plan.ast.set && "tenantId" in plan.ast.set) {
      const newTenantId = plan.ast.set.tenantId?.value;

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

    // Check where clause for queries (select, update, delete)
    const conjunctiveTenantId = findConjunctiveTenantEquality(plan.ast.where);

    if (!conjunctiveTenantId) {
      throw new TenantIsolationError(
        `Tenant-scoped model "${tableName}" queried without where.tenantId equality filter`,
      );
    }

    // Check for cross-tenant mismatch if there's an active tenant context
    if (activeTenantId) {
      if (conjunctiveTenantId !== activeTenantId) {
        throw new TenantIsolationError(
          `Cross-tenant access violation: query tenantId "${conjunctiveTenantId}" does not match active tenantId "${activeTenantId}"`,
        );
      }

      validateNoCrossTenantRefs(plan.ast.where, activeTenantId);
    }
  };

  return {
    name: "tenant-isolation",
    familyId: "sql",
    beforeQuery: checkPlan,
    beforeExecute: checkPlan,
  };
}
