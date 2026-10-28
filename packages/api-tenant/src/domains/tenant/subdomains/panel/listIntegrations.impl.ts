import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { INTEGRATIONS } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inStoreScope, toPanelIntegration, type StoreIntegrationRow } from "./integrations.ts";
import { resolveStore } from "./support.ts";

const os = implement(
  tenantContractObject.panel.listIntegrations,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * Every catalog integration with this store's state.
 *
 * The catalog drives the list — a store has rows only for integrations it has
 * touched — so a newly shipped integration appears as "disabled" without a
 * backfill.
 */
export const listIntegrationsImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  const rows = await inStoreScope(store.tenantId, () =>
    db.orm.public.StoreIntegration.where({ tenantId: store.tenantId }).all(),
  );

  // `StoreIntegrationRow` names only the columns the mapper reads, so a contract
  // row satisfies it without a cast.
  const byId = new Map<string, StoreIntegrationRow>(rows.map((row) => [row.integrationId, row]));

  return {
    integrations: INTEGRATIONS.map((definition) =>
      toPanelIntegration(definition.id, byId.get(definition.id) ?? null),
    ),
  };
});
