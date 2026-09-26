import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { inTenantScope, resolveStore } from "./support.ts";
import { toPanelTimestamp } from "./format.ts";

const os = implement(
  tenantContractObject.panel.listAuditLogs,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * The store's audit trail, newest first. `action` is free text on the wire too:
 * MEN-74 owns the closed event catalog.
 */
export const listAuditLogsImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  const logs = await inTenantScope(store.tenantId, () =>
    db.orm.public.AuditLog.where({ tenantId: store.tenantId })
      .orderBy((log) => log.createdAt.desc())
      .all(),
  );

  return {
    logs: logs.map((log) => ({
      id: log.id,
      action: log.action,
      actor: log.actor,
      target: log.target,
      ip: log.ip,
      createdAt: toPanelTimestamp(log.createdAt),
    })),
  };
});

export type ListAuditLogsImpl = typeof listAuditLogsImpl;
