/**
 * Shared-token middleware for internal, service-to-service procedures.
 *
 * An internal procedure is one that must never be reachable from a browser or
 * any other untrusted caller (e.g. storefront host → tenant resolution, which
 * would otherwise be a tenant-enumeration oracle). Instead of a member session
 * the caller presents a single shared token in `x-menuza-internal-token`,
 * compared in constant time against `INTERNAL_API_SECRET`.
 *
 * Gates fail closed: a missing `INTERNAL_API_SECRET` rejects every call with
 * `INTERNAL` rather than degrading to "no token required".
 *
 * Reads `context.reqHeaders`, which `RequestHeadersHandlerPlugin` populates per
 * request (see `buildRequestFetch`). Without that plugin the header is invisible
 * and every call is rejected.
 */
import { timingSafeEqual } from "node:crypto";
import { ORPCError, os } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { sharedErrorCodes } from "@menuza/shared/errors";

export interface InternalTokenOptions {
  /** Defaults to `x-menuza-internal-token`. Override only for cross-context tests. */
  headerName?: string;
}

const DEFAULT_HEADER = "x-menuza-internal-token";

const ENV_VAR = "INTERNAL_API_SECRET";

/** Constant-time string comparison; length inequality short-circuits to false. */
function tokensMatch(provided: string, expected: string): boolean {
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);

  if (providedBytes.length !== expectedBytes.length) return false;

  return timingSafeEqual(providedBytes, expectedBytes);
}

/**
 * Returns an oRPC middleware that:
 *  - Rejects with `INTERNAL` when `INTERNAL_API_SECRET` is not configured.
 *  - Rejects with `UNAUTHORIZED` when the token header is missing or wrong.
 *  - Otherwise continues unchanged (adds no context).
 */
export function internalTokenMiddleware(opts: InternalTokenOptions = {}) {
  const headerName = opts.headerName ?? DEFAULT_HEADER;

  return os.$context<RequestHeadersHandlerPluginContext>().middleware(async ({ context, next }) => {
    const expected = process.env[ENV_VAR];

    if (!expected) {
      throw new ORPCError("INTERNAL", {
        message: sharedErrorCodes.INTERNAL.message,
        data: { code: "INTERNAL" },
      });
    }

    const provided = context.reqHeaders?.get(headerName);

    if (!provided || !tokensMatch(provided, expected)) {
      throw new ORPCError("UNAUTHORIZED", {
        message: sharedErrorCodes.UNAUTHORIZED.message,
        data: { code: "UNAUTHORIZED" },
      });
    }

    return next();
  });
}
