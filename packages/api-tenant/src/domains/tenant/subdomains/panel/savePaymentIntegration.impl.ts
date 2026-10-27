import { randomUUID } from "node:crypto";
import { implement } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { notFound } from "../session/support.ts";
import { inTenantScope, requireCapability, resolveStore } from "./support.ts";
import {
  credentialsFor,
  newWebhookToken,
  toPanelIntegration,
  validationFailed,
} from "./paymentSupport.ts";
import { now } from "./taxonomy.ts";

const os = implement(
  tenantContractObject.panel.savePaymentIntegration,
).$context<RequestHeadersHandlerPluginContext>();

/**
 * Creates or updates one gateway connection.
 *
 * `provider` is immutable after creation: switching an integration from
 * Pagar.me to offline would keep a webhook token pointing at a dead credential,
 * so the store creates a new integration and re-assigns the method instead.
 *
 * An update without `secretKey` keeps the stored credential, which is what lets
 * the store rename an integration without re-typing the key.
 */
export const savePaymentIntegrationImpl = os.handler(async ({ input, context }) => {
  const store = await resolveStore(context.reqHeaders, input.storeSlug);

  requireCapability(store.role, "payments:write");

  const updatedAt = now();

  if (input.integrationId === undefined) {
    const id = randomUUID();

    const credentials = credentialsFor(input.provider, input.secretKey);

    await inTenantScope(store.tenantId, () =>
      db.orm.public.PaymentIntegration.create({
        id,
        tenantId: store.tenantId,
        provider: input.provider,
        label: input.label,
        status: "active",
        credentials,
        webhookToken: newWebhookToken(),
        createdAt: updatedAt,
        updatedAt,
      }),
    );

    const row = await inTenantScope(store.tenantId, () =>
      db.orm.public.PaymentIntegration.where({ tenantId: store.tenantId, id }).first(),
    );

    if (!row) throw notFound();

    return { integration: toPanelIntegration(row) };
  }

  const existing = await inTenantScope(store.tenantId, () =>
    db.orm.public.PaymentIntegration.where({
      tenantId: store.tenantId,
      id: input.integrationId,
    }).first(),
  );

  if (!existing) throw notFound();

  if (existing.provider !== input.provider) {
    throw validationFailed("O provedor de uma integração não pode ser alterado. Crie uma nova.");
  }

  const credentials =
    input.secretKey === undefined
      ? existing.credentials
      : credentialsFor(input.provider, input.secretKey);

  await inTenantScope(store.tenantId, () =>
    db.orm.public.PaymentIntegration.where({
      tenantId: store.tenantId,
      id: input.integrationId,
    }).updateAll({ label: input.label, credentials, updatedAt }),
  );

  return {
    integration: toPanelIntegration({
      ...existing,
      label: input.label,
      credentials,
      updatedAt,
    }),
  };
});

export type SavePaymentIntegrationImpl = typeof savePaymentIntegrationImpl;
