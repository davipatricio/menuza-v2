import { randomUUID } from "node:crypto";
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import {
  inStoreScope,
  parseConfig,
  requireIntegration,
  serializeConfig,
  toPanelIntegration,
} from "./integrations.ts";
import { requireCapability, resolveStore } from "./support.ts";
import { now } from "./taxonomy.ts";

const os = implement(
  tenantContractObject.panel.saveIntegration,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * Turns an integration on or off, or writes its config.
 *
 * Gated on `catalog:write`: an integration switch changes what runs against
 * the store, which is configuration, not a read. Turning the MCP integration
 * off does NOT revoke its sessions — those are revoked explicitly from the
 * sessions list, so flipping a switch cannot silently break a teammate's
 * connected client.
 */
export const saveIntegrationImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "catalog:write");
  requireIntegration(input.integrationId);

  const stamp = now();

  const row = await inStoreScope(store.tenantId, async () => {
    const existing = await db.orm.public.StoreIntegration.where({
      tenantId: store.tenantId,
      integrationId: input.integrationId,
    }).first();

    const config = serializeConfig(
      input.config ?? parseConfig(input.integrationId, existing?.config ?? null),
    );

    const status = input.status ?? existing?.status ?? "disabled";

    if (!existing) {
      await db.orm.public.StoreIntegration.create({
        id: randomUUID(),
        tenantId: store.tenantId,
        integrationId: input.integrationId,
        status,
        config,
        enabledAt: status === "enabled" ? stamp : null,
        createdAt: stamp,
        updatedAt: stamp,
      });

      return await db.orm.public.StoreIntegration.where({
        tenantId: store.tenantId,
        integrationId: input.integrationId,
      }).first();
    }

    await db.orm.public.StoreIntegration.where({ id: existing.id }).updateAll({
      status,
      config,
      // `enabledAt` records the first enable and survives later saves; only a
      // transition into `enabled` from something else stamps it anew.
      enabledAt: status === "enabled" && existing.status !== "enabled" ? stamp : existing.enabledAt,
      updatedAt: stamp,
    });

    return await db.orm.public.StoreIntegration.where({ id: existing.id }).first();
  });

  return { integration: toPanelIntegration(input.integrationId, row) };
});
