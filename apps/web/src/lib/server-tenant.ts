/**
 * Server-side tenant client for the dashboard.
 *
 * Runs in React Server Components and forwards the incoming `menuza_tenant_sid`
 * cookie to the loopback tenant API (`TENANT_INTERNAL_URL`), which is the only
 * place tenancy is resolved. No shared client state across requests.
 */
import { cookies } from "next/headers";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import type { tenantContractObject } from "@menuza/shared/tenant";
import type { PanelSession } from "./session-client.ts";

const TENANT_SESSION_COOKIE = "menuza_tenant_sid";

export type TenantClient = RouterContractClient<typeof tenantContractObject>;

/**
 * A panel client bound to the current request's session cookie, or `null` when
 * there is no `menuza_tenant_sid`. Server components call it instead of
 * assembling a client per page; the API still revalidates the session, so
 * forwarding the cookie is a transport detail and not the authorization.
 */
export async function panelClient(): Promise<TenantClient | null> {
  const sessionId = (await cookies()).get(TENANT_SESSION_COOKIE)?.value;

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
