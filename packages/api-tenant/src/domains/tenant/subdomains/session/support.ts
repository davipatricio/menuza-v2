/**
 * Shared helpers for the tenant (management) session and panel procedures.
 *
 * The dashboard reads its bearer session straight from the `menuza_tenant_sid`
 * cookie; there is no tenant header involved (unlike the storefront/push flow).
 * Tenant-scoped lookups happen before a scope exists, so they are explicit
 * `unscoped()` calls with an explicit `tenantId` where one is known.
 */
import { ORPCError } from "@orpc/server";
import { sharedErrorCodes } from "@menuza/shared/errors";
import {
  getCookieName,
  getSession,
  isMemberKind,
  isTenantRole,
  parseCookies,
} from "@menuza/orpc-server/auth";
import { db, unscoped } from "@menuza/db";
import type { SessionMember, SessionMembership } from "@menuza/shared/tenant";

/** A stored session as the management procedures need it. */
export interface TenantSessionRow {
  readonly id: string;
  readonly memberId: string;
}

function unauthorized() {
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

/**
 * Reads and validates the management session from the request cookie.
 * Throws `UNAUTHORIZED` when the cookie is absent, unknown, expired or revoked.
 */
export async function requireSession(reqHeaders?: Headers): Promise<TenantSessionRow> {
  const cookie = parseCookies(reqHeaders?.get("cookie"))[getCookieName("tenant")];

  if (!cookie) throw unauthorized();

  const session = await getSession(cookie);

  if (!session || session.namespace !== "tenant") throw unauthorized();

  return { id: session.id, memberId: session.memberId };
}

/**
 * Roles are free-text columns; the capability map is what actually gates
 * actions. An unrecognized stored value is treated as the least-privileged
 * known role rather than hidden from the picker.
 */
export function canonicalRole(role: string) {
  return isTenantRole(role) ? role : "staff";
}

export function toSessionMember(member: {
  id: string;
  email: string;
  name: string | null;
  kind: string;
}): SessionMember {
  return {
    id: member.id,
    email: member.email,
    name: member.name,
    kind: isMemberKind(member.kind) ? member.kind : "human",
  };
}

/** Memberships of a member, with their tenant's slug and display name. */
export async function loadMemberships(memberId: string): Promise<SessionMembership[]> {
  const rows = await unscoped(() => db.orm.public.TenantMembership.where({ memberId }).all());

  const tenants = await unscoped(() =>
    Promise.all(rows.map((row) => db.orm.public.Tenant.where({ id: row.tenantId }).first())),
  );

  return rows.flatMap((row, index) => {
    const tenant = tenants[index];

    if (!tenant) return [];

    return [
      {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        tenantName: tenant.displayName,
        role: canonicalRole(row.role),
      },
    ];
  });
}
