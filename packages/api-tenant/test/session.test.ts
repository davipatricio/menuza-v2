/* eslint-disable anti-slop/no-chained-type-assertions */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { call } from "@orpc/server";
import { db } from "@menuza/db";
import { hashPassword } from "@menuza/orpc-server/auth";
import { loginImpl } from "../src/domains/tenant/subdomains/session/login.impl.ts";
import { logoutImpl } from "../src/domains/tenant/subdomains/session/logout.impl.ts";
import { currentImpl } from "../src/domains/tenant/subdomains/session/current.impl.ts";
import { getStoreImpl } from "../src/domains/tenant/subdomains/panel/getStore.impl.ts";

interface MemberRow {
  id: string;
  email: string;
  name: string | null;
  kind: string;
  passwordHash: string | null;
  createdAt: Temporal.PlainDateTime;
  updatedAt: Temporal.PlainDateTime;
}

interface TenantRow {
  id: string;
  slug: string;
  displayName: string;
  createdAt: Temporal.PlainDateTime;
  updatedAt: Temporal.PlainDateTime;
}

interface MembershipRow {
  id: string;
  memberId: string;
  tenantId: string;
  role: string;
  createdAt: Temporal.PlainDateTime;
}

interface SessionRow {
  id: string;
  memberId: string;
  namespace: string;
  expiresAt: Temporal.PlainDateTime;
  revokedAt: Temporal.PlainDateTime | null;
  createdAt: Temporal.PlainDateTime;
  lastUsedAt: Temporal.PlainDateTime;
}

const members: MemberRow[] = [];

const tenants: TenantRow[] = [];

const memberships: MembershipRow[] = [];

const sessions: SessionRow[] = [];

const originals = {
  memberWhere: db.orm.public.Member.where,
  tenantWhere: db.orm.public.Tenant.where,
  membershipWhere: db.orm.public.TenantMembership.where,
  sessionWhere: db.orm.public.Session.where,
  sessionCreate: db.orm.public.Session.create,
};

const MEMBER_ID = randomUUID();

const TENANT_ID = randomUUID();

const COOKIE_NAME = "menuza_tenant_sid";

// Minimal in-memory stand-ins for the models the procedures read. Only the
// query surface those procedures touch is implemented; the real Prisma model
// types are far wider and infrastructure-backed.
function installFakes() {
  // SAFETY: Mocking Member.where; only `.first()` by id or email is read.
  db.orm.public.Member.where = ((filter: { id?: string; email?: string }) => ({
    first: async () =>
      members.find(
        (row) =>
          (filter.id !== undefined && row.id === filter.id) ||
          (filter.email !== undefined && row.email === filter.email),
      ) ?? null,
  })) as any;

  // SAFETY: Mocking Tenant.where; only `.first()` by id or slug is read.
  db.orm.public.Tenant.where = ((filter: { id?: string; slug?: string }) => ({
    first: async () =>
      tenants.find(
        (row) =>
          (filter.id !== undefined && row.id === filter.id) ||
          (filter.slug !== undefined && row.slug === filter.slug),
      ) ?? null,
  })) as any;

  // SAFETY: Mocking TenantMembership.where; `.first()` and `.all()` by member/tenant.
  db.orm.public.TenantMembership.where = ((filter: { memberId?: string; tenantId?: string }) => ({
    first: async () =>
      memberships.find(
        (row) =>
          (filter.memberId === undefined || row.memberId === filter.memberId) &&
          (filter.tenantId === undefined || row.tenantId === filter.tenantId),
      ) ?? null,
    all: async () =>
      memberships.filter(
        (row) => filter.memberId === undefined || row.memberId === filter.memberId,
      ),
  })) as any;

  // SAFETY: Mocking Session.where; sessions are keyed by the token digest, so
  // `.first()` matches on the already-hashed `filter.id`.
  db.orm.public.Session.where = ((filter: { id: string }) => ({
    first: async () => sessions.find((row) => row.id === filter.id) ?? null,
    updateAll: async (data: {
      revokedAt?: Temporal.PlainDateTime;
      lastUsedAt?: Temporal.PlainDateTime;
    }) => {
      for (const row of sessions) {
        if (row.id !== filter.id) continue;

        if (data.revokedAt) row.revokedAt = data.revokedAt;

        if (data.lastUsedAt) row.lastUsedAt = data.lastUsedAt;
      }
    },
  })) as any;

  // SAFETY: Mocking Session.create; appends the row createSession writes.
  db.orm.public.Session.create = (async (data: SessionRow) => {
    sessions.push(data);

    return data;
  }) as any;
}

function restoreFakes() {
  db.orm.public.Member.where = originals.memberWhere;
  db.orm.public.Tenant.where = originals.tenantWhere;
  db.orm.public.TenantMembership.where = originals.membershipWhere;
  db.orm.public.Session.where = originals.sessionWhere;
  db.orm.public.Session.create = originals.sessionCreate;
}

function cookieHeader(token: string): Headers {
  return new Headers({ cookie: `${COOKIE_NAME}=${token}` });
}

function cookieToken(resHeaders: Headers): string {
  const match = new RegExp(`${COOKIE_NAME}=([^;]+)`).exec(resHeaders.get("set-cookie") ?? "");

  return match?.[1] ?? "";
}

async function login(
  email: string,
  password: string,
): Promise<{ result: unknown; resHeaders: Headers }> {
  const resHeaders = new Headers();

  const result = await call(
    loginImpl,
    { email, password },
    { context: { resHeaders, reqHeaders: new Headers() } },
  );

  return { result, resHeaders };
}

async function sessionCookie(): Promise<Headers> {
  const { resHeaders } = await login("marina@menuza.local", "senha-correta");

  return cookieHeader(cookieToken(resHeaders));
}

describe("tenant session + panel procedures — Unit (infrastructure-free)", () => {
  beforeAll(async () => {
    installFakes();

    members.push({
      id: MEMBER_ID,
      email: "marina@menuza.local",
      name: "Marina Lopes",
      kind: "human",
      passwordHash: await hashPassword("senha-correta"),
      createdAt: Temporal.Now.plainDateTimeISO(),
      updatedAt: Temporal.Now.plainDateTimeISO(),
    });

    members.push({
      id: randomUUID(),
      email: "bot@menuza.local",
      name: "Bot",
      kind: "bot",
      passwordHash: null,
      createdAt: Temporal.Now.plainDateTimeISO(),
      updatedAt: Temporal.Now.plainDateTimeISO(),
    });

    tenants.push({
      id: TENANT_ID,
      slug: "mawifoods",
      displayName: "Mawifoods",
      createdAt: Temporal.Now.plainDateTimeISO(),
      updatedAt: Temporal.Now.plainDateTimeISO(),
    });

    memberships.push({
      id: randomUUID(),
      memberId: MEMBER_ID,
      tenantId: TENANT_ID,
      role: "owner",
      createdAt: Temporal.Now.plainDateTimeISO(),
    });
  });

  afterAll(() => {
    restoreFakes();
  });

  describe("session.login", () => {
    test("valid credentials open a session and return memberships", async () => {
      const { result, resHeaders } = await login("marina@menuza.local", "senha-correta");

      // SAFETY: the mocked member and membership above define this exact shape.
      const output = result as {
        member: { id: string; name: string | null };
        memberships: Array<{
          tenantId: string;
          tenantSlug: string;
          tenantName: string;
          role: string;
        }>;
      };

      expect(output.member.id).toBe(MEMBER_ID);
      expect(output.member.name).toBe("Marina Lopes");
      expect(output.memberships).toEqual([
        { tenantId: TENANT_ID, tenantSlug: "mawifoods", tenantName: "Mawifoods", role: "owner" },
      ]);

      const setCookie = resHeaders.get("set-cookie") ?? "";

      expect(setCookie).toContain(`${COOKIE_NAME}=`);
      expect(setCookie).toContain("HttpOnly");
      expect(cookieToken(resHeaders)).not.toBe("");
    });

    test("wrong password fails closed without a cookie", async () => {
      const resHeaders = new Headers();

      try {
        await call(
          loginImpl,
          { email: "marina@menuza.local", password: "senha-errada" },
          { context: { resHeaders, reqHeaders: new Headers() } },
        );
        throw new Error("expected login to fail");
      } catch (error) {
        // SAFETY: login only throws the shared UNAUTHORIZED code.
        expect((error as { code: string }).code).toBe("UNAUTHORIZED");
      }

      expect(resHeaders.get("set-cookie")).toBeNull();
    });

    test("unknown email is indistinguishable from a wrong password", async () => {
      try {
        await login("ninguem@menuza.local", "qualquer");
        throw new Error("expected login to fail");
      } catch (error) {
        // SAFETY: login only throws the shared UNAUTHORIZED code.
        expect((error as { code: string }).code).toBe("UNAUTHORIZED");
      }
    });

    test("a member without a password hash never authenticates", async () => {
      try {
        await login("bot@menuza.local", "qualquer");
        throw new Error("expected login to fail");
      } catch (error) {
        // SAFETY: login only throws the shared UNAUTHORIZED code.
        expect((error as { code: string }).code).toBe("UNAUTHORIZED");
      }
    });
  });

  describe("session.current", () => {
    test("resolves the member from the session cookie", async () => {
      const reqHeaders = await sessionCookie();

      const result = await call(currentImpl, undefined, { context: { reqHeaders } });

      // SAFETY: the mocked member and membership above define this exact shape.
      const output = result as {
        member: { id: string };
        memberships: Array<{ tenantSlug: string }>;
      };

      expect(output.member.id).toBe(MEMBER_ID);
      expect(output.memberships[0]?.tenantSlug).toBe("mawifoods");
    });

    test("rejects a missing or unknown cookie", async () => {
      for (const reqHeaders of [new Headers(), cookieHeader("nao-existe")]) {
        try {
          await call(currentImpl, undefined, { context: { reqHeaders } });
          throw new Error("expected current to fail");
        } catch (error) {
          // SAFETY: current only throws the shared UNAUTHORIZED code.
          expect((error as { code: string }).code).toBe("UNAUTHORIZED");
        }
      }
    });
  });

  describe("session.logout", () => {
    test("revokes the session and clears the cookie", async () => {
      const { resHeaders: loginHeaders } = await login("marina@menuza.local", "senha-correta");
      const token = cookieToken(loginHeaders);
      const resHeaders = new Headers();

      const result = await call(logoutImpl, undefined, {
        context: { reqHeaders: cookieHeader(token), resHeaders },
      });

      expect(result).toEqual({ success: true });
      expect(resHeaders.get("set-cookie")).toContain(`${COOKIE_NAME}=`);
      expect(resHeaders.get("set-cookie")).toContain("Max-Age=0");

      try {
        await call(currentImpl, undefined, { context: { reqHeaders: cookieHeader(token) } });
        throw new Error("expected current to fail after logout");
      } catch (error) {
        // SAFETY: current only throws the shared UNAUTHORIZED code.
        expect((error as { code: string }).code).toBe("UNAUTHORIZED");
      }
    });

    test("is idempotent without a session", async () => {
      const resHeaders = new Headers();

      const result = await call(logoutImpl, undefined, {
        context: { reqHeaders: new Headers(), resHeaders },
      });

      expect(result).toEqual({ success: true });
      expect(resHeaders.get("set-cookie")).toContain("Max-Age=0");
    });
  });

  describe("panel.getStore", () => {
    test("resolves a member's store to its tenant and role", async () => {
      const reqHeaders = await sessionCookie();

      const result = await call(
        getStoreImpl,
        { storeSlug: "mawifoods" },
        { context: { reqHeaders } },
      );

      expect(result).toEqual({
        tenantId: TENANT_ID,
        tenantSlug: "mawifoods",
        tenantName: "Mawifoods",
        role: "owner",
        member: {
          id: MEMBER_ID,
          email: "marina@menuza.local",
          name: "Marina Lopes",
          kind: "human",
        },
      });
    });

    test("an unknown store and a non-member store both yield NOT_FOUND", async () => {
      const reqHeaders = await sessionCookie();

      for (const storeSlug of ["loja-inexistente", "loja-de-outro"]) {
        try {
          await call(getStoreImpl, { storeSlug }, { context: { reqHeaders } });
          throw new Error("expected getStore to fail");
        } catch (error) {
          // SAFETY: getStore only throws the shared NOT_FOUND code.
          expect((error as { code: string }).code).toBe("NOT_FOUND");
        }
      }
    });

    test("requires a session", async () => {
      try {
        await call(
          getStoreImpl,
          { storeSlug: "mawifoods" },
          {
            context: { reqHeaders: new Headers() },
          },
        );
        throw new Error("expected getStore to fail");
      } catch (error) {
        // SAFETY: getStore only throws the shared UNAUTHORIZED code.
        expect((error as { code: string }).code).toBe("UNAUTHORIZED");
      }
    });
  });
});
