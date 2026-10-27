/**
 * Payment gateway vocabulary shared by the two processes that hand webhooks
 * across: the commerce API persists a received event and enqueues it, and the
 * worker drains the queue and calls back. Neither app may import the other's
 * package, so the queue name, the job id and the envelope live here — the same
 * arrangement as `@menuza/shared/push`.
 */
import * as v from "valibot";

export const PAYMENT_EVENTS_QUEUE = "payment-events";

export const PAYMENT_PROVIDERS = ["pagarme", "offline"] as const;

export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const PaymentProviderSchema = v.picklist(PAYMENT_PROVIDERS, "Escolha um provedor válido.");

export const PaymentJobPayloadSchema = v.strictObject({
  tenantId: v.pipe(v.string(), v.nonEmpty()),
  gatewayEventId: v.pipe(v.string(), v.nonEmpty()),
});

export type PaymentJobPayload = v.InferOutput<typeof PaymentJobPayloadSchema>;

/** Deterministic id: a re-enqueued event dedupes onto the same BullMQ job. */
export function paymentEventJobId(gatewayEventId: string): string {
  return `payment-event-${gatewayEventId}`;
}

/**
 * Trust boundary for the queue: the value came off Redis as JSON, not from a
 * typed caller, so validate it here and throw on a malformed envelope.
 */
export function parsePaymentJobPayload(
  data: v.InferInput<typeof PaymentJobPayloadSchema>,
): PaymentJobPayload {
  return v.parse(PaymentJobPayloadSchema, data);
}
