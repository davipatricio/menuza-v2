import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { loadMcpSessions } from "./integrations.ts";
import { resolveStore } from "./support.ts";

const os = implement(
  tenantContractObject.panel.listMcpSessions,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * Who is connected to this store's dashboard MCP right now.
 *
 * Several members — and one member on several machines — hold sessions at
 * once, so the list is per store and the rows are labelled by member and
 * client. Only live sessions appear; the token itself is never exposed.
 */
export const listMcpSessionsImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  return { sessions: await loadMcpSessions(store.tenantId) };
});
