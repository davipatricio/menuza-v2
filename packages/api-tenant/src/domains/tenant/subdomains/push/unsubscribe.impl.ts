import { implement } from "@orpc/server";
import { tenantContractObject } from "@menuza/shared/tenant";
import { tenantMiddleware } from "@menuza/tenant-context";
import { authMiddleware } from "@menuza/auth-core";
import { db } from "@menuza/db";

const os = implement(tenantContractObject.push.unsubscribe);

export const unsubscribeImpl = os
  .use(tenantMiddleware({ require: "tenant" }))
  .use(authMiddleware({ namespace: "tenant" }))
  .handler(async ({ input, context }) => {
    await db.orm.public.PushSubscription.where({
      tenantId: context.tenantId,
      memberId: context.session.memberId,
      endpoint: input.endpoint,
    }).deleteAll();

    return { success: true };
  });

export type UnsubscribeImpl = typeof unsubscribeImpl;
