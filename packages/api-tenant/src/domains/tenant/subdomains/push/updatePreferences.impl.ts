import { randomUUID } from "node:crypto";
import { implement } from "@orpc/server";
import { tenantContractObject } from "@menuza/shared/tenant";
import { tenantMiddleware } from "@menuza/orpc-server/tenant";
import { authMiddleware } from "@menuza/orpc-server/auth";
import { db } from "@menuza/db";

const os = implement(tenantContractObject.push.updatePreferences);

export const updatePreferencesImpl = os
  .use(tenantMiddleware({ require: "tenant" }))
  .use(authMiddleware({ namespace: "tenant" }))
  .handler(async ({ input, context }) => {
    const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

    await db.transaction(async (tx) => {
      await tx.orm.public.PushPreference.where({
        tenantId: context.tenantId,
        memberId: context.session.memberId,
      }).deleteAll();

      if (input.events.length > 0) {
        await tx.orm.public.PushPreference.createAll(
          input.events.map((event) => ({
            id: randomUUID(),
            tenantId: context.tenantId,
            memberId: context.session.memberId,
            event,
            createdAt: now,
          })),
        );
      }
    });

    return { events: input.events };
  });

export type UpdatePreferencesImpl = typeof updatePreferencesImpl;
