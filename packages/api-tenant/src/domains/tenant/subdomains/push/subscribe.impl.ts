import { randomUUID } from "node:crypto";
import { implement, ORPCError } from "@orpc/server";
import { tenantContractObject } from "@menuza/shared/tenant";
import { sharedErrorCodes } from "@menuza/shared/errors";
import { isAllowedPushEndpoint } from "@menuza/shared/push";
import { tenantMiddleware } from "@menuza/tenant-context";
import { authMiddleware } from "@menuza/auth-core";
import { db, unscoped } from "@menuza/db";

const os = implement(tenantContractObject.push.subscribe);

export const subscribeImpl = os
  .use(tenantMiddleware({ require: "tenant" }))
  .use(authMiddleware({ namespace: "tenant" }))
  .handler(async ({ input, context }) => {
    if (!isAllowedPushEndpoint(input.endpoint)) {
      throw new ORPCError("VALIDATION_FAILED", {
        message: sharedErrorCodes.VALIDATION_FAILED.message,
        data: { code: "VALIDATION_FAILED" },
      });
    }

    const expirationTime =
      input.expirationTime != null
        ? Temporal.Instant.fromEpochMilliseconds(input.expirationTime)
            .toZonedDateTimeISO("UTC")
            .toPlainDateTime()
        : null;

    const existing = await unscoped(() =>
      db.orm.public.PushSubscription.where({ endpoint: input.endpoint }).first(),
    );

    const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

    if (existing) {
      if (
        existing.tenantId !== context.tenantId ||
        existing.memberId !== context.session.memberId
      ) {
        throw new ORPCError("FORBIDDEN", {
          message: sharedErrorCodes.FORBIDDEN.message,
          data: { code: "FORBIDDEN" },
        });
      }

      await db.orm.public.PushSubscription.where({
        tenantId: context.tenantId,
        id: existing.id,
      }).updateAll({
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        expirationTime,
        updatedAt: now,
      });

      return { success: true };
    }

    await db.orm.public.PushSubscription.create({
      id: randomUUID(),
      tenantId: context.tenantId,
      memberId: context.session.memberId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      expirationTime,
      createdAt: now,
      updatedAt: now,
    });

    return { success: true };
  });

export type SubscribeImpl = typeof subscribeImpl;
