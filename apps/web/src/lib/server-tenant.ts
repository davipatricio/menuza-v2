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

type TenantClient = RouterContractClient<typeof tenantContractObject>;

/**
 * Returns the authenticated panel session for the current request, or `null`
 * when there is no usable `menuza_tenant_sid` cookie.
 */
export async function getPanelSession(): Promise<PanelSession | null> {
  const sessionId = (await cookies()).get(TENANT_SESSION_COOKIE)?.value;

  if (!sessionId) return null;

  const origin = process.env.TENANT_INTERNAL_URL ?? "http://127.0.0.1:3002";

  const link = new RPCLink({
    origin,
    url: "/rpc",
    headers: { cookie: `${TENANT_SESSION_COOKIE}=${sessionId}` },
  });

  const client = createORPCClient<TenantClient>(link);

  try {
    return await client.session.current();
  } catch {
    // Expired, revoked or unknown cookie: treat as signed out.
    return null;
  }
}
