import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { loadProduct, toProductDetail } from "./catalog.ts";

const os = implement(
  tenantContractObject.panel.getProduct,
).$context<RequestHeadersHandlerPluginContext>();

/** The editor's read: the product, its variations and its tags, tenant-scoped. */
export const getProductImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "dashboard:read");

  const product = await inTenantScope(store.tenantId, () =>
    loadProduct(db, store.tenantId, input.productId),
  );

  if (!product) throw notFound();

  return { product: toProductDetail(product) };
});

export type GetProductImpl = typeof getProductImpl;
