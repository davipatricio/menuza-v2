import { oc } from "@orpc/contract";
import { openapi } from "@orpc/openapi";
import * as v from "valibot";
import { sharedErrorCodes } from "../errors/index.ts";
import { PUSH_EVENTS, type PushJobPayload } from "./types.ts";

export const PushEventSchema = v.picklist(PUSH_EVENTS);

export const PushSubscriptionKeysSchema = v.strictObject({
  p256dh: v.pipe(v.string(), v.nonEmpty()),
  auth: v.pipe(v.string(), v.nonEmpty()),
});

export const PushSubscriptionInputSchema = v.strictObject({
  endpoint: v.pipe(v.string(), v.url()),
  keys: PushSubscriptionKeysSchema,
  expirationTime: v.nullish(v.number()),
});

export const PushUnsubscribeInputSchema = v.strictObject({
  endpoint: v.pipe(v.string(), v.nonEmpty()),
});

// One preference row per (tenant, member, event): reject duplicates up front so
// the unique index is never hit, and cap the array at the number of events.
export const UniquePushEventsSchema = v.pipe(
  v.array(PushEventSchema),
  v.maxLength(PUSH_EVENTS.length),
  v.check((events) => new Set(events).size === events.length, "Eventos duplicados."),
);

export const PushPreferencesInputSchema = v.strictObject({
  events: UniquePushEventsSchema,
});

export const PushNotificationPayloadSchema = v.strictObject({
  title: v.pipe(v.string(), v.nonEmpty()),
  body: v.string(),
  url: v.optional(v.string()),
  tag: v.optional(v.string()),
  icon: v.optional(v.string()),
  badge: v.optional(v.string()),
  data: v.optional(v.record(v.string(), v.union([v.string(), v.number(), v.boolean()]))),
});

export const PushJobPayloadSchema = v.strictObject({
  tenantId: v.pipe(v.string(), v.nonEmpty()),
  event: PushEventSchema,
  targetMemberIds: v.optional(v.array(v.pipe(v.string(), v.nonEmpty()))),
  payload: v.optional(PushNotificationPayloadSchema),
});

/**
 * Trust boundary for the queue: the value came off Redis as JSON, not from a
 * typed caller, so validate it here and throw on a malformed envelope.
 */
export function parsePushJobPayload(
  data: v.InferInput<typeof PushJobPayloadSchema>,
): PushJobPayload {
  return v.parse(PushJobPayloadSchema, data);
}

export const GetPublicKeyOutputSchema = v.object({
  publicKey: v.pipe(v.string(), v.nonEmpty()),
});

export const GetPreferencesOutputSchema = v.object({
  events: v.array(PushEventSchema),
});

export const PushSuccessOutputSchema = v.object({
  success: v.boolean(),
});

export const PushSubscriptionOutputSchema = PushSuccessOutputSchema;

export const pushContract = oc.errors({
  ...sharedErrorCodes,
});

export const getPublicKey = pushContract
  .meta(
    openapi({
      method: "GET",
      path: "/push/public-key",
      operationId: "getPushPublicKey",
      summary: "Chave pública VAPID usada para assinar inscrições de push.",
      tags: ["push"],
    }),
  )
  .output(GetPublicKeyOutputSchema);

export const subscribe = pushContract
  .meta(
    openapi({
      method: "POST",
      path: "/push/subscriptions",
      operationId: "subscribePush",
      summary: "Registra ou atualiza a inscrição de push do dispositivo.",
      tags: ["push"],
    }),
  )
  .input(PushSubscriptionInputSchema)
  .output(PushSubscriptionOutputSchema);

export const unsubscribe = pushContract
  .meta(
    openapi({
      method: "DELETE",
      path: "/push/subscriptions",
      operationId: "unsubscribePush",
      summary: "Remove a inscrição de push do dispositivo.",
      tags: ["push"],
    }),
  )
  .input(PushUnsubscribeInputSchema)
  .output(PushSuccessOutputSchema);

export const getPreferences = pushContract
  .meta(
    openapi({
      method: "GET",
      path: "/push/preferences",
      operationId: "getPushPreferences",
      summary: "Lista os eventos de notificação habilitados para o membro.",
      tags: ["push"],
    }),
  )
  .output(GetPreferencesOutputSchema);

export const updatePreferences = pushContract
  .meta(
    openapi({
      method: "PUT",
      path: "/push/preferences",
      operationId: "updatePushPreferences",
      summary: "Substitui os eventos de notificação habilitados para o membro.",
      tags: ["push"],
    }),
  )
  .input(PushPreferencesInputSchema)
  .output(GetPreferencesOutputSchema);

export const pushContractObject = {
  getPublicKey,
  subscribe,
  unsubscribe,
  getPreferences,
  updatePreferences,
};

export type PushRouterContract = typeof pushContractObject;
