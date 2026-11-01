"use client";

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import { tenantContractObject } from "@menuza/shared/tenant";

type ContractClient = RouterContractClient<typeof tenantContractObject>;

type CouponStatus = "active" | "disabled";

/** One browser client for the palette: the palette is a single consumer. */
let client: ContractClient | null = null;

export function tenantClient(): ContractClient {
  client ??= createORPCClient<ContractClient>(new RPCLink({ url: "/tenant/rpc" }));

  return client;
}

export async function setCouponStatusAction(
  storeSlug: string,
  couponId: string,
  status: CouponStatus,
): Promise<void> {
  await tenantClient().panel.setCouponStatus({ storeSlug, couponId, status });
}

export async function setProductAvailabilityAction(
  storeSlug: string,
  productId: string,
  available: boolean,
): Promise<void> {
  await tenantClient().panel.updateProduct({ storeSlug, productId, available });
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);

    return true;
  } catch {
    return false;
  }
}
