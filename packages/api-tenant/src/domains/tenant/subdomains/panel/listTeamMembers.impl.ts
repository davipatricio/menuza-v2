import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { isMemberKind } from "@menuza/orpc-server/auth";
import { db } from "@menuza/db";
import { canonicalRole } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { toPanelTimestamp } from "./format.ts";

const os = implement(
  tenantContractObject.panel.listTeamMembers,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * The store's team, read-only (MEN-225). Inviting and changing a role are
 * out of scope: inviting needs email delivery, which is its own ticket.
 *
 * Gated on `team:read`, so a `staff` member — whose capability set is
 * dashboard/orders only — is refused here while still reading orders. The
 * `Member` rows come back through the eager load, so a membership whose member
 * was deleted cannot produce a nameless row.
 */
export const listTeamMembersImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "team:read");

  const memberships = await inTenantScope(store.tenantId, () =>
    db.orm.public.TenantMembership.include("member", (member) =>
      member.select("id", "name", "email", "kind"),
    )
      .where({ tenantId: store.tenantId })
      .orderBy((row) => row.createdAt.asc())
      .all(),
  );

  return {
    members: memberships.map((row) => {
      // `TenantMembership.memberId` is NOT NULL with a RESTRICT FK, so the
      // eager load always resolves; Prisma types it nullable regardless.
      const member = row.member;

      if (!member) {
        throw new Error(`Membership ${row.id} names member ${row.memberId}, which is gone`);
      }

      return {
        memberId: member.id,
        name: member.name,
        email: member.email,
        kind: isMemberKind(member.kind) ? member.kind : "human",
        // Roles are free-text columns; an unrecognized stored value is the
        // least-privileged known role rather than a hidden member.
        role: canonicalRole(row.role),
        joinedAt: toPanelTimestamp(row.createdAt),
      };
    }),
  };
});

export type ListTeamMembersImpl = typeof listTeamMembersImpl;
