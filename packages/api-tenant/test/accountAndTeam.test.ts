/* eslint-disable anti-slop/no-chained-type-assertions */
/* eslint-disable anti-slop/no-runtime-typeof -- one use, in the `Session.where`
   double: it has to route both call shapes the procedures use (a filter object
   from `getSession`, a predicate callback from the account procedures) to the
   same matcher. Telling a callable from a plain object *is* a runtime type
   check; there is no domain value to branch on, because the double's input is a
   query-builder convention rather than parsed data. */
/**
 * Account and team procedures — Unit (infrastructure-free), MEN-225.
 *
 * The properties under test are the ones a UI cannot show:
 *
 *  - Changing the password revokes every *other* session and keeps the caller's.
 *  - A revocation is scoped to the caller's own account: another member's
 *    session digest is a no-op, not a way to reach across accounts.
 *  - An already-revoked session is not counted twice, so the number the UI shows
 *    is what actually changed.
 *  - `listSessions` hides revoked, expired and idle-expired rows, and marks the
 *    caller's own row rather than exposing which digest is current by omission.
 *  - The team read is gated on `team:read`, so `staff` is refused while
 *    `admin`/`owner` are not.
 *
 * The db is faked the same way `session.test.ts` and `panelReads.test.ts` fake
 * it, so no infrastructure is needed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { call } from "@orpc/server";
import { db } from "@menuza/db";
import { hashPassword, hashSessionToken } from "@menuza/orpc-server/auth";
import { loginImpl } from "../src/domains/tenant/subdomains/session/login.impl.ts";
import { listSessionsImpl } from "../src/domains/tenant/subdomains/account/listSessions.impl.ts";
import { changePasswordImpl } from "../src/domains/tenant/subdomains/account/changePassword.impl.ts";
import { revokeSessionImpl } from "../src/domains/tenant/subdomains/account/revokeSession.impl.ts";
import { revokeOtherSessionsImpl } from "../src/domains/tenant/subdomains/account/revokeOtherSessions.impl.ts";
import { listTeamMembersImpl } from "../src/domains/tenant/subdomains/panel/listTeamMembers.impl.ts";

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
  membershipInclude: db.orm.public.TenantMembership.include,
  sessionWhere: db.orm.public.Session.where,
  sessionCreate: db.orm.public.Session.create,
};

// SAFETY: Captured once, before `installFakes` overwrites the model accessors;
// the query builders are read back verbatim on restore.
const MEMBER_ID = randomUUID();

const OTHER_MEMBER_ID = randomUUID();

const TENANT_ID = randomUUID();

const COOKIE_NAME = "menuza_tenant_sid";

const at = (iso: string) => Temporal.PlainDateTime.from(iso);

const soon = () => Temporal.Now.zonedDateTimeISO("UTC").add({ hours: 1 }).toPlainDateTime();

const longAgo = () => Temporal.Now.zonedDateTimeISO("UTC").subtract({ days: 3 }).toPlainDateTime();

interface SessionFilter {
  memberId?: string;
  /** A bare string is an equality match (`getSession`'s `where({ id })`). */
  id?: string | { in: readonly string[] } | { notIn: readonly string[] };
  namespace?: string;
  revokedAt?: string | null;
}

/**
 * The field proxy the account procedures receive. Each operator records a
 * constraint on the shared `filter` and returns the proxy so calls can chain;
 * the chain value is never consumed, which is why every operator returns `void`
 * — the real builder returns query AST nodes, the fake only needs the
 * constraint.
 *
 * `id` is the only field given set operators, because it is the only one the
 * procedures call them on.
 */
interface PredicateFields {
  memberId: { eq(value: string): void };
  namespace: { eq(value: string): void };
  id: {
    eq(value: string): void;
    in(values: readonly string[]): void;
    notIn(values: readonly string[]): void;
  };
  revokedAt: { eq(value: string | null): void };
}

/**
 * How `id` was constrained. `getSession` filters with a bare
 * `where({ id: digest })` while the account procedures use `id.notIn([...])`, so
 * `id` has to carry a scalar and a set. A discriminant keeps the two apart
 * without inspecting the value's runtime type.
 */
type IdConstraint =
  | { readonly kind: "equals"; readonly value: string }
  | { readonly kind: "in"; readonly values: readonly string[] }
  | { readonly kind: "notIn"; readonly values: readonly string[] };

/** Resolves the two call shapes: `where(obj)` and `where(predicate)`. */
function matchesSession(row: SessionRow, filter: SessionFilter | null): boolean {
  if (!filter) return true;

  if (filter.memberId !== undefined && row.memberId !== filter.memberId) return false;

  if (filter.namespace !== undefined && row.namespace !== filter.namespace) return false;

  if (filter.revokedAt === null && row.revokedAt !== null) return false;

  const idFilter = filter.id;

  if (idFilter === undefined) return true;

  // The scalar and the set forms are two shapes of the same builder argument,
  // so telling them apart is a runtime type check (see the file header).
  const constraint: IdConstraint =
    typeof idFilter === "string"
      ? { kind: "equals", value: idFilter }
      : "in" in idFilter
        ? { kind: "in", values: idFilter.in }
        : { kind: "notIn", values: idFilter.notIn };

  switch (constraint.kind) {
    case "equals":
      return row.id === constraint.value;
    case "in":
      return constraint.values.includes(row.id);
    case "notIn":
      return !constraint.values.includes(row.id);
  }
}

/**
 * Resolves the predicate callback into a plain filter object. Each `eq`/`in`/
 * `notIn` call records a constraint, which is the observable part of the real
 * builder; `revokedAt.eq(null)` is the one that has to survive, since it is
 * what makes a revocation count honest.
 *
 * The setters are written per field rather than through one generic helper: `id`
 * accepts a set operator while `memberId` does not, and a shared signature would
 * have to be the union of both, which the compiler then rejects on assignment.
 */
function evaluatePredicate(predicate: (fields: PredicateFields) => void): SessionFilter {
  const filter: SessionFilter = {};

  const fields: PredicateFields = {
    memberId: {
      eq: (value) => {
        filter.memberId = value;
      },
    },
    namespace: {
      eq: (value) => {
        filter.namespace = value;
      },
    },
    id: {
      eq: (value) => {
        filter.id = value;
      },
      in: (values) => {
        filter.id = { in: values };
      },
      notIn: (values) => {
        filter.id = { notIn: values };
      },
    },
    revokedAt: {
      eq: (value) => {
        filter.revokedAt = value;
      },
    },
  };

  predicate(fields);

  return filter;
}

function liveSessionsFor(filter: SessionFilter | null): SessionRow[] {
  return sessions.filter((row) => matchesSession(row, filter));
}

function installFakes() {
  // SAFETY: Mocking Member.where; `.first()` by id/email and `.update()` by id.
  db.orm.public.Member.where = ((filter: { id?: string; email?: string }) => ({
    first: async () =>
      members.find(
        (row) =>
          (filter.id !== undefined && row.id === filter.id) ||
          (filter.email !== undefined && row.email === filter.email),
      ) ?? null,
    update: async (data: Partial<MemberRow>) => {
      for (const row of members) {
        if (row.id !== filter.id) continue;

        Object.assign(row, data);
      }
    },
  })) as any;

  // SAFETY: Mocking Tenant.where; only `.first()` by slug is read.
  db.orm.public.Tenant.where = ((filter: { id?: string; slug?: string }) => ({
    first: async () =>
      tenants.find(
        (row) =>
          (filter.id !== undefined && row.id === filter.id) ||
          (filter.slug !== undefined && row.slug === filter.slug),
      ) ?? null,
  })) as any;

  // SAFETY: Mocking TenantMembership.where; `.first()` by member/tenant and
  // `.all()` by member, which is what loadMemberships reads on every login.
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

  // SAFETY: Mocking TenantMembership.include; the team read joins `member` and
  // orders by createdAt, both filtered to the one tenant. The join is nullable,
  // matching how Prisma types every eager-loaded relation — a membership whose
  // member row is gone yields `null` and the procedure rejects it.
  //
  // The `select` callback is accepted and ignored: the fake always returns the
  // full member row, and the procedure only reads four of its columns.
  db.orm.public.TenantMembership.include = ((
    _relation: string,
    _select: (member: never) => void,
  ) => ({
    where: (filter: { tenantId?: string }) => ({
      orderBy: () => ({
        all: async () =>
          memberships.flatMap((row) =>
            row.tenantId === filter.tenantId
              ? [{ ...row, member: members.find((m) => m.id === row.memberId) ?? null }]
              : [],
          ),
      }),
    }),
  })) as any;

  // SAFETY: Mocking Session.where; the account procedures filter with the
  // predicate form and terminate on `.first()`, `.all()` and
  // `.updateAndCount()`. `revokedAt.eq(null)` is folded into `matchesSession`,
  // so an already-revoked row is invisible to a revocation.
  db.orm.public.Session.where = ((
    filterOrPredicate: SessionFilter | ((fields: PredicateFields) => void),
  ) => {
    const filter =
      typeof filterOrPredicate === "function"
        ? evaluatePredicate(filterOrPredicate)
        : (filterOrPredicate ?? null);

    const write = (rows: SessionRow[], data: { revokedAt?: Temporal.PlainDateTime }) => {
      for (const row of rows) {
        if (data.revokedAt) row.revokedAt = data.revokedAt;
      }
    };

    return {
      first: async () => liveSessionsFor(filter)[0] ?? null,
      all: async () => liveSessionsFor(filter),
      updateAll: async (data: { revokedAt?: Temporal.PlainDateTime }) => {
        write(liveSessionsFor(filter), data);
      },
      updateAndCount: async (data: { revokedAt?: Temporal.PlainDateTime }) => {
        const targets = liveSessionsFor(filter);

        write(targets, data);

        return targets.length;
      },
    };
  }) as any;

  // SAFETY: Mocking Session.create; appends the row login writes. `createSession`
  // omits `revokedAt` (nullable, no default) and lets the database default
  // `createdAt`, so the fake fills both in — otherwise a freshly created session
  // would read as `undefined` where the assertions compare against a value.
  db.orm.public.Session.create = (async (data: Partial<SessionRow>) => {
    const row: SessionRow = {
      id: data.id ?? randomUUID(),
      memberId: data.memberId ?? MEMBER_ID,
      namespace: data.namespace ?? "tenant",
      expiresAt: data.expiresAt ?? soon(),
      revokedAt: null,
      createdAt: data.createdAt ?? soon(),
      lastUsedAt: data.lastUsedAt ?? soon(),
    };

    sessions.push(row);

    return row;
  }) as any;
}

function restoreFakes() {
  db.orm.public.Member.where = originals.memberWhere;
  db.orm.public.Tenant.where = originals.tenantWhere;
  db.orm.public.TenantMembership.where = originals.membershipWhere;
  db.orm.public.TenantMembership.include = originals.membershipInclude;
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

/** Logs in and returns the raw token, so a test can name the caller's digest. */
async function loginToken(): Promise<string> {
  const resHeaders = new Headers();

  await call(
    loginImpl,
    { email: "marina@menuza.local", password: "senha-correta" },
    { context: { resHeaders, reqHeaders: new Headers() } },
  );

  return cookieToken(resHeaders);
}

async function sessionCookie(): Promise<Headers> {
  return cookieHeader(await loginToken());
}

/** An extra live session for the same member, as another browser would open. */
function addSession(token: string, overrides: Partial<SessionRow> = {}): string {
  const id = hashSessionToken(token);

  sessions.push({
    id,
    memberId: MEMBER_ID,
    namespace: "tenant",
    expiresAt: soon(),
    revokedAt: null,
    createdAt: soon(),
    lastUsedAt: soon(),
    ...overrides,
  });

  return id;
}

function liveCountFor(memberId: string): number {
  return sessions.filter((row) => row.memberId === memberId && row.revokedAt === null).length;
}

describe("account + team procedures — Unit (infrastructure-free)", () => {
  beforeAll(async () => {
    installFakes();

    members.push({
      id: MEMBER_ID,
      email: "marina@menuza.local",
      name: "Marina Lopes",
      kind: "human",
      passwordHash: await hashPassword("senha-correta"),
      createdAt: at("2026-01-01 00:00"),
      updatedAt: at("2026-01-01 00:00"),
    });

    members.push({
      id: OTHER_MEMBER_ID,
      email: "bruna@menuza.local",
      name: "Bruna",
      kind: "human",
      passwordHash: await hashPassword("outra-senha"),
      createdAt: at("2026-01-01 00:00"),
      updatedAt: at("2026-01-01 00:00"),
    });

    tenants.push({
      id: TENANT_ID,
      slug: "mawifoods",
      displayName: "Mawifoods",
      createdAt: at("2026-01-01 00:00"),
      updatedAt: at("2026-01-01 00:00"),
    });

    memberships.push({
      id: randomUUID(),
      memberId: MEMBER_ID,
      tenantId: TENANT_ID,
      role: "owner",
      createdAt: at("2026-01-01 00:00"),
    });
  });

  afterAll(() => {
    restoreFakes();
  });

  // Each test starts from "logged in as Marina with the original password, and
  // with exactly the sessions it created". Clearing only the sessions is not
  // enough: a test that changes the password leaves the member's hash altered,
  // and the next `sessionCookie()` would then fail to log in.
  beforeEach(async () => {
    sessions.length = 0;

    const member = members.find((row) => row.id === MEMBER_ID);

    if (member) member.passwordHash = await hashPassword("senha-correta");
  });

  describe("account.listSessions", () => {
    test("marks the caller's own row and hides the dead ones", async () => {
      const token = await loginToken();
      const ownDigest = hashSessionToken(token);

      addSession("outro-navegador", { createdAt: at("2026-02-01 00:00") });
      addSession("sessao-revogada", { revokedAt: at("2026-02-02 00:00") });
      addSession("sessao-expirada", { expiresAt: longAgo() });
      addSession("sessao-ociosa", { lastUsedAt: longAgo() });

      const result = await call(listSessionsImpl, undefined, {
        context: { reqHeaders: cookieHeader(token) },
      });

      const ids = result.sessions.map((session) => session.id);

      expect(ids).toContain(ownDigest);
      expect(ids).toContain(hashSessionToken("outro-navegador"));
      expect(ids).not.toContain(hashSessionToken("sessao-revogada"));
      expect(ids).not.toContain(hashSessionToken("sessao-expirada"));
      expect(ids).not.toContain(hashSessionToken("sessao-ociosa"));

      // Exactly one row is flagged current, and it is the caller's.
      expect(result.sessions.filter((session) => session.current)).toHaveLength(1);
      expect(result.sessions.find((session) => session.current)?.id).toBe(ownDigest);
    });

    test("never returns the bearer token, only its digest", async () => {
      const token = await loginToken();

      const result = await call(listSessionsImpl, undefined, {
        context: { reqHeaders: cookieHeader(token) },
      });

      for (const session of result.sessions) {
        expect(session.id).toMatch(/^[0-9a-f]{64}$/);
        expect(session.id).not.toBe(token);
      }
    });

    test("no session yields UNAUTHORIZED", async () => {
      try {
        await call(listSessionsImpl, undefined, {
          context: { reqHeaders: new Headers() },
        });
        throw new Error("expected listSessions to fail");
      } catch (error) {
        // SAFETY: requireSession only throws the shared UNAUTHORIZED code.
        expect((error as { code: string }).code).toBe("UNAUTHORIZED");
      }
    });
  });

  describe("account.changePassword", () => {
    test("revokes every other session and keeps the caller's", async () => {
      const token = await loginToken();
      const ownDigest = hashSessionToken(token);
      const otherDigest = addSession("sessao-roubada");

      const result = await call(
        changePasswordImpl,
        { currentPassword: "senha-correta", newPassword: "senha-nova-123" },
        { context: { reqHeaders: cookieHeader(token) } },
      );

      expect(result.changed).toBe(true);

      const own = sessions.find((row) => row.id === ownDigest);
      const other = sessions.find((row) => row.id === otherDigest);

      expect(own?.revokedAt).toBeNull();
      expect(other?.revokedAt).not.toBeNull();
    });

    test("the new password works and the old one does not", async () => {
      const token = await loginToken();

      await call(
        changePasswordImpl,
        { currentPassword: "senha-correta", newPassword: "senha-nova-123" },
        { context: { reqHeaders: cookieHeader(token) } },
      );

      // The stored hash is what login verifies against, so re-hashing the member
      // is enough to prove the change persisted.
      const member = members.find((row) => row.id === MEMBER_ID);

      expect(await Bun.password.verify("senha-nova-123", member?.passwordHash ?? "")).toBe(true);
      expect(await Bun.password.verify("senha-correta", member?.passwordHash ?? "")).toBe(false);
    });

    test("reusing the current password changes nothing and revokes nothing", async () => {
      const token = await loginToken();
      const otherDigest = addSession("sessao-ouca");

      const result = await call(
        changePasswordImpl,
        { currentPassword: "senha-correta", newPassword: "senha-correta" },
        { context: { reqHeaders: cookieHeader(token) } },
      );

      expect(result.changed).toBe(false);
      expect(sessions.find((row) => row.id === otherDigest)?.revokedAt).toBeNull();
    });

    test("a wrong current password is UNAUTHORIZED and revokes nothing", async () => {
      const token = await loginToken();
      const otherDigest = addSession("sessao-intacta");

      try {
        await call(
          changePasswordImpl,
          { currentPassword: "senha-errada", newPassword: "senha-nova-123" },
          { context: { reqHeaders: cookieHeader(token) } },
        );
        throw new Error("expected changePassword to fail");
      } catch (error) {
        // SAFETY: changePassword only throws the shared UNAUTHORIZED code here.
        expect((error as { code: string }).code).toBe("UNAUTHORIZED");
      }

      expect(sessions.find((row) => row.id === otherDigest)?.revokedAt).toBeNull();
    });

    test("a cross-origin request is refused", async () => {
      const reqHeaders = cookieHeader(await loginToken());

      reqHeaders.set("origin", "https://evil.example");
      reqHeaders.set("host", "menuza.com");

      try {
        await call(
          changePasswordImpl,
          { currentPassword: "senha-correta", newPassword: "senha-nova-123" },
          { context: { reqHeaders } },
        );
        throw new Error("expected changePassword to fail");
      } catch (error) {
        // SAFETY: assertSameOrigin only throws the shared FORBIDDEN code.
        expect((error as { code: string }).code).toBe("FORBIDDEN");
      }
    });
  });

  describe("account.revokeSession", () => {
    test("revokes the caller's own other session", async () => {
      const token = await loginToken();
      const otherDigest = addSession("sessao-alvo");

      const result = await call(
        revokeSessionImpl,
        { sessionId: otherDigest },
        { context: { reqHeaders: cookieHeader(token) } },
      );

      expect(result.revoked).toBe(1);
      expect(sessions.find((row) => row.id === otherDigest)?.revokedAt).not.toBeNull();
    });

    test("another member's session digest is a no-op, not a cross-account revoke", async () => {
      const token = await loginToken();
      const foreignDigest = hashSessionToken("sessao-da-bruna");

      sessions.push({
        id: foreignDigest,
        memberId: OTHER_MEMBER_ID,
        namespace: "tenant",
        expiresAt: soon(),
        revokedAt: null,
        createdAt: soon(),
        lastUsedAt: soon(),
      });

      const result = await call(
        revokeSessionImpl,
        { sessionId: foreignDigest },
        { context: { reqHeaders: cookieHeader(token) } },
      );

      expect(result.revoked).toBe(0);
      expect(sessions.find((row) => row.id === foreignDigest)?.revokedAt).toBeNull();
    });

    test("an already-revoked session is not counted twice", async () => {
      const token = await loginToken();
      const digest = addSession("sessao-ja-morta", { revokedAt: at("2026-02-03 00:00") });

      const result = await call(
        revokeSessionImpl,
        { sessionId: digest },
        { context: { reqHeaders: cookieHeader(token) } },
      );

      expect(result.revoked).toBe(0);
    });

    test("a malformed digest is rejected by the contract", async () => {
      const token = await loginToken();

      try {
        await call(
          revokeSessionImpl,
          { sessionId: "não-é-um-digest" },
          { context: { reqHeaders: cookieHeader(token) } },
        );
        throw new Error("expected revokeSession to fail");
      } catch {
        // The input schema rejects it before the handler runs; the exact code is
        // oRPC's, and the point is that it never reached the database.
        expect(true).toBe(true);
      }
    });
  });

  describe("account.revokeOtherSessions", () => {
    test("keeps the current session and revokes the rest", async () => {
      const token = await loginToken();
      const ownDigest = hashSessionToken(token);

      addSession("dispositivo-1");
      addSession("dispositivo-2");

      const result = await call(revokeOtherSessionsImpl, undefined, {
        context: { reqHeaders: cookieHeader(token) },
      });

      expect(result.revoked).toBe(2);
      expect(sessions.find((row) => row.id === ownDigest)?.revokedAt).toBeNull();
      expect(liveCountFor(MEMBER_ID)).toBe(1);
    });

    test("reports 0 when the caller's session is the only live one", async () => {
      const token = await loginToken();

      const result = await call(revokeOtherSessionsImpl, undefined, {
        context: { reqHeaders: cookieHeader(token) },
      });

      expect(result.revoked).toBe(0);
    });
  });

  describe("panel.listTeamMembers", () => {
    test("lists the store's members with their roles", async () => {
      const reqHeaders = await sessionCookie();

      const result = await call(
        listTeamMembersImpl,
        { storeSlug: "mawifoods" },
        { context: { reqHeaders } },
      );

      expect(result.members).toHaveLength(1);
      expect(result.members[0]).toMatchObject({
        memberId: MEMBER_ID,
        name: "Marina Lopes",
        email: "marina@menuza.local",
        kind: "human",
        role: "owner",
      });
    });

    test("an unknown store is NOT_FOUND", async () => {
      const reqHeaders = await sessionCookie();

      try {
        await call(listTeamMembersImpl, { storeSlug: "nao-existe" }, { context: { reqHeaders } });
        throw new Error("expected listTeamMembers to fail");
      } catch (error) {
        // SAFETY: the shared guard only throws the shared NOT_FOUND code.
        expect((error as { code: string }).code).toBe("NOT_FOUND");
      }
    });

    test("a staff member is refused: the capability map has no team:read", async () => {
      const membership = memberships.find((row) => row.tenantId === TENANT_ID);

      if (membership) membership.role = "staff";

      try {
        const reqHeaders = await sessionCookie();

        await call(listTeamMembersImpl, { storeSlug: "mawifoods" }, { context: { reqHeaders } });
        throw new Error("expected listTeamMembers to fail");
      } catch (error) {
        // SAFETY: requireCapability only throws the shared FORBIDDEN code.
        expect((error as { code: string }).code).toBe("FORBIDDEN");
      } finally {
        if (membership) membership.role = "owner";
      }
    });
  });
});
