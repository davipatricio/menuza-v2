/**
 * Server functions for the integrations screens.
 *
 * The catalog in `@menuza/shared/tenant` decides which cards exist; the panel
 * only supplies each one's per-store state, so a newly shipped integration
 * appears without a backfill.
 */
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import {
  findIntegration,
  type PanelIntegration,
  type PanelMcpSession,
} from "@menuza/shared/tenant";
import { getRequest } from "@tanstack/react-start/server";
import { panelClient } from "@/server/panel-client.ts";

export type IntegrationsResult =
  | { status: "ok"; integrations: PanelIntegration[] }
  | { status: "unauthenticated" };

export const loadIntegrationsFn = createServerFn({ method: "GET" })
  .validator(v.object({ storeSlug: v.string() }))
  .handler(async ({ data }): Promise<IntegrationsResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    const { integrations } = await client.panel.listIntegrations({ storeSlug: data.storeSlug });

    return { status: "ok", integrations };
  });

export type IntegrationDetailResult =
  | {
      status: "ok";
      integration: PanelIntegration;
      sessions: PanelMcpSession[];
      serverUrl: string;
    }
  | { status: "unauthenticated" }
  | { status: "not-found" };

/**
 * One integration: its per-store state, and — when the catalog grants it the
 * `connect` capability — the MCP sessions plus the public `/mcp` URL a client
 * pastes in. The URL is derived from the current request host, never a constant.
 */
export const loadIntegrationFn = createServerFn({ method: "GET" })
  .validator(v.object({ storeSlug: v.string(), integrationId: v.string() }))
  .handler(async ({ data }): Promise<IntegrationDetailResult> => {
    const definition = findIntegration(data.integrationId);

    if (!definition) return { status: "not-found" };

    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    const { integrations } = await client.panel.listIntegrations({ storeSlug: data.storeSlug });

    const integration: PanelIntegration = integrations.find(
      (entry) => entry.integrationId === data.integrationId,
    ) ?? {
      integrationId: data.integrationId,
      status: "disabled",
      config: {},
      enabledAt: null,
      updatedAt: null,
    };

    const sessions = definition.capabilities.includes("connect")
      ? (await client.panel.listMcpSessions({ storeSlug: data.storeSlug })).sessions
      : [];

    return { status: "ok", integration, sessions, serverUrl: mcpUrl() };
  });

/**
 * The public `/mcp` URL a client pastes in.
 *
 * `x-menuza-host` carries the host without a port, which is right in production
 * and wrong on a dev server listening on 3003 — so a loopback host inherits the
 * port from the request URL.
 */
function mcpUrl(): string {
  const request = getRequest();
  const requestUrl = new URL(request.url);
  const host = (request.headers.get("x-menuza-host") ?? requestUrl.host).trim();

  const withPort =
    host.includes(":") || requestUrl.port === "" ? host : `${host}:${requestUrl.port}`;

  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    requestUrl.protocol.slice(0, -1);

  return `${protocol}://${withPort}/mcp`;
}
