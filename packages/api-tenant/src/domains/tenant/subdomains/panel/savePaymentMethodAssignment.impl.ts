import { randomUUID } from "node:crypto";
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import { loadAssignments } from "./paymentSupport.ts";
import { now } from "./taxonomy.ts";

const os = implement(
  tenantContractObject.panel.savePaymentMethodAssignment,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * Points one payment method at one integration, or clears the method with
 * `integrationId: null`.
 *
 * One row per `(tenant, method)` is the whole routing rule: a method has a
 * provider, and there is no fallback between providers of the same method
 * (PRODUCT.md §10). The upsert is on that unique rather than read-then-write,
 * so two admin tabs cannot leave the method with two answers.
 */
export const savePaymentMethodAssignmentImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "payments:write");

  if (input.integrationId === null) {
    await inTenantScope(store.tenantId, () =>
      db.orm.public.PaymentMethodAssignment.where({
        tenantId: store.tenantId,
        method: input.method,
      }).deleteAll(),
    );

    return {
      assignments: await inTenantScope(store.tenantId, () => loadAssignments(store.tenantId)),
    };
  }

  // The integration has to belong to this store: an id from another tenant is
  // the same NOT_FOUND as an unknown one, never a cross-tenant assignment.
  const integration = await inTenantScope(store.tenantId, () =>
    db.orm.public.PaymentIntegration.where({
      tenantId: store.tenantId,
      id: input.integrationId,
    }).first(),
  );

  if (!integration) throw notFound();

  const updatedAt = now();

  await inTenantScope(store.tenantId, () =>
    db.orm.public.PaymentMethodAssignment.upsert({
      create: {
        id: randomUUID(),
        tenantId: store.tenantId,
        method: input.method,
        integrationId: integration.id,
        updatedAt,
      },
      update: { integrationId: integration.id, updatedAt },
      conflictOn: { tenantId: store.tenantId, method: input.method },
    }),
  );

  return {
    assignments: await inTenantScope(store.tenantId, () => loadAssignments(store.tenantId)),
  };
});

export type SavePaymentMethodAssignmentImpl = typeof savePaymentMethodAssignmentImpl;
