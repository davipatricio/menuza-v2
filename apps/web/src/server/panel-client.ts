/**
 * Server-side tenant client for the dashboard.
 *
 * Runs in Start server functions and loaders and forwards the incoming
 * `menuza_tenant_sid` cookie to the loopback tenant API (`TENANT_INTERNAL_URL`),
 * which is the only place tenancy is resolved. No shared client state across
 * requests.
 */
import { getRequest } from "@tanstack/react-start/server";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import type { tenantContractObject } from "@menuza/shared/tenant";

const TENANT_SESSION_COOKIE = "menuza_tenant_sid";

export type TenantClient = RouterContractClient<typeof tenantContractObject>;

/** The dashboard session payload, derived from `session.current`'s contract output. */
export type PanelSession = Awaited<ReturnType<TenantClient["session"]["current"]>>;

/** Reads one cookie out of the raw `cookie` header; no cookie library needed here. */
function readSessionCookie(header: string | null): string {
  if (!header) return "";

  const prefix = `${TENANT_SESSION_COOKIE}=`;

  for (const pair of header.split(";")) {
    const entry = pair.trim();

    if (entry.startsWith(prefix)) return entry.slice(prefix.length).trim();
  }

  return "";
}

/**
 * A panel client bound to the current request's session cookie, or `null` when
 * there is no `menuza_tenant_sid`. Server functions call it instead of
 * assembling a client per route; the API still revalidates the session, so
 * forwarding the cookie is a transport detail and not the authorization.
 */
export async function panelClient(): Promise<TenantClient | null> {
  const sessionId = readSessionCookie(getRequest().headers.get("cookie"));

  if (!sessionId) return null;

  const origin = process.env.TENANT_INTERNAL_URL ?? "http://127.0.0.1:3002";

  return createORPCClient<TenantClient>(
    new RPCLink({
      origin,
      url: "/rpc",
      headers: { cookie: `${TENANT_SESSION_COOKIE}=${sessionId}` },
    }),
  );
}

/**
 * Returns the authenticated panel session for the current request, or `null`
 * when there is no usable `menuza_tenant_sid` cookie.
 */
export async function getPanelSession(): Promise<PanelSession | null> {
  const client = await panelClient();

  if (!client) return null;

  try {
    return await client.session.current();
  } catch {
    // Expired, revoked or unknown cookie: treat as signed out.
    return null;
  }
}
