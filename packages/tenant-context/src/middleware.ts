/**
 * Tenant middleware. Pulls the tenant id from a trusted request header and
 * injects it into the procedure context. The web proxy writes this header
 * server-side from the host->tenant map; clients never set it directly.
 *
 * Reads `context.reqHeaders`, which `@orpc/server`'s `RequestHeadersPlugin`
 * populates per request. Without the plugin the header is invisible and the
 * middleware always falls back to the missing-tenant branch.
 *
 * `require: "tenant"` narrows `context.tenantId: string`; `require: "optional"`
 * keeps it `string | undefined`. Missing or empty header AND `require: "tenant"`
 * throws `ORPCError("TENANT_NOT_RESOLVED", ...)`. The error code is defined in
 * the shared error catalog; oRPC converts a raw `ORPCError` with a matching
 * code to the typesafe error.
 */
import { ORPCError, os } from "@orpc/server";
import type { RequestHeadersPluginContext } from "@orpc/server/plugins";
import { sharedErrorCodes } from "@menuza/shared/errors";
import type { OptionalTenantContext, TenantContext } from "./types.ts";

export interface TenantMiddlewareOptions {
  require: "tenant" | "optional";
  /** Defaults to `x-menuza-tenant-id`. Override only for cross-context tests. */
  headerName?: string;
}

const DEFAULT_HEADER = "x-menuza-tenant-id";

type TenantContextOf<TRequire extends "tenant" | "optional"> = TRequire extends "tenant"
  ? TenantContext
  : OptionalTenantContext;

/** Context the middleware reads from and injects into. */
type TenantMiddlewareContext = RequestHeadersPluginContext & OptionalTenantContext;

/**
 * Returns an oRPC middleware that:
 *  - Reads `x-menuza-tenant-id` (or `opts.headerName`) from the request headers.
 *  - If the header is missing AND `require: "tenant"` → throws
 *    `ORPCError("TENANT_NOT_RESOLVED", { message, data: { code: "TENANT_NOT_RESOLVED" } })`.
 *  - Otherwise injects `tenantId` (possibly `undefined`) into the context.
 */
export function tenantMiddleware<TRequire extends "tenant" | "optional">(
  opts: TenantMiddlewareOptions & { require: TRequire },
) {
  const headerName = opts.headerName ?? DEFAULT_HEADER;

  return os.$context<TenantMiddlewareContext>().middleware(async ({ context, next }) => {
    const raw = context.reqHeaders?.get(headerName);
    const tenantId = raw?.trim() ? raw.trim() : undefined;

    if (opts.require === "tenant" && !tenantId) {
      throw new ORPCError("TENANT_NOT_RESOLVED", {
        message: sharedErrorCodes.TENANT_NOT_RESOLVED.message,
        data: { code: "TENANT_NOT_RESOLVED" },
      });
    }

    // SAFETY: the branch above guarantees `tenantId` is a string whenever
    // `require` is "tenant"; "optional" intentionally allows `undefined`.
    return next({
      context: { tenantId } as TenantContextOf<TRequire>,
    });
  });
}
