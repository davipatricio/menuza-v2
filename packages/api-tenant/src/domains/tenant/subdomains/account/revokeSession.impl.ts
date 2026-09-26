import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { assertSameOrigin, requireSession } from "../session/support.ts";
import { revokeSessionDigests } from "./support.ts";

const os = implement(
  tenantContractObject.account.revokeSession,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * Revokes one session of the caller's own account, addressed by the digest
 * `session.listSessions` returned.
 *
 * Scoping the statement by `memberId` is what stops this from being a
 * "revoke any session by id" endpoint: another member's row simply is not in the
 * filtered set, so the count comes back 0 and nothing leaks. Revoking the
 * caller's own current session is allowed — it is logout, and the UI hides the
 * button, but a crafted request must not do worse than log the caller out.
 */
export const revokeSessionImpl = os.handler(async ({ input, context }) => {
  assertSameOrigin(context.reqHeaders);

  const session = await requireSession(context.reqHeaders);

  return { revoked: await revokeSessionDigests(session.memberId, [input.sessionId]) };
});

export type RevokeSessionImpl = typeof revokeSessionImpl;
