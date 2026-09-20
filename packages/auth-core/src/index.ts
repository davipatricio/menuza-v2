export { hashPassword, verifyPassword } from "./password.ts";

export {
  COMMERCE_COOKIE_NAME,
  TENANT_COOKIE_NAME,
  DEFAULT_SESSION_TTL_SECONDS,
  MEMBERSHIP_CACHE_TTL_MS,
  clearMembershipCache,
  createSession,
  getCachedMembership,
  getCookieName,
  getSession,
  getTenantMembership,
  invalidateMembershipCache,
  parseCookies,
  revokeSession,
  serializeClearSessionCookie,
  serializeSessionCookie,
  setCachedMembership,
} from "./session.ts";

export { authMiddleware, type AuthMiddlewareOptions } from "./middleware.ts";

export type {
  AuthContext,
  AuthNamespace,
  AuthSessionContext,
  CommerceSessionContext,
  TenantSessionContext,
} from "./types.ts";
