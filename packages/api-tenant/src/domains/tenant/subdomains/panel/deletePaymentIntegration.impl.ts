import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { conflict, notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";

const os = implement(
  tenantContractObject.panel.deletePaymentIntegration,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * Removes a connection the store no longer uses. It refuses while a payment
 * method still points at it: deleting then would silently turn that method off,
 * and the store has to say which integration should answer it instead.
 */
export const deletePaymentIntegrationImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "payments:write");

  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.PaymentIntegration.where({
      tenantId: store.tenantId,
      id: input.integrationId,
    }).first(),
  );

  if (!existing) throw notFound();

  const assignments = await inTenantScope(store.tenantId, () =>
    db.orm.public.PaymentMethodAssignment.where({
      tenantId: store.tenantId,
      integrationId: input.integrationId,
    }).all(),
  );

  if (assignments.length > 0) throw conflict();

  await inTenantScope(store.tenantId, () =>
    db.orm.public.PaymentIntegration.where({
      tenantId: store.tenantId,
      id: input.integrationId,
    }).deleteAll(),
  );

  return { deleted: true };
});

export type DeletePaymentIntegrationImpl = typeof deletePaymentIntegrationImpl;
