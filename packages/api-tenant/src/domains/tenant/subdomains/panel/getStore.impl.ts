import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db, unscoped } from "@menuza/db";
import { canonicalRole, notFound, requireSession, toSessionMember } from "../session/support.ts";

const os = implement(
  tenantContractObject.panel.getStore,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * Resolves the `storeSlug` from the dashboard URL to a tenant and verifies the
 * caller's membership. A non-member and an unknown store both yield NOT_FOUND,
 * so the endpoint never reveals whether a store exists.
 */
export const getStoreImpl = os.handler(async ({ input, context }) => {
  const session = await requireSession(context.reqHeaders);

  const tenant = await unscoped(() =>
    db.orm.public.Tenant.where({ slug: input.storeSlug }).first(),
  );

  if (!tenant) throw notFound();

  const membership = await unscoped(() =>
    db.orm.public.TenantMembership.where({
      memberId: session.memberId,
      tenantId: tenant.id,
    }).first(),
  );

  if (!membership) throw notFound();

  const member = await unscoped(() => db.orm.public.Member.where({ id: session.memberId }).first());

  if (!member) throw notFound();

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.displayName,
    role: canonicalRole(membership.role),
    member: toSessionMember(member),
  };
});

export type GetStoreImpl = typeof getStoreImpl;
