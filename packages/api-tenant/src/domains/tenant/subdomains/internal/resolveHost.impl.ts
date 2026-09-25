/**
 * Tenant / internal / resolveHost implementation.
 *
 * The web proxy owns host admission (`WEB_HOST_MAP`), but the host → tenant
 * mapping lives in the `Domain` table, which `apps/web` must not read directly.
 * This is the server-side lookup the proxy calls with the shared internal
 * token; it is the only place outside the tenant API that needs the mapping.
 *
 * `Domain` is tenant-scoped, so the lookup is explicitly `unscoped()`: it runs
 * before any tenant is known (that is what it resolves).
 */
import { implement } from "@orpc/server";
import { tenantContractObject } from "@menuza/shared/tenant";
import { internalTokenMiddleware } from "@menuza/orpc-server/internal";
import { db, unscoped } from "@menuza/db";

const os = implement(tenantContractObject.internal.resolveHost);

export const resolveHostImpl = os.use(internalTokenMiddleware()).handler(async ({ input }) => {
  const domain = await unscoped(() =>
    db.orm.public.Domain.where({ host: input.host }).select("tenantId").first(),
  );

  return { tenantId: domain?.tenantId ?? null };
});

export type ResolveHostImpl = typeof resolveHostImpl;
