import { randomUUID } from "node:crypto";
import { db as defaultDb, type Db } from "@menuza/db";
import type { AuthNamespace } from "./types.ts";

export const COMMERCE_COOKIE_NAME = "menuza_commerce_sid";

export const TENANT_COOKIE_NAME = "menuza_tenant_sid";

export const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export const MEMBERSHIP_CACHE_TTL_MS = 60 * 1000; // 60 seconds

export function getCookieName(namespace: AuthNamespace): string {
  return namespace === "tenant" ? TENANT_COOKIE_NAME : COMMERCE_COOKIE_NAME;
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
  options?: { maxAgeSeconds?: number },
): string {
  const name = getCookieName(namespace);
  const maxAge = options?.maxAgeSeconds ?? DEFAULT_SESSION_TTL_SECONDS;

  return `${name}=${encodeURIComponent(sessionId)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function serializeClearSessionCookie(namespace: AuthNamespace): string {
  const name = getCookieName(namespace);

  return `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
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
  db?: Db;
}): Promise<{ id: string; expiresAt: Temporal.PlainDateTime; cookie: string }> {
  const client = options.db ?? defaultDb;
  const ttl = options.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  const id = randomUUID();

  const expiresAt = Temporal.Now.zonedDateTimeISO("UTC").add({ seconds: ttl }).toPlainDateTime();

  await client.orm.public.Session.create({
    id,
    memberId: options.memberId,
    namespace: options.namespace,
    expiresAt,
  });

  const cookie = serializeSessionCookie(options.namespace, id, { maxAgeSeconds: ttl });

  return { id, expiresAt, cookie };
}

export async function revokeSession(sessionId: string, customDb?: Db): Promise<void> {
  const client = customDb ?? defaultDb;

  invalidateMembershipCache(sessionId);

  const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

  await client.orm.public.Session.where({ id: sessionId }).updateAll({
    revokedAt: now,
  });
}

export async function getSession(sessionId: string, customDb?: Db) {
  const client = customDb ?? defaultDb;
  const session = await client.orm.public.Session.where({ id: sessionId }).first();

  if (!session) return null;

  // Check revocation
  if (session.revokedAt) return null;

  // Check expiration
  const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

  if (Temporal.PlainDateTime.compare(session.expiresAt, now) <= 0) {
    return null;
  }

  return session;
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
