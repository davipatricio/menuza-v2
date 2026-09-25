import { implement } from "@orpc/server";
import type {
  RequestHeadersHandlerPluginContext,
  ResponseHeadersHandlerPluginContext,
} from "@orpc/server/plugins";
import { tenantContractObject } from "@menuza/shared/tenant";
import {
  getCookieName,
  parseCookies,
  revokeSession,
  serializeClearSessionCookie,
} from "@menuza/orpc-server/auth";

const os = implement(tenantContractObject.session.logout).$context<
  RequestHeadersHandlerPluginContext & ResponseHeadersHandlerPluginContext
>();

export const logoutImpl = os.handler(async ({ context }) => {
  const token = parseCookies(context.reqHeaders?.get("cookie"))[getCookieName("tenant")];

  // Idempotent: revoke when there is a session, but always clear the cookie so
  // a stale or tampered value cannot linger.
  if (token) await revokeSession(token);

  context.resHeaders?.append(
    "set-cookie",
    serializeClearSessionCookie("tenant", { secure: process.env.NODE_ENV === "production" }),
  );

  return { success: true };
});

export type LogoutImpl = typeof logoutImpl;
