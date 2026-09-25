import { createHash, randomUUID } from "node:crypto";
import { db as defaultDb, type Db } from "@menuza/db";
import type { AuthNamespace } from "./types.ts";

export const COMMERCE_COOKIE_NAME = "menuza_commerce_sid";

export const TENANT_COOKIE_NAME = "menuza_tenant_sid";

export const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

// Absolute cap is DEFAULT_SESSION_TTL_SECONDS; a session also dies after this
// long without use, so a stolen bearer token does not stay live for the full week.
export const DEFAULT_IDLE_TTL_SECONDS = 60 * 60 * 24; // 24 hours

// Sliding the idle window writes the session row; refreshing on every
// authenticated request would add a write (and a row lock) per call.
export const LAST_USED_REFRESH_INTERVAL_SECONDS = 300; // 5 minutes

export const MEMBERSHIP_CACHE_TTL_MS = 60 * 1000; // 60 seconds

export function getCookieName(namespace: AuthNamespace): string {
  return namespace === "tenant" ? TENANT_COOKIE_NAME : COMMERCE_COOKIE_NAME;
}

/**
 * A session id is a bearer credential: whoever holds the value can act as the
 * member. Only its SHA-256 is persisted, so a database dump yields no usable
 * session. Hashing is internal to this module — the digest is never returned by
 * any public read and never leaves the module as a credential. The function is
 * exported so tests and tooling can verify the persisted key.
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Origin/Referer check intended for state-changing auth requests (login,
 * logout, recovery): `SameSite=Lax` withholds the cookie from cross-site POSTs
 * but not from same-site sibling origins, so callers should verify the source.
 *
 * Fails closed: an unparseable source, or a source presented without a host to
 * compare against, is rejected. A request with neither header is allowed — a
 * non-browser client (curl, native app) never rode along on the victim's cookies.
 */
export function isSameOriginRequest(options: {
  origin?: string | null;
  referer?: string | null;
  host?: string | null;
}): boolean {
  const origin = options.origin?.trim();
  const referer = options.referer?.trim();

  if (!origin && !referer) return true;

  const host = options.host?.trim().toLowerCase();

  if (!host) return false;

  let source: string;

  if (origin) {
    source = origin;
  } else {
    try {
      source = new URL(referer!).origin;
    } catch {
      return false;
    }
  }

  try {
    return new URL(source).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

export function parseCookies(header: string | null | undefined) {
  const cookies: Record<string, string> = {};

  if (!header) return cookies;

  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");

    if (name && rest.length > 0) {
      const rawVal = rest.join("=");

      try {
        cookies[name] = decodeURIComponent(rawVal);
      } catch {
        // Fall back to raw string on malformed percent-encoding to protect against URIError crashes
        cookies[name] = rawVal;
      }
    }
  }

  return cookies;
}

export function serializeSessionCookie(
  namespace: AuthNamespace,
  sessionId: string,
  options?: { maxAgeSeconds?: number; secure?: boolean },
): string {
  const name = getCookieName(namespace);
  const maxAge = options?.maxAgeSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  // Secure defaults on so a forgotten caller cannot ship a plaintext-transport
  // cookie; local development over HTTP opts out explicitly.
  const secure = options?.secure ?? true;

  return `${name}=${encodeURIComponent(sessionId)}; HttpOnly;${secure ? " Secure;" : ""} SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function serializeClearSessionCookie(
  namespace: AuthNamespace,
  options?: { secure?: boolean },
): string {
  const name = getCookieName(namespace);
  const secure = options?.secure ?? true;

  return `${name}=; HttpOnly;${secure ? " Secure;" : ""} SameSite=Lax; Path=/; Max-Age=0`;
}

interface CachedMembership {
  readonly tenantId: string;
  readonly role: string;
  readonly expiresAt: number;
}

// In-memory membership cache (Map<sessionId, Map<tenantId, CachedMembership>>)
// ponytail: in-memory membership cache single-process; migrar para redis quando clusterizar workers/apis.
const membershipCache = new Map<string, Map<string, CachedMembership>>();

export function getCachedMembership(
  sessionId: string,
  tenantId: string,
): { tenantId: string; role: string } | null {
  const sessionMap = membershipCache.get(sessionId);

  if (!sessionMap) return null;

  const entry = sessionMap.get(tenantId);

  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    sessionMap.delete(tenantId);

    if (sessionMap.size === 0) {
      membershipCache.delete(sessionId);
    }

    return null;
  }

  return { tenantId: entry.tenantId, role: entry.role };
}

export function setCachedMembership(
  sessionId: string,
  membership: { tenantId: string; role: string },
  ttlMs = MEMBERSHIP_CACHE_TTL_MS,
): void {
  let sessionMap = membershipCache.get(sessionId);

  if (!sessionMap) {
    sessionMap = new Map();
    membershipCache.set(sessionId, sessionMap);
  }

  sessionMap.set(membership.tenantId, {
    tenantId: membership.tenantId,
    role: membership.role,
    expiresAt: Date.now() + ttlMs,
  });
}

export function invalidateMembershipCache(sessionId: string): void {
  membershipCache.delete(sessionId);
}

export function clearMembershipCache(): void {
  membershipCache.clear();
}

export async function createSession(options: {
  memberId: string;
  namespace: AuthNamespace;
  ttlSeconds?: number;
  /** Opt out only for local development over HTTP; see serializeSessionCookie. */
  secure?: boolean;
  db?: Db;
}): Promise<{ id: string; expiresAt: Temporal.PlainDateTime; cookie: string }> {
  const client = options.db ?? defaultDb;
  const ttl = options.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  // The raw token is the bearer credential handed to the client; the row key
  // is only its digest, so the database never holds a usable session.
  const token = randomUUID();

  const now = Temporal.Now.zonedDateTimeISO("UTC");

  const expiresAt = now.add({ seconds: ttl }).toPlainDateTime();

  await client.orm.public.Session.create({
    id: hashSessionToken(token),
    memberId: options.memberId,
    namespace: options.namespace,
    expiresAt,
    // Set explicitly rather than relying on the column default so the idle
    // window starts from the same instant as the absolute cap.
    lastUsedAt: now.toPlainDateTime(),
  });

  const cookie = serializeSessionCookie(options.namespace, token, {
    maxAgeSeconds: ttl,
    secure: options.secure,
  });

  return { id: token, expiresAt, cookie };
}

/**
 * Revokes the session for the given raw bearer token; the token is hashed
 * internally before the row is located.
 */
export async function revokeSession(sessionId: string, customDb?: Db): Promise<void> {
  const client = customDb ?? defaultDb;

  invalidateMembershipCache(sessionId);

  const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

  await client.orm.public.Session.where({ id: hashSessionToken(sessionId) }).updateAll({
    revokedAt: now,
  });
}

/**
 * Looks up a session by its raw bearer token, hashing internally. The returned
 * `id` is that raw token — safe to hand to `revokeSession`, but never a valid
 * `Session.where({ id })` key, since rows are keyed by the digest.
 */
export async function getSession(sessionId: string, customDb?: Db) {
  const client = customDb ?? defaultDb;

  const session = await client.orm.public.Session.where({
    id: hashSessionToken(sessionId),
  }).first();

  if (!session) return null;

  // Check revocation
  if (session.revokedAt) return null;

  const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

  // Check absolute expiration
  if (Temporal.PlainDateTime.compare(session.expiresAt, now) <= 0) {
    return null;
  }

  // Check idle timeout: last use at or before the cutoff means the session sat
  // untouched past its window, even inside the absolute lifetime.
  const idleCutoff = now.subtract({ seconds: DEFAULT_IDLE_TTL_SECONDS });

  if (Temporal.PlainDateTime.compare(session.lastUsedAt, idleCutoff) <= 0) {
    return null;
  }

  // Slide the idle window forward, but throttled: only write once the last use
  // is at or past the refresh interval.
  // ponytail: throttled refresh — the stored lastUsedAt can lag real use by at
  // most LAST_USED_REFRESH_INTERVAL_SECONDS, so the idle deadline is off by at
  // most one granularity; it saves a write per authenticated request.
  const refreshCutoff = now.subtract({ seconds: LAST_USED_REFRESH_INTERVAL_SECONDS });

  if (Temporal.PlainDateTime.compare(session.lastUsedAt, refreshCutoff) <= 0) {
    await client.orm.public.Session.where({ id: session.id }).updateAll({ lastUsedAt: now });
  }

  // Re-expose the caller-facing token: the stored digest is a storage detail,
  // and downstream code (membership cache, logout) keys off the token the
  // client actually holds.
  return { ...session, id: sessionId };
}

export async function getTenantMembership(
  sessionId: string,
  memberId: string,
  tenantId: string,
  customDb?: Db,
): Promise<{ tenantId: string; role: string } | null> {
  const cached = getCachedMembership(sessionId, tenantId);

  if (cached) {
    return cached;
  }

  const client = customDb ?? defaultDb;
  const row = await client.orm.public.TenantMembership.where({ memberId, tenantId }).first();

  if (!row) {
    return null;
  }

  const membership = { tenantId: row.tenantId, role: row.role };

  setCachedMembership(sessionId, membership);

  return membership;
}
