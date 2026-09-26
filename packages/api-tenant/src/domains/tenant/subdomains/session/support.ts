/**
 * Shared helpers for the tenant (management) session and panel procedures.
 *
 * The dashboard reads its bearer session straight from the `menuza_tenant_sid`
 * cookie; there is no tenant header involved (unlike the storefront/push flow).
 * Tenant-scoped lookups happen before a scope exists, so they are explicit
 * `unscoped()` calls with an explicit `tenantId` where one is known.
 */
import { ORPCError } from "@orpc/server";
import * as v from "valibot";
import { sharedErrorCodes } from "@menuza/shared/errors";
import {
  getCookieName,
  getSession,
  isMemberKind,
  isSameOriginRequest,
  isTenantRole,
  parseCookies,
} from "@menuza/orpc-server/auth";
import { db, unscoped } from "@menuza/db";
import {
  OnboardingPersonaSchema,
  OnboardingReferralSchema,
  OnboardingSegmentSchema,
  type Onboarding,
  type SessionMember,
  type SessionMembership,
} from "@menuza/shared/tenant";

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

export function conflict() {
  return new ORPCError("CONFLICT", {
    message: sharedErrorCodes.CONFLICT.message,
    data: { code: "CONFLICT" },
  });
}

/**
 * Rejects a state-changing request whose `Origin`/`Referer` does not match the
 * host the browser actually used. The Next rewrite proxies with
 * `changeOrigin: true`, so the original host arrives as `x-forwarded-host` and
 * the API's own `host` is the loopback target; compare against the former.
 * A non-browser caller that sends neither header is allowed through.
 */
export function assertSameOrigin(reqHeaders?: Headers): void {
  const sameOrigin = isSameOriginRequest({
    origin: reqHeaders?.get("origin"),
    referer: reqHeaders?.get("referer"),
    host: reqHeaders?.get("x-forwarded-host") ?? reqHeaders?.get("host"),
  });

  if (!sameOrigin) {
    throw new ORPCError("FORBIDDEN", {
      message: sharedErrorCodes.FORBIDDEN.message,
      data: { code: "FORBIDDEN" },
    });
  }
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

/**
 * The member's onboarding answers, or `null` when unanswered. Stored slugs are
 * validated against the contract picklists so a hand-edited row cannot leak an
 * out-of-contract value into the session payload.
 */
export async function loadOnboarding(memberId: string): Promise<Onboarding | null> {
  const row = await unscoped(() => db.orm.public.MemberOnboarding.where({ memberId }).first());

  if (!row) return null;

  const persona = v.safeParse(OnboardingPersonaSchema, row.persona);

  if (!persona.success) return null;

  const segment = v.safeParse(OnboardingSegmentSchema, row.segment);
  const referral = v.safeParse(OnboardingReferralSchema, row.referral);

  return {
    persona: persona.output,
    segment: segment.success ? segment.output : null,
    referral: referral.success ? referral.output : null,
  };
}
