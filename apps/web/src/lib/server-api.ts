/**
 * Server-side API clients.
 *
 * Each call instantiates a fresh client bound to the validated internal API origin.
 * No client state, cookies, or tenant context is shared across requests.
 *
 * The browser hits the same-origin `/commerce/...` and `/tenant/...` prefixes
 * (rewritten by `next.config.ts` to the loopback services in development).
 */
import { RPCLink } from "@orpc/client/fetch";
import { createORPCClient } from "@orpc/client";
import type { RouterContractClient } from "@orpc/contract";
import { commerceContractObject } from "@menuza/shared/commerce";

function newCommerceClient(origin: string): RouterContractClient<typeof commerceContractObject> {
  const link = new RPCLink({ origin, url: "/rpc" });

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
