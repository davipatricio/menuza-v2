/**
 * Server-side API clients.
 *
 * Each call instantiates a fresh client bound to the validated internal API origin.
 * No client state, cookies, or tenant context is shared across requests.
 *
 * The browser hits the same-origin `/commerce/...` and `/tenant/...` prefixes
 * (rewritten by `next.config.ts` to the loopback services in development).
 */
import { headers } from "next/headers";
import { RPCLink } from "@orpc/client/fetch";
import { createORPCClient } from "@orpc/client";
import type { RouterContractClient } from "@orpc/contract";
import { commerceContractObject } from "@menuza/shared/commerce";

type CommerceClient = RouterContractClient<typeof commerceContractObject>;

function newCommerceClient(
  origin: string,
  requestHeaders?: Record<string, string>,
): CommerceClient {
  const link = new RPCLink({ origin, url: "/rpc", headers: requestHeaders });

  return createORPCClient(link);
}

interface HealthOk {
  status: "ok";
  service: string;
  timestamp: string;
}

export async function getCommerceStatus(): Promise<
  { ok: true; data: HealthOk } | { ok: false; error: string }
> {
  try {
    const origin = process.env.COMMERCE_INTERNAL_URL ?? "http://127.0.0.1:3001";
    const data = await newCommerceClient(origin).health({});

    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Public storefront client bound to the tenant the proxy resolved for this host.
 *
 * The tenant never travels in a request body: `src/proxy.ts` resolves host →
 * tenantId and writes the server-only `x-menuza-tenant-id` header, which this
 * forwards to the commerce API. `null` means the header was empty, i.e. no
 * store owns this host.
 */
export async function storefrontClient(): Promise<CommerceClient | null> {
  const tenantId = (await headers()).get("x-menuza-tenant-id") ?? "";

  if (!tenantId) return null;

  const origin = process.env.COMMERCE_INTERNAL_URL ?? "http://127.0.0.1:3001";

  return newCommerceClient(origin, { "x-menuza-tenant-id": tenantId });
}
