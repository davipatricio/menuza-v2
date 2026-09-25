import { implement, ORPCError } from "@orpc/server";
import type { ResponseHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { sharedErrorCodes } from "@menuza/shared/errors";
import { createSession, verifyPassword } from "@menuza/orpc-server/auth";
import { db, unscoped } from "@menuza/db";
import { loadMemberships, toSessionMember } from "./support.ts";

const os = implement(
  tenantContractObject.session.login,
).$context<ResponseHeadersHandlerPluginContext>();

export const loginImpl = os.handler(async ({ input, context }) => {
  const member = await unscoped(() =>
    db.orm.public.Member.where({ email: input.email.trim().toLowerCase() }).first(),
  );

  // A missing member and a wrong password must be indistinguishable to the
  // caller (and to timing): a null `passwordHash` fails closed.
  const passwordOk = member ? await verifyPassword(input.password, member.passwordHash) : false;

  if (!member || !passwordOk) {
    throw new ORPCError("UNAUTHORIZED", {
      message: sharedErrorCodes.UNAUTHORIZED.message,
      data: { code: "UNAUTHORIZED" },
    });
  }

  const { cookie } = await createSession({
    memberId: member.id,
    namespace: "tenant",
    // `Secure` would break local HTTP development; production is HTTPS-only.
    secure: process.env.NODE_ENV === "production",
  });

  // Appends rather than sets: `Set-Cookie` may already carry other entries.
  context.resHeaders?.append("set-cookie", cookie);

  return {
    member: toSessionMember(member),
    memberships: await loadMemberships(member.id),
  };
});

export type LoginImpl = typeof loginImpl;
