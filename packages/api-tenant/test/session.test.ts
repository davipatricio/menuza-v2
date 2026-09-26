/* eslint-disable anti-slop/no-chained-type-assertions */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { call } from "@orpc/server";
import { db } from "@menuza/db";
import { hashPassword } from "@menuza/orpc-server/auth";
import { loginImpl } from "../src/domains/tenant/subdomains/session/login.impl.ts";
import { logoutImpl } from "../src/domains/tenant/subdomains/session/logout.impl.ts";
import { currentImpl } from "../src/domains/tenant/subdomains/session/current.impl.ts";
import { registerImpl } from "../src/domains/tenant/subdomains/session/register.impl.ts";
import { getStoreImpl } from "../src/domains/tenant/subdomains/panel/getStore.impl.ts";
import { createStoreImpl } from "../src/domains/tenant/subdomains/panel/createStore.impl.ts";
import { saveOnboardingImpl } from "../src/domains/tenant/subdomains/profile/saveOnboarding.impl.ts";

interface MemberRow {
  id: string;
  email: string;
  name: string | null;
  kind: string;
  passwordHash: string | null;
  birthdate?: Temporal.PlainDateTime | null;
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

interface OnboardingRow {
  id: string;
  memberId: string;
  persona: string;
  segment: string | null;
  referral: string | null;
  completedAt: Temporal.PlainDateTime;
  createdAt?: Temporal.PlainDateTime;
  updatedAt: Temporal.PlainDateTime;
}

const members: MemberRow[] = [];

const tenants: TenantRow[] = [];

const memberships: MembershipRow[] = [];

const sessions: SessionRow[] = [];

const onboardingRows: OnboardingRow[] = [];

const originals = {
  memberWhere: db.orm.public.Member.where,
  memberCreate: db.orm.public.Member.create,
  tenantWhere: db.orm.public.Tenant.where,
  tenantCreate: db.orm.public.Tenant.create,
  membershipWhere: db.orm.public.TenantMembership.where,
  membershipCreate: db.orm.public.TenantMembership.create,
  sessionWhere: db.orm.public.Session.where,
  sessionCreate: db.orm.public.Session.create,
  onboardingWhere: db.orm.public.MemberOnboarding.where,
  onboardingCreate: db.orm.public.MemberOnboarding.create,
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

  // SAFETY: Mocking Member.create; appends the row register writes.
  db.orm.public.Member.create = (async (data: MemberRow) => {
    members.push(data);

    return data;
  }) as any;

  // SAFETY: Mocking Tenant.create; appends the row createStore writes.
  db.orm.public.Tenant.create = (async (data: TenantRow) => {
    tenants.push(data);

    return data;
  }) as any;

  // SAFETY: Mocking TenantMembership.create; appends the row createStore writes.
  db.orm.public.TenantMembership.create = (async (data: MembershipRow) => {
    memberships.push(data);

    return data;
  }) as any;

  // SAFETY: Mocking MemberOnboarding.where; `.first()` and `.updateAll()` by memberId.
  db.orm.public.MemberOnboarding.where = ((filter: { memberId: string }) => ({
    first: async () => onboardingRows.find((row) => row.memberId === filter.memberId) ?? null,
    updateAll: async (data: Partial<OnboardingRow>) => {
      for (const row of onboardingRows) {
        if (row.memberId !== filter.memberId) continue;

        Object.assign(row, data);
      }
    },
  })) as any;

  // SAFETY: Mocking MemberOnboarding.create; appends the row saveOnboarding writes.
  db.orm.public.MemberOnboarding.create = (async (data: OnboardingRow) => {
    onboardingRows.push(data);

    return data;
  }) as any;
}

function restoreFakes() {
  db.orm.public.Member.where = originals.memberWhere;
  db.orm.public.Member.create = originals.memberCreate;
  db.orm.public.Tenant.where = originals.tenantWhere;
  db.orm.public.Tenant.create = originals.tenantCreate;
  db.orm.public.TenantMembership.where = originals.membershipWhere;
  db.orm.public.TenantMembership.create = originals.membershipCreate;
  db.orm.public.Session.where = originals.sessionWhere;
  db.orm.public.Session.create = originals.sessionCreate;
  db.orm.public.MemberOnboarding.where = originals.onboardingWhere;
  db.orm.public.MemberOnboarding.create = originals.onboardingCreate;
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

  describe("profile.saveOnboarding", () => {
    test("creates the onboarding row for the authenticated member", async () => {
      const reqHeaders = await sessionCookie();

      const result = await call(
        saveOnboardingImpl,
        { persona: "owner", segment: "restaurant", referral: "instagram" },
        { context: { reqHeaders } },
      );

      expect(result).toEqual({ persona: "owner", segment: "restaurant", referral: "instagram" });
      expect(onboardingRows).toHaveLength(1);
      expect(onboardingRows[0]?.memberId).toBe(MEMBER_ID);
    });

    test("reopening updates the row instead of duplicating it", async () => {
      const reqHeaders = await sessionCookie();

      const result = await call(
        saveOnboardingImpl,
        { persona: "exploring" },
        { context: { reqHeaders } },
      );

      expect(result).toEqual({ persona: "exploring", segment: null, referral: null });
      expect(onboardingRows).toHaveLength(1);
      expect(onboardingRows[0]?.persona).toBe("exploring");
      expect(onboardingRows[0]?.segment).toBeNull();
    });

    test("requires a session", async () => {
      try {
        await call(
          saveOnboardingImpl,
          { persona: "owner" },
          { context: { reqHeaders: new Headers() } },
        );
        throw new Error("expected saveOnboarding to fail");
      } catch (error) {
        // SAFETY: saveOnboarding only throws the shared UNAUTHORIZED code.
        expect((error as { code: string }).code).toBe("UNAUTHORIZED");
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

  describe("session.register", () => {
    test("creates the account, opens a session and returns no memberships", async () => {
      const resHeaders = new Headers();

      const result = await call(
        registerImpl,
        {
          name: "Novo Dono",
          email: "novo@menuza.local",
          birthdate: "1990-05-10",
          password: "senha-forte",
        },
        { context: { resHeaders, reqHeaders: new Headers() } },
      );

      // SAFETY: the register contract returns the member plus an empty list.
      const output = result as { member: { email: string; name: string }; memberships: unknown[] };

      expect(output.member.email).toBe("novo@menuza.local");
      expect(output.member.name).toBe("Novo Dono");
      expect(output.memberships).toEqual([]);
      expect(resHeaders.get("set-cookie")).toContain(`${COOKIE_NAME}=`);
      expect(cookieToken(resHeaders)).not.toBe("");
    });

    test("rejects a duplicate e-mail with CONFLICT", async () => {
      try {
        await call(
          registerImpl,
          {
            name: "Outra Pessoa",
            email: "marina@menuza.local",
            birthdate: "1990-05-10",
            password: "senha-forte",
          },
          { context: { resHeaders: new Headers(), reqHeaders: new Headers() } },
        );
        throw new Error("expected register to fail");
      } catch (error) {
        // SAFETY: register maps a duplicate e-mail to the shared CONFLICT code.
        expect((error as { code: string }).code).toBe("CONFLICT");
      }
    });

    test("rejects a cross-origin request", async () => {
      const reqHeaders = new Headers({
        origin: "https://evil.example",
        "x-forwarded-host": "app.menuza.local",
      });

      try {
        await call(
          registerImpl,
          {
            name: "Novo Dono",
            email: "outro@menuza.local",
            birthdate: "1990-05-10",
            password: "senha-forte",
          },
          { context: { resHeaders: new Headers(), reqHeaders } },
        );
        throw new Error("expected register to fail");
      } catch (error) {
        // SAFETY: the origin guard throws the shared FORBIDDEN code.
        expect((error as { code: string }).code).toBe("FORBIDDEN");
      }
    });
  });

  describe("panel.createStore", () => {
    async function freshSession(email: string): Promise<Headers> {
      const resHeaders = new Headers();

      await call(
        registerImpl,
        { name: "Dono da Loja", email, birthdate: "1985-01-02", password: "senha-forte" },
        { context: { resHeaders, reqHeaders: new Headers() } },
      );

      return cookieHeader(cookieToken(resHeaders));
    }

    test("creates a store and links the caller as owner", async () => {
      const reqHeaders = await freshSession("dona@menuza.local");

      const result = await call(
        createStoreImpl,
        { displayName: "Padaria Nova", slug: "padaria-nova" },
        { context: { reqHeaders } },
      );

      // SAFETY: createStore returns the same shape as getStore.
      const output = result as { tenantId: string; tenantSlug: string; role: string };

      expect(output.tenantSlug).toBe("padaria-nova");
      expect(output.role).toBe("owner");
      expect(tenants.some((row) => row.slug === "padaria-nova")).toBe(true);
      expect(
        memberships.some((row) => row.tenantId === output.tenantId && row.role === "owner"),
      ).toBe(true);
    });

    test("requires a session", async () => {
      try {
        await call(
          createStoreImpl,
          { displayName: "Sem Sessão", slug: "sem-sessao" },
          { context: { reqHeaders: new Headers() } },
        );
        throw new Error("expected createStore to fail");
      } catch (error) {
        // SAFETY: createStore only throws the shared UNAUTHORIZED code.
        expect((error as { code: string }).code).toBe("UNAUTHORIZED");
      }
    });

    test("rejects a taken slug with CONFLICT", async () => {
      const reqHeaders = await freshSession("dono-2@menuza.local");

      try {
        await call(
          createStoreImpl,
          { displayName: "Outra Mawifoods", slug: "mawifoods" },
          { context: { reqHeaders } },
        );
        throw new Error("expected createStore to fail");
      } catch (error) {
        // SAFETY: createStore maps a taken slug to the shared CONFLICT code.
        expect((error as { code: string }).code).toBe("CONFLICT");
      }
    });
  });
});
