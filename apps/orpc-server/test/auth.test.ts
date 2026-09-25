/* eslint-disable anti-slop/no-chained-type-assertions */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { call, ORPCError, os } from "@orpc/server";
import { db, unscoped, type Db } from "@menuza/db";
import { tenantMiddleware } from "../src/tenant/index.ts";
import {
  authMiddleware,
  clearMembershipCache,
  COMMERCE_COOKIE_NAME,
  createSession,
  DEFAULT_SESSION_TTL_SECONDS,
  getCachedMembership,
  getSession,
  hashPassword,
  hashSessionToken,
  invalidateMembershipCache,
  isSameOriginRequest,
  parseCookies,
  revokeSession,
  serializeClearSessionCookie,
  serializeSessionCookie,
  TENANT_COOKIE_NAME,
  verifyPassword,
} from "../src/auth/index.ts";
import {
  DEFAULT_IDLE_TTL_SECONDS,
  LAST_USED_REFRESH_INTERVAL_SECONDS,
} from "../src/auth/session.ts";
import {
  can,
  isMemberKind,
  isTenantRole,
  MEMBER_KINDS,
  TENANT_CAPABILITIES,
  TENANT_ROLES,
} from "../src/auth/types.ts";

function reqHeaders(headers: Record<string, string> = {}): Headers {
  return new Headers(headers);
}

interface FakeSessionRow {
  readonly id: string;
  readonly memberId: string;
  readonly namespace: string;
  readonly expiresAt: Temporal.PlainDateTime;
  readonly revokedAt: Temporal.PlainDateTime | null;
  readonly createdAt: Temporal.PlainDateTime;
  lastUsedAt: Temporal.PlainDateTime;
}

// Minimal in-memory stand-in for the Session model: only the surface
// getSession/createSession touch, keeping these tests infrastructure-free the
// way the rest of this suite is.
function createSessionDb(rows: FakeSessionRow[]) {
  const sessions = [...rows];
  const updates: Array<{ id: string; lastUsedAt: Temporal.PlainDateTime }> = [];

  const fake = {
    orm: {
      public: {
        Session: {
          where: (filter: { id: string }) => ({
            first: async () => sessions.find((row) => row.id === filter.id) ?? null,
            updateAll: async (data: { lastUsedAt?: Temporal.PlainDateTime }) => {
              if (!data.lastUsedAt) return;

              for (const row of sessions) {
                if (row.id !== filter.id) continue;

                row.lastUsedAt = data.lastUsedAt;
                updates.push({ id: row.id, lastUsedAt: data.lastUsedAt });
              }
            },
          }),
          create: async (data: FakeSessionRow) => {
            sessions.push(data);
          },
        },
      },
    },
  };

  // SAFETY: the fake implements only the Session surface these tests read; the real Db type is far wider.
  return { db: fake as unknown as Db, sessions, updates };
}

describe("@menuza/orpc-server/auth — Unit (infrastructure-free)", () => {
  describe("Password hashing (Argon2id)", () => {
    test("hash and verify roundtrip succeeds", async () => {
      const hash = await hashPassword("my-super-password");
      expect(hash).toContain("$argon2id$");

      const match = await verifyPassword("my-super-password", hash);
      expect(match).toBe(true);

      const wrongMatch = await verifyPassword("wrong-password", hash);
      expect(wrongMatch).toBe(false);
    });

    test("a null passwordHash never authenticates and never throws", async () => {
      expect(await verifyPassword("anything", null)).toBe(false);
    });
  });

  describe("Cookie serialization and parsing", () => {
    test("serializes and parses session cookie correctly", () => {
      const serialized = serializeSessionCookie("tenant", "sess-123");
      expect(serialized).toContain("menuza_tenant_sid=sess-123");
      expect(serialized).toContain("HttpOnly");
      expect(serialized).toContain("Secure");
      expect(serialized).toContain("SameSite=Lax");

      const parsed = parseCookies(serialized);
      expect(parsed[TENANT_COOKIE_NAME]).toBe("sess-123");
    });

    test("serializes clear session cookie", () => {
      const clearCookie = serializeClearSessionCookie("commerce");
      expect(clearCookie).toContain("menuza_commerce_sid=");
      expect(clearCookie).toContain("Max-Age=0");
      expect(clearCookie).toContain("HttpOnly");
      expect(clearCookie).toContain("Secure");
      expect(clearCookie).toContain("SameSite=Lax");
    });

    test("malformed percent-encoding does not throw URIError", () => {
      const parsed = parseCookies("unrelated=%; valid=ok");
      expect(parsed.valid).toBe("ok");
      expect(parsed.unrelated).toBe("%");
    });

    test("omits Secure only when explicitly opted out", () => {
      const insecure = serializeSessionCookie("tenant", "sess-123", { secure: false });
      expect(insecure).not.toContain("Secure");
      expect(insecure).toContain("HttpOnly");
      expect(insecure).toContain("SameSite=Lax");
      expect(insecure).toContain("Path=/");

      const insecureClear = serializeClearSessionCookie("tenant", { secure: false });
      expect(insecureClear).not.toContain("Secure");
      expect(insecureClear).toContain("Max-Age=0");
    });
  });

  describe("Session token hashing", () => {
    test("is deterministic, hex, and not the token itself", () => {
      const first = hashSessionToken("token-a");

      expect(first).toBe(hashSessionToken("token-a"));
      expect(first).not.toBe("token-a");
      expect(first).not.toBe(hashSessionToken("token-b"));
      expect(first).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("Origin/Referer check", () => {
    test("accepts same-origin and same-origin referer", () => {
      expect(isSameOriginRequest({ origin: "https://menuza.com", host: "menuza.com" })).toBe(true);
      expect(isSameOriginRequest({ origin: "https://menuza.com:443", host: "menuza.com" })).toBe(
        true,
      );
      expect(isSameOriginRequest({ referer: "https://menuza.com/login", host: "menuza.com" })).toBe(
        true,
      );
    });

    test("rejects cross-origin sources", () => {
      expect(isSameOriginRequest({ origin: "https://evil.com", host: "menuza.com" })).toBe(false);
      expect(isSameOriginRequest({ referer: "https://evil.com/x", host: "menuza.com" })).toBe(
        false,
      );
      expect(isSameOriginRequest({ origin: "https://menuza.com", host: "evil.com" })).toBe(false);
    });

    test("fails closed on unparseable sources and on a source without a host", () => {
      expect(isSameOriginRequest({ referer: "not a url", host: "menuza.com" })).toBe(false);
      expect(isSameOriginRequest({ origin: "menuza.com", host: "menuza.com" })).toBe(false);
      expect(isSameOriginRequest({ origin: "https://menuza.com" })).toBe(false);
    });

    test("allows a request with no source headers at all", () => {
      expect(isSameOriginRequest({})).toBe(true);
      expect(isSameOriginRequest({ origin: null, referer: null, host: "menuza.com" })).toBe(true);
    });
  });

  describe("Idle timeout and lastUsedAt refresh", () => {
    function fakeRow(overrides: Partial<FakeSessionRow> = {}): FakeSessionRow {
      const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

      return {
        id: hashSessionToken(randomUUID()),
        memberId: randomUUID(),
        namespace: "tenant",
        expiresAt: now.add({ seconds: DEFAULT_SESSION_TTL_SECONDS }),
        revokedAt: null,
        createdAt: now,
        lastUsedAt: now,
        ...overrides,
      };
    }

    test("rejects a session idle past the idle window", async () => {
      const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();
      const token = randomUUID();

      const { db: fakeDb } = createSessionDb([
        fakeRow({
          id: hashSessionToken(token),
          lastUsedAt: now.subtract({ seconds: DEFAULT_IDLE_TTL_SECONDS + 60 }),
        }),
      ]);

      expect(await getSession(token, fakeDb)).toBeNull();
    });

    test("accepts a session inside the idle window and returns the raw token", async () => {
      const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();
      const token = randomUUID();

      const { db: fakeDb } = createSessionDb([
        fakeRow({
          id: hashSessionToken(token),
          lastUsedAt: now.subtract({ seconds: DEFAULT_IDLE_TTL_SECONDS - 60 }),
        }),
      ]);

      const session = await getSession(token, fakeDb);

      expect(session).not.toBeNull();
      expect(session?.id).toBe(token);
    });

    test("refreshes lastUsedAt only once past the refresh interval", async () => {
      const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

      const staleToken = randomUUID();

      const stale = createSessionDb([
        fakeRow({
          id: hashSessionToken(staleToken),
          lastUsedAt: now.subtract({ seconds: LAST_USED_REFRESH_INTERVAL_SECONDS + 60 }),
        }),
      ]);

      await getSession(staleToken, stale.db);

      expect(stale.updates.length).toBe(1);
      expect(stale.updates[0]?.id).toBe(hashSessionToken(staleToken));

      const freshToken = randomUUID();

      const fresh = createSessionDb([
        fakeRow({
          id: hashSessionToken(freshToken),
          lastUsedAt: now.subtract({ seconds: LAST_USED_REFRESH_INTERVAL_SECONDS - 60 }),
        }),
      ]);

      await getSession(freshToken, fresh.db);

      expect(fresh.updates.length).toBe(0);
    });

    test("createSession seeds lastUsedAt explicitly", async () => {
      const { db: fakeDb, sessions } = createSessionDb([]);

      await createSession({ memberId: randomUUID(), namespace: "tenant", db: fakeDb });

      expect(sessions[0]?.lastUsedAt).toBeInstanceOf(Temporal.PlainDateTime);
    });
  });

  describe("Role and capability vocabulary", () => {
    test("isTenantRole accepts the closed set and rejects anything else", () => {
      for (const role of TENANT_ROLES) {
        expect(isTenantRole(role)).toBe(true);
      }

      expect(isTenantRole("Owner")).toBe(false);
      expect(isTenantRole("editor")).toBe(false);
      expect(isTenantRole("")).toBe(false);
    });

    test("owner grants every capability, including team:write", () => {
      for (const capability of TENANT_CAPABILITIES) {
        expect(can("owner", capability)).toBe(true);
      }
    });

    test("admin grants everything except team:write", () => {
      for (const capability of TENANT_CAPABILITIES) {
        expect(can("admin", capability)).toBe(capability !== "team:write");
      }
    });

    test("staff grants dashboard:read and orders read/write only", () => {
      expect(can("staff", "dashboard:read")).toBe(true);
      expect(can("staff", "orders:read")).toBe(true);
      expect(can("staff", "orders:write")).toBe(true);
      expect(can("staff", "team:read")).toBe(false);
      expect(can("staff", "team:write")).toBe(false);
    });
  });

  describe("Member kind vocabulary", () => {
    test("isMemberKind accepts human and bot and rejects anything else", () => {
      for (const kind of MEMBER_KINDS) {
        expect(isMemberKind(kind)).toBe(true);
      }

      expect(isMemberKind("robot")).toBe(false);
      expect(isMemberKind("Human")).toBe(false);
    });
  });
});

describe.skipIf(!process.env.TEST_INTEGRATION)(
  "@menuza/orpc-server/auth — Integration (DB-backed)",
  () => {
    const memberId = randomUUID();
    const tenant1Id = randomUUID();
    const tenant2Id = randomUUID();

    beforeAll(async () => {
      // Create member
      const passwordHash = await hashPassword("password123");
      await db.orm.public.Member.create({
        id: memberId,
        email: `auth-test-${memberId.slice(0, 8)}@menuza.local`,
        passwordHash,
        updatedAt: Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime(),
      });

      // Create two tenants
      await db.orm.public.Tenant.create({
        id: tenant1Id,
        slug: `tenant-auth-1-${tenant1Id.slice(0, 8)}`,
        displayName: "Tenant Auth 1",
        updatedAt: Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime(),
      });

      await db.orm.public.Tenant.create({
        id: tenant2Id,
        slug: `tenant-auth-2-${tenant2Id.slice(0, 8)}`,
        displayName: "Tenant Auth 2",
        updatedAt: Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime(),
      });

      // Create membership only for tenant1 (role: Admin)
      await db.orm.public.TenantMembership.create({
        id: randomUUID(),
        memberId,
        tenantId: tenant1Id,
        role: "Admin",
      });
    });

    afterAll(async () => {
      await unscoped(async () => {
        await db.orm.public.TenantMembership.where({ memberId }).deleteAll();
        await db.orm.public.Session.where({ memberId }).deleteAll();
        await db.orm.public.Member.where({ id: memberId }).deleteAll();
        await db.orm.public.Tenant.where({ id: tenant1Id }).deleteAll();
        await db.orm.public.Tenant.where({ id: tenant2Id }).deleteAll();
      });
    });

    test("createSession persists only the token digest, never the raw token", async () => {
      const { id: sessionId } = await createSession({
        memberId,
        namespace: "tenant",
      });

      const byDigest = await db.orm.public.Session.where({
        id: hashSessionToken(sessionId),
      }).first();

      expect(byDigest).not.toBeNull();
      expect(byDigest?.memberId).toBe(memberId);

      const byRawToken = await db.orm.public.Session.where({ id: sessionId }).first();

      expect(byRawToken).toBeNull();
    });

    describe("Auth Middleware — Tenant namespace", () => {
      test("valid tenant session with membership succeeds and populates context", async () => {
        const { id: sessionId } = await createSession({
          memberId,
          namespace: "tenant",
        });

        const proc = os
          .use(tenantMiddleware({ require: "tenant" }))
          .use(authMiddleware({ namespace: "tenant" }))
          .handler(({ context }) => ({
            session: context.session,
          }));

        const result = await call(proc, undefined, {
          context: {
            reqHeaders: reqHeaders({
              "x-menuza-tenant-id": tenant1Id,
              cookie: `${TENANT_COOKIE_NAME}=${sessionId}`,
            }),
          },
        });

        expect(result.session.sessionId).toBe(sessionId);
        expect(result.session.memberId).toBe(memberId);
        expect(result.session.tenantId).toBe(tenant1Id);
        expect(result.session.role).toBe("Admin");
      });

      test("tenant session without cookie throws UNAUTHORIZED", async () => {
        const proc = os
          .use(tenantMiddleware({ require: "tenant" }))
          .use(authMiddleware({ namespace: "tenant" }))
          .handler(({ context }) => ({ session: context.session }));

        try {
          await call(proc, undefined, {
            context: {
              reqHeaders: reqHeaders({
                "x-menuza-tenant-id": tenant1Id,
              }),
            },
          });
          expect.unreachable();
        } catch (err: any) {
          expect(err).toBeInstanceOf(ORPCError);
          expect(err.code).toBe("UNAUTHORIZED");
        }
      });

      test("expired session throws UNAUTHORIZED", async () => {
        // Create an expired session in DB directly
        const sessionId = randomUUID();

        const expiredTime = Temporal.Now.zonedDateTimeISO("UTC")
          .subtract({ minutes: 5 })
          .toPlainDateTime();

        await db.orm.public.Session.create({
          id: hashSessionToken(sessionId),
          memberId,
          namespace: "tenant",
          expiresAt: expiredTime,
        });

        const proc = os
          .use(tenantMiddleware({ require: "tenant" }))
          .use(authMiddleware({ namespace: "tenant" }))
          .handler(({ context }) => ({ session: context.session }));

        try {
          await call(proc, undefined, {
            context: {
              reqHeaders: reqHeaders({
                "x-menuza-tenant-id": tenant1Id,
                cookie: `${TENANT_COOKIE_NAME}=${sessionId}`,
              }),
            },
          });
          expect.unreachable();
        } catch (err: any) {
          expect(err).toBeInstanceOf(ORPCError);
          expect(err.code).toBe("UNAUTHORIZED");
        }
      });

      test("revoked session throws UNAUTHORIZED", async () => {
        const { id: sessionId } = await createSession({
          memberId,
          namespace: "tenant",
        });

        await revokeSession(sessionId);

        const proc = os
          .use(tenantMiddleware({ require: "tenant" }))
          .use(authMiddleware({ namespace: "tenant" }))
          .handler(({ context }) => ({ session: context.session }));

        try {
          await call(proc, undefined, {
            context: {
              reqHeaders: reqHeaders({
                "x-menuza-tenant-id": tenant1Id,
                cookie: `${TENANT_COOKIE_NAME}=${sessionId}`,
              }),
            },
          });
          expect.unreachable();
        } catch (err: any) {
          expect(err).toBeInstanceOf(ORPCError);
          expect(err.code).toBe("UNAUTHORIZED");
        }
      });

      test("member without membership in tenant throws FORBIDDEN", async () => {
        const { id: sessionId } = await createSession({
          memberId,
          namespace: "tenant",
        });

        const proc = os
          .use(tenantMiddleware({ require: "tenant" }))
          .use(authMiddleware({ namespace: "tenant" }))
          .handler(({ context }) => ({ session: context.session }));

        // Requesting tenant2Id where member has no membership
        try {
          await call(proc, undefined, {
            context: {
              reqHeaders: reqHeaders({
                "x-menuza-tenant-id": tenant2Id,
                cookie: `${TENANT_COOKIE_NAME}=${sessionId}`,
              }),
            },
          });
          expect.unreachable();
        } catch (err: any) {
          expect(err).toBeInstanceOf(ORPCError);
          expect(err.code).toBe("FORBIDDEN");
        }
      });

      test("commerce session hitting tenant route throws UNAUTHORIZED (namespace isolation)", async () => {
        const { id: sessionId } = await createSession({
          memberId,
          namespace: "commerce",
        });

        const proc = os
          .use(tenantMiddleware({ require: "tenant" }))
          .use(authMiddleware({ namespace: "tenant" }))
          .handler(({ context }) => ({ session: context.session }));

        try {
          await call(proc, undefined, {
            context: {
              reqHeaders: reqHeaders({
                "x-menuza-tenant-id": tenant1Id,
                cookie: `${TENANT_COOKIE_NAME}=${sessionId}`,
              }),
            },
          });
          expect.unreachable();
        } catch (err: any) {
          expect(err).toBeInstanceOf(ORPCError);
          expect(err.code).toBe("UNAUTHORIZED");
        }
      });
    });

    describe("Auth Middleware — Commerce namespace", () => {
      test("valid commerce session succeeds and populates context", async () => {
        const { id: sessionId } = await createSession({
          memberId,
          namespace: "commerce",
        });

        const proc = os
          .use(authMiddleware({ namespace: "commerce" }))
          .handler(({ context }) => ({ session: context.session }));

        const result = await call(proc, undefined, {
          context: {
            reqHeaders: reqHeaders({
              cookie: `${COMMERCE_COOKIE_NAME}=${sessionId}`,
            }),
          },
        });

        expect(result.session.sessionId).toBe(sessionId);
        expect(result.session.memberId).toBe(memberId);
      });
    });

    describe("Membership cache", () => {
      test("caches memberships per tenant and does not lock out second tenant", async () => {
        // Add membership for tenant2 as well
        const membership2Id = randomUUID();
        await db.orm.public.TenantMembership.create({
          id: membership2Id,
          memberId,
          tenantId: tenant2Id,
          role: "Editor",
        });

        const { id: sessionId } = await createSession({
          memberId,
          namespace: "tenant",
        });

        clearMembershipCache();
        expect(getCachedMembership(sessionId, tenant1Id)).toBeNull();

        const proc = os
          .use(tenantMiddleware({ require: "tenant" }))
          .use(authMiddleware({ namespace: "tenant" }))
          .handler(({ context }) => ({ session: context.session }));

        // Access tenant1
        const res1 = await call(proc, undefined, {
          context: {
            reqHeaders: reqHeaders({
              "x-menuza-tenant-id": tenant1Id,
              cookie: `${TENANT_COOKIE_NAME}=${sessionId}`,
            }),
          },
        });

        expect(res1.session.tenantId).toBe(tenant1Id);
        expect(getCachedMembership(sessionId, tenant1Id)?.role).toBe("Admin");

        // Access tenant2 on same session — must NOT fail with null cache hit
        const res2 = await call(proc, undefined, {
          context: {
            reqHeaders: reqHeaders({
              "x-menuza-tenant-id": tenant2Id,
              cookie: `${TENANT_COOKIE_NAME}=${sessionId}`,
            }),
          },
        });

        expect(res2.session.tenantId).toBe(tenant2Id);
        expect(getCachedMembership(sessionId, tenant2Id)?.role).toBe("Editor");

        // Invalidate evicts all tenants for this session
        invalidateMembershipCache(sessionId);
        expect(getCachedMembership(sessionId, tenant1Id)).toBeNull();
        expect(getCachedMembership(sessionId, tenant2Id)).toBeNull();

        // Clean up membership2
        await db.orm.public.TenantMembership.where({
          id: membership2Id,
          tenantId: tenant2Id,
        }).deleteAll();
      });
    });
  },
);
