import { implement, ORPCError } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { sharedErrorCodes } from "@menuza/shared/errors";
import { hashPassword, verifyPassword } from "@menuza/orpc-server/auth";
import { db, unscoped } from "@menuza/db";
import { assertSameOrigin, requireSession } from "../session/support.ts";
import { currentSessionDigest, revokeAllSessionsExcept } from "./support.ts";

const os = implement(
  tenantContractObject.account.changePassword,
).$context<RequestHeadersHandlerPluginContext>();

function wrongPassword() {
  // Same code as a login failure on purpose: this must not become an oracle for
  // "does this account exist" or "is the current password close".
  return new ORPCError("UNAUTHORIZED", {
    message: sharedErrorCodes.UNAUTHORIZED.message,
    data: { code: "UNAUTHORIZED" },
  });
}

/**
 * Changes the account's password and revokes every other session.
 *
 * The revocation is not a nicety: without it, changing a password after a
 * suspected compromise would leave every stolen cookie working, which is the
 * one case where the user is specifically trying to lock someone out. The
 * caller's own session survives so the form does not log them out.
 */
export const changePasswordImpl = os.handler(async ({ input, context }) => {
  assertSameOrigin(context.reqHeaders);

  const session = await requireSession(context.reqHeaders);

  const member = await unscoped(() => db.orm.public.Member.where({ id: session.memberId }).first());

  if (!member) throw wrongPassword();

  const currentOk = await verifyPassword(input.currentPassword, member.passwordHash);

  if (!currentOk) throw wrongPassword();

  // A member with no password hash (a bot or Google-only account, MEN-226/228)
  // is not an error here: setting a password is how such an account adopts one.
  // Comparing for reuse needs a hash to compare against, so it is skipped.
  if (member.passwordHash !== null) {
    const reused = await verifyPassword(input.newPassword, member.passwordHash);

    if (reused) return { changed: false };
  }

  const passwordHash = await hashPassword(input.newPassword);

  await unscoped(() =>
    db.orm.public.Member.where({ id: member.id }).update({
      passwordHash,
      updatedAt: Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime(),
    }),
  );

  await revokeAllSessionsExcept(member.id, currentSessionDigest(session.id));

  return { changed: true };
});

export type ChangePasswordImpl = typeof changePasswordImpl;
