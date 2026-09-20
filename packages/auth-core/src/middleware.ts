import { ORPCError, os } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { sharedErrorCodes } from "@menuza/shared/errors";
import type { OptionalTenantContext } from "@menuza/tenant-context";
import { getCookieName, getSession, getTenantMembership, parseCookies } from "./session.ts";
import type { AuthContext, AuthNamespace, AuthSessionContext } from "./types.ts";

export interface AuthMiddlewareOptions<TNamespace extends AuthNamespace> {
  namespace: TNamespace;
}

type AuthInitialContext = RequestHeadersHandlerPluginContext & OptionalTenantContext;

export function authMiddleware<TNamespace extends AuthNamespace>(
  opts: AuthMiddlewareOptions<TNamespace>,
) {
  const cookieName = getCookieName(opts.namespace);

  return os.$context<AuthInitialContext>().middleware(async ({ context, next }) => {
    const rawCookie = context.reqHeaders?.get("cookie");
    const cookies = parseCookies(rawCookie);
    const sessionId = cookies[cookieName];

    if (!sessionId) {
      throw new ORPCError("UNAUTHORIZED", {
        message: sharedErrorCodes.UNAUTHORIZED.message,
        data: { code: "UNAUTHORIZED" },
      });
    }

    const session = await getSession(sessionId);

    if (!session || session.namespace !== opts.namespace) {
      throw new ORPCError("UNAUTHORIZED", {
        message: sharedErrorCodes.UNAUTHORIZED.message,
        data: { code: "UNAUTHORIZED" },
      });
    }

    if (opts.namespace === "tenant") {
      const tenantId = context.tenantId;

      if (!tenantId) {
        throw new ORPCError("TENANT_NOT_RESOLVED", {
          message: sharedErrorCodes.TENANT_NOT_RESOLVED.message,
          data: { code: "TENANT_NOT_RESOLVED" },
        });
      }

      const membership = await getTenantMembership(session.id, session.memberId, tenantId);

      if (!membership) {
        throw new ORPCError("FORBIDDEN", {
          message: sharedErrorCodes.FORBIDDEN.message,
          data: { code: "FORBIDDEN" },
        });
      }

      const sessionContext: AuthSessionContext<"tenant"> = {
        sessionId: session.id,
        memberId: session.memberId,
        tenantId,
        role: membership.role,
      };

      // SAFETY: namespace === "tenant" branch guarantees TenantSessionContext.
      const tenantContext: AuthContext<"tenant"> = { session: sessionContext };

      return next({
        // SAFETY: TNamespace is narrowed to "tenant" in this branch.
        context: tenantContext as AuthContext<TNamespace>,
      });
    }

    const commerceSessionContext: AuthSessionContext<"commerce"> = {
      sessionId: session.id,
      memberId: session.memberId,
    };

    // SAFETY: namespace === "commerce" branch guarantees CommerceSessionContext.
    const commerceContext: AuthContext<"commerce"> = { session: commerceSessionContext };

    return next({
      // SAFETY: TNamespace is narrowed to "commerce" in this branch.
      context: commerceContext as AuthContext<TNamespace>,
    });
  });
}
