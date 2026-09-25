export { hashPassword, verifyPassword } from "./password.ts";

export {
  COMMERCE_COOKIE_NAME,
  TENANT_COOKIE_NAME,
  DEFAULT_IDLE_TTL_SECONDS,
  DEFAULT_SESSION_TTL_SECONDS,
  LAST_USED_REFRESH_INTERVAL_SECONDS,
  MEMBERSHIP_CACHE_TTL_MS,
  clearMembershipCache,
  createSession,
  getCachedMembership,
  getCookieName,
  getSession,
  getTenantMembership,
  hashSessionToken,
  invalidateMembershipCache,
  isSameOriginRequest,
  parseCookies,
  revokeSession,
  serializeClearSessionCookie,
  serializeSessionCookie,
  setCachedMembership,
} from "./session.ts";

export { authMiddleware, type AuthMiddlewareOptions } from "./middleware.ts";

export {
  MEMBER_KINDS,
  TENANT_CAPABILITIES,
  TENANT_ROLES,
  can,
  isMemberKind,
  isTenantRole,
  type MemberKind,
  type TenantCapability,
  type TenantRole,
} from "./types.ts";

export type {
  AuthContext,
  AuthNamespace,
  AuthSessionContext,
  CommerceSessionContext,
  TenantSessionContext,
} from "./types.ts";
