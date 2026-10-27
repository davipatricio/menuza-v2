/**
 * Shared pieces of the payment-gateway procedures.
 *
 * Two rules run through all of them:
 *
 * 1. **The secret goes in and never comes out.** `toPanelIntegration` builds the
 *    read shape without touching `credentials`; the only consumer of the
 *    decrypted value is the commerce adapter that speaks to the provider.
 * 2. **An integration id is a hint, not a grant.** Every lookup carries
 *    `where.tenantId`, so an id from another store resolves to nothing and the
 *    caller gets the same NOT_FOUND as an unknown id. The tenant scope is the
 *    second line of defence, not the first.
 */
import { randomBytes } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { encryptSecret } from "@menuza/orpc-server/crypto";
import type { PaymentProvider } from "@menuza/shared/tenant";
import { db } from "@menuza/db";
import { isoOf } from "./taxonomy.ts";

/** Opaque callback secret: 32 random bytes, hex, no tenant information in it. */
export function newWebhookToken(): string {
  return randomBytes(32).toString("hex");
}

export function validationFailed(
  message: string,
): ORPCError<"VALIDATION_FAILED", { code: string }> {
  return new ORPCError("VALIDATION_FAILED", {
    message,
    data: { code: "VALIDATION_FAILED" },
  });
}

/**
 * The encrypted credential blob a provider needs. `offline` needs none — the
 * store reconciles the payment itself — so an absent secret is not an error.
 *
 * Pagar.me issues `sk_…` secrets and `pk_…` public keys; refusing a `pk_…` here
 * is the one check that catches the most common paste mistake before it becomes
 * a failed charge at checkout.
 */
export function credentialsFor(
  provider: PaymentProvider,
  secretKey: string | undefined,
): string | null {
  if (provider === "offline") return null;

  if (secretKey === undefined) {
    throw validationFailed("Informe a chave secreta do provedor.");
  }

  if (!secretKey.startsWith("sk_")) {
    throw validationFailed(
      "A chave secreta do Pagar.me começa com sk_. A chave pública (pk_) não serve.",
    );
  }

  return encryptSecret(JSON.stringify({ secretKey }));
}

export interface PaymentIntegrationRow {
  id: string;
  provider: PaymentProvider;
  label: string;
  status: "active" | "disabled";
  credentials: string | null;
  webhookToken: string;
  createdAt: Temporal.PlainDateTime;
  updatedAt: Temporal.PlainDateTime;
}

/** The read shape. Deliberately does not read `credentials` at all. */
export function toPanelIntegration(row: PaymentIntegrationRow) {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    status: row.status,
    hasCredentials: row.credentials !== null,
    webhookPath: `/webhooks/pagarme/${row.webhookToken}`,
    createdAt: isoOf(row.createdAt),
    updatedAt: isoOf(row.updatedAt),
  };
}

export function loadIntegrations(tenantId: string) {
  return db.orm.public.PaymentIntegration.where({ tenantId })
    .orderBy((row) => row.createdAt.asc())
    .all();
}

/**
 * The assignment table alone does not carry the label the panel renders, so the
 * two lists are read together and joined here rather than per row.
 */
export async function loadAssignments(tenantId: string) {
  const [integrations, assignments] = await Promise.all([
    loadIntegrations(tenantId),
    db.orm.public.PaymentMethodAssignment.where({ tenantId })
      .orderBy((row) => row.method.asc())
      .all(),
  ]);

  const byId = new Map(integrations.map((row) => [row.id, row]));

  return assignments.flatMap((assignment) => {
    const integration = byId.get(assignment.integrationId);

    // A row whose integration vanished mid-read is not an assignment the panel
    // can render; the FK makes this unreachable outside a concurrent delete.
    if (integration === undefined) return [];

    return [
      {
        method: assignment.method,
        integrationId: integration.id,
        provider: integration.provider,
        label: integration.label,
      },
    ];
  });
}

export async function loadPaymentSettings(tenantId: string) {
  const [integrations, assignments] = await Promise.all([
    loadIntegrations(tenantId),
    loadAssignments(tenantId),
  ]);

  return {
    integrations: integrations.map(toPanelIntegration),
    assignments,
  };
}
