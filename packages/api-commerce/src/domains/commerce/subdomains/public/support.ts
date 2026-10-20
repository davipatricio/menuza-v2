/**
 * Shared pieces of the storefront's public reads (MEN-260).
 *
 * The tenant id arrives as `x-menuza-tenant-id`, written server-side by the web
 * proxy's host→mode map and read by `tenantMiddleware({ require: "optional" })`.
 * A request without it is not an error: the storefront asks before a tenant is
 * known, so the procedures answer with empty results instead of failing.
 *
 * ponytail: the header is trusted as-is, which assumes only the proxy reaches
 * this loopback-bound service. Ceiling: a direct caller can forge the header
 * and read another store's public catalog (no secrets, but the wrong store).
 * Upgrade path: the tenant API's flow — host → `Domain` row, then membership —
 * rather than a second auth scheme invented here.
 */
import { db } from "@menuza/db";

/**
 * `Timestamp(3)` decodes as `Temporal.PlainDateTime` (UTC-naive, no offset), and
 * the contract's `isoTimestamp()` rejects a string without one — re-attach UTC
 * at the edge, exactly like the tenant panel does.
 */
export function toIsoTimestamp(value: Temporal.PlainDateTime): string {
  return `${value.toString({ smallestUnit: "second" })}Z`;
}

/** The tenant row, or `null` when the request carries no resolved tenant. */
export function loadTenant(tenantId: string | undefined) {
  return tenantId === undefined ? null : db.orm.public.Tenant.where({ id: tenantId }).first();
}
