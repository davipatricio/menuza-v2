import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db, unscoped } from "@menuza/db";
import { notFound, toSessionMember } from "../session/support.ts";
import { resolveStore } from "./support.ts";

const os = implement(
  tenantContractObject.panel.getStore,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * Resolves the `storeSlug` from the dashboard URL to a tenant and verifies the
 * caller's membership. A non-member and an unknown store both yield NOT_FOUND,
 * so the endpoint never reveals whether a store exists.
 */
export const getStoreImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  const member = await unscoped(() =>
    db.orm.public.Member.where({ id: store.session.memberId }).first(),
  );

  if (!member) throw notFound();

  return {
    tenantId: store.tenantId,
    tenantSlug: store.tenantSlug,
    tenantName: store.tenantName,
    role: store.role,
    member: toSessionMember(member),
  };
});

export type GetStoreImpl = typeof getStoreImpl;
