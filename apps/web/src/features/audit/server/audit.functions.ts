/**
 * Server function behind the audit log screen: one panel read of the store's
 * event trail, newest first. The panel already scopes the read to the session's
 * store, so nothing here resolves tenancy.
 */
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import type { PanelAuditLog } from "@menuza/shared/tenant";
import { panelClient } from "@/server/panel-client.ts";

export type AuditRow = PanelAuditLog;

export const listAuditLogsFn = createServerFn({ method: "GET" })
  .validator(v.object({ storeSlug: v.string() }))
  .handler(async ({ data }) => {
    const client = await panelClient();

    if (!client) return null;

    return client.panel.listAuditLogs({ storeSlug: data.storeSlug });
  });

export type PanelAuditPayload = NonNullable<Awaited<ReturnType<typeof listAuditLogsFn>>>;
