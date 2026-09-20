import { implement } from "@orpc/server";
import { tenantContractObject } from "@menuza/shared/tenant";
import { tenantMiddleware } from "@menuza/tenant-context";
import { authMiddleware } from "@menuza/auth-core";
import { db } from "@menuza/db";
import type { PushEvent } from "@menuza/shared/push";

const os = implement(tenantContractObject.push.getPreferences);

export const getPreferencesImpl = os
  .use(tenantMiddleware({ require: "tenant" }))
  .use(authMiddleware({ namespace: "tenant" }))
  .handler(async ({ context }) => {
    const rows = await db.orm.public.PushPreference.where({
      tenantId: context.tenantId,
      memberId: context.session.memberId,
    }).all();

    // SAFETY: DB column stores canonical PushEvent values matching contract.
    return { events: rows.map((r) => r.event as PushEvent) };
  });

export type GetPreferencesImpl = typeof getPreferencesImpl;
