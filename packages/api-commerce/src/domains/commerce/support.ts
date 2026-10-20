/**
 * Small shared pieces of the orders and wallet procedures.
 *
 * The tenant arrives as `x-menuza-tenant-id`, written server-side by the web
 * proxy exactly like the storefront reads (`../public/support.ts`); the caller
 * is a **store member**, resolved from the commerce session cookie
 * (`menuza_commerce_sid`, `@menuza/orpc-server/auth`) and their
 * `TenantMembership` row. A non-member gets `NOT_FOUND`, so the endpoint never
 * leaks whether a store exists.
 *
 * Capabilities come from the code-level map (`can`), never from the stored role
 * string: `orders:refund` and `wallet:adjust` are what actually gate the money,
 * and a role the map does not know lands on the least-privileged one.
 *
 * ponytail: nothing issues a `menuza_commerce_sid` yet (the buyer session is
 * MEN-76/MEN-214), so these routes are reachable only by a caller that already
 * holds one. Ceiling: no browser flow works until that login ships. Upgrade
 * path: the buyer session opens the same cookie; no new auth scheme here.
 */
import { ORPCError } from "@orpc/server";
import { sharedErrorCodes } from "@menuza/shared/errors";
import {
  TENANT_CAPABILITIES,
  can,
  getCookieName,
  getSession,
  getTenantMembership,
  isTenantRole,
  parseCookies,
  type TenantCapability,
  type TenantRole,
} from "@menuza/orpc-server/auth";
import type { TransitionActor } from "@menuza/shared/commerce";

/** The authenticated member acting on the resolved tenant store. */
export interface StoreMember {
  readonly memberId: string;
  readonly role: TenantRole;
}

export function unauthorized() {
  return new ORPCError("UNAUTHORIZED", {
    message: sharedErrorCodes.UNAUTHORIZED.message,
    data: { code: "UNAUTHORIZED" },
  });
}

export function notFound() {
  return new ORPCError("NOT_FOUND", {
    message: sharedErrorCodes.NOT_FOUND.message,
    data: { code: "NOT_FOUND" },
  });
}

export function conflict() {
  return new ORPCError("CONFLICT", {
    message: sharedErrorCodes.CONFLICT.message,
    data: { code: "CONFLICT" },
  });
}

export function validationFailed() {
  return new ORPCError("VALIDATION_FAILED", {
    message: sharedErrorCodes.VALIDATION_FAILED.message,
    data: { code: "VALIDATION_FAILED" },
  });
}

/**
 * Resolves the commerce session and the member's role on `tenantId`. Must run
 * inside the tenant scope `tenantMiddleware` opens: `getTenantMembership`
 * queries `TenantMembership` with an explicit `tenantId`.
 */
export async function requireMember(
  reqHeaders: Headers | undefined,
  tenantId: string,
): Promise<StoreMember> {
  const token = parseCookies(reqHeaders?.get("cookie"))[getCookieName("commerce")];

  if (!token) throw unauthorized();

  const session = await getSession(token);

  if (!session || session.namespace !== "commerce") throw unauthorized();

  const membership = await getTenantMembership(session.id, session.memberId, tenantId);

  if (!membership) throw notFound();

  return {
    memberId: session.memberId,
    role: isTenantRole(membership.role) ? membership.role : "staff",
  };
}

export function requireCapability(role: TenantRole, capability: TenantCapability): void {
  if (can(role, capability)) return;

  throw new ORPCError("FORBIDDEN", {
    message: sharedErrorCodes.FORBIDDEN.message,
    data: { code: "FORBIDDEN" },
  });
}

/** The pure engine's view of the caller: role expanded into capability names. */
export function actorOf(member: StoreMember): TransitionActor {
  return {
    memberId: member.memberId,
    capabilities: TENANT_CAPABILITIES.filter((capability) => can(member.role, capability)),
  };
}

/** `Timestamp(3)` decodes as a UTC-naive `PlainDateTime`; the engine wants a `Date`. */
export function toDate(value: Temporal.PlainDateTime): Date {
  return new Date(value.toZonedDateTime("UTC").epochMilliseconds);
}

export function toPlainDateTime(value: Date): Temporal.PlainDateTime {
  return Temporal.Instant.from(value.toISOString()).toZonedDateTimeISO("UTC").toPlainDateTime();
}

/** `Timestamp(3)` is UTC-naive; the contract's `isoTimestamp()` needs the offset. */
export function isoOf(value: Temporal.PlainDateTime): string {
  return `${value.toString({ smallestUnit: "second" })}Z`;
}

export function optionalIso(value: Temporal.PlainDateTime | null | undefined): string | null {
  return value == null ? null : isoOf(value);
}
