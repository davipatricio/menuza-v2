import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inStoreScope } from "./integrations.ts";
import { requireCapability, resolveStore } from "./support.ts";
import { now } from "./taxonomy.ts";

const os = implement(
  tenantContractObject.panel.revokeMcpSession,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * Revokes one connected MCP session.
 *
 * Two rows have to fall for the credential to die: the `McpSession` (the
 * store-facing handle) and the `OAuthToken` it was issued from. Revoking only
 * the handle would leave a working bearer token that the list no longer shows —
 * the worst of both. Both writes are one transaction.
 *
 * `sessionId` is the `McpSession.id`, scoped to the store in the path, so a
 * member cannot revoke another store's session by guessing an id.
 */
export const revokeMcpSessionImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");

  const session = await inStoreScope(store.tenantId, () =>
    db.orm.public.McpSession.where({
      id: input.sessionId,
      tenantId: store.tenantId,
      integrationId: "mcp-dashboard",
    }).first(),
  );

  if (!session) throw notFound();

  const stamp = now();

  await inStoreScope(store.tenantId, () =>
    db.transaction(async (tx) => {
      await tx.orm.public.McpSession.where({ id: session.id }).updateAll({ revokedAt: stamp });

      await tx.orm.public.OAuthToken.where({ id: session.oauthTokenId }).updateAll({
        revokedAt: stamp,
      });
    }),
  );

  return { success: true };
});
