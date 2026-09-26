/**
 * The guard every panel read reuses.
 *
 * `getStoreImpl` resolves `storeSlug -> tenant` and checks membership before it
 * opens a scope; the listing procedures need the same decision plus a tenant to
 * scope their queries to. So the resolution lives here and `getStoreImpl` calls
 * it too, rather than each listing re-deriving the rule.
 *
 * A non-member and an unknown slug both yield NOT_FOUND, so the endpoint never
 * reveals whether a store exists.
 */
import { db, unscoped, withTenant } from "@menuza/db";
import {
  canonicalRole,
  notFound,
  requireSession,
  type TenantSessionRow,
} from "../session/support.ts";
import type { TenantRole } from "@menuza/shared/tenant";

export interface ResolvedStore {
  readonly session: TenantSessionRow;
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly tenantName: string;
  readonly role: TenantRole;
}

/**
 * Reads the management session from the request cookie, resolves the slug to a
 * tenant and verifies the caller is a member. Throws `UNAUTHORIZED` without a
 * session and `NOT_FOUND` for an unknown store or a non-member.
 */
export async function resolveStore(
  reqHeaders: Headers | undefined,
  storeSlug: string,
): Promise<ResolvedStore> {
  const session = await requireSession(reqHeaders);

  const tenant = await unscoped(() => db.orm.public.Tenant.where({ slug: storeSlug }).first());

  if (!tenant) throw notFound();

  const membership = await unscoped(() =>
    db.orm.public.TenantMembership.where({
      memberId: session.memberId,
      tenantId: tenant.id,
    }).first(),
  );

  if (!membership) throw notFound();

  return {
    session,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.displayName,
    role: canonicalRole(membership.role),
  };
}

/**
 * Runs `fn` inside the tenant scope. Every query `fn` issues still has to carry
 * an explicit `where.tenantId` — the isolation middleware rejects a scoped query
 * that does not — so the scope is a second line of defence, not a substitute.
 */
export function inTenantScope<T>(tenantId: string, fn: () => T | Promise<T>): Promise<T> {
  return withTenant(tenantId, fn);
}
