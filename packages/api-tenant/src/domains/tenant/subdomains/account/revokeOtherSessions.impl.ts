import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { assertSameOrigin, requireSession } from "../session/support.ts";
import { currentSessionDigest, revokeAllSessionsExcept } from "./support.ts";

const os = implement(
  tenantContractObject.account.revokeOtherSessions,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * Signs the account out everywhere except here. One call rather than a loop the
 * client assembles, so a compromise response cannot be interrupted halfway
 * through with some stolen cookies still live.
 */
export const revokeOtherSessionsImpl = os.handler(async ({ context }) => {
  assertSameOrigin(context.reqHeaders);

  const session = await requireSession(context.reqHeaders);

  return {
    revoked: await revokeAllSessionsExcept(session.memberId, currentSessionDigest(session.id)),
  };
});

export type RevokeOtherSessionsImpl = typeof revokeOtherSessionsImpl;
