import { implement, ORPCError } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { sharedErrorCodes } from "@menuza/shared/errors";
import { db, unscoped } from "@menuza/db";
import { loadMemberships, loadOnboarding, requireSession, toSessionMember } from "./support.ts";

const os = implement(
  tenantContractObject.session.current,
).$context<RequestHeadersHandlerPluginContext>();

export const currentImpl = os.handler(async ({ context }) => {
  const session = await requireSession(context.reqHeaders);

  const member = await unscoped(() => db.orm.public.Member.where({ id: session.memberId }).first());

  if (!member) {
    throw new ORPCError("UNAUTHORIZED", {
      message: sharedErrorCodes.UNAUTHORIZED.message,
      data: { code: "UNAUTHORIZED" },
    });
  }

  return {
    member: toSessionMember(member),
    memberships: await loadMemberships(member.id),
    onboarding: await loadOnboarding(member.id),
  };
});

export type CurrentImpl = typeof currentImpl;
