/* eslint-disable anti-slop/no-chained-type-assertions */
/**
 * Panel payment-gateway procedures — Unit (infrastructure-free).
 *
 * What these pin down is the part a UI cannot enforce: the provider secret goes
 * in and never comes back, an integration id from another store is a plain
 * NOT_FOUND, the provider of an existing integration cannot be swapped, and a
 * staff member may read the configuration but not write it.
 *
 * The db is faked the way `panelReads.test.ts` fakes it: plain arrays behind
 * the model accessors. No Postgres.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { call, ORPCError } from "@orpc/server";
import { db } from "@menuza/db";
import { decryptSecret } from "@menuza/orpc-server/crypto";
import { hashSessionToken } from "@menuza/orpc-server/auth";
import { getPaymentSettingsImpl } from "../src/domains/tenant/subdomains/panel/getPaymentSettings.impl.ts";
import { savePaymentIntegrationImpl } from "../src/domains/tenant/subdomains/panel/savePaymentIntegration.impl.ts";
import { deletePaymentIntegrationImpl } from "../src/domains/tenant/subdomains/panel/deletePaymentIntegration.impl.ts";
import { savePaymentMethodAssignmentImpl } from "../src/domains/tenant/subdomains/panel/savePaymentMethodAssignment.impl.ts";

const at = (iso: string) => Temporal.PlainDateTime.from(iso);

const MEMBER_ID = randomUUID();

const TENANT_ID = randomUUID();

const OTHER_TENANT_ID = randomUUID();

const OTHER_INTEGRATION_ID = randomUUID();

const SESSION_TOKEN = randomUUID();

const STORE_SLUG = "sabor-local";

interface Row {
  [field: string]: string | number | boolean | null | Temporal.PlainDateTime;
}

const tenants: Row[] = [];

const memberships: Row[] = [];

const sessions: Row[] = [];

const integrations: Row[] = [];

const assignments: Row[] = [];

function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, value]) => row[key] === value);
}

function builder(source: Row[], filter: Row) {
  const found = () => source.filter((row) => matches(row, filter));

  return {
    orderBy: () => builder(source, filter),
    all: async () => found(),
    first: async () => found()[0] ?? null,
    updateAll: async (data: Row) => {
      for (const row of found()) Object.assign(row, data);
    },
    deleteAll: async () => {
      const removed = new Set(found());

      const kept = source.filter((row) => !removed.has(row));

      source.splice(0, source.length, ...kept);
    },
  };
}

interface UpsertArgs {
  create: Row;
  update: Row;
  conflictOn: Row;
}

type Model = {
  where: (filter: Row) => ReturnType<typeof builder>;
  create: (data: Row) => Promise<Row>;
  upsert: (args: UpsertArgs) => Promise<Row>;
};

const MODEL_NAMES = [
  "Tenant",
  "TenantMembership",
  "Session",
  "PaymentIntegration",
  "PaymentMethodAssignment",
] as const;

type ModelName = (typeof MODEL_NAMES)[number];

const SOURCES: Record<ModelName, Row[]> = {
  Tenant: tenants,
  TenantMembership: memberships,
  Session: sessions,
  PaymentIntegration: integrations,
  PaymentMethodAssignment: assignments,
};

function override(name: ModelName, key: keyof Model, value: Model[keyof Model]): void {
  // SAFETY: the ORM namespace is keyed by model name, so every entry in
  // `MODEL_NAMES` is present and shaped like `Model` — the slice each fake implements.
  const target = (db.orm.public as unknown as Record<ModelName, Model>)[name];

  Object.defineProperty(target, key, { value, writable: true, configurable: true });
}

// SAFETY: captured before the fakes replace them; the same slice is restored.
const originals = Object.fromEntries(
  MODEL_NAMES.map((name) => [
    name,
    // SAFETY: same namespace fact as `override`.
    { ...((db.orm.public as unknown as Record<ModelName, Model>)[name] as unknown as object) },
  ]),
) as Record<ModelName, Model>;

function installFakes() {
  for (const name of MODEL_NAMES) {
    const source = SOURCES[name];

    override(name, "where", (filter: Row) => builder(source, filter));

    override(name, "create", async (data: Row) => {
      source.push(data);

      return data;
    });

    override(name, "upsert", async (args: UpsertArgs) => {
      const existing = source.find((row) => matches(row, args.conflictOn));

      if (existing) {
        Object.assign(existing, args.update);

        return existing;
      }

      source.push(args.create);

      return args.create;
    });
  }
}

function restoreFakes() {
  for (const name of MODEL_NAMES) {
    override(name, "where", originals[name].where);
    override(name, "create", originals[name].create);
    override(name, "upsert", originals[name].upsert);
  }
}

function seedTenant(id = TENANT_ID, slug = STORE_SLUG) {
  tenants.push({
    id,
    slug,
    displayName: "Sabor Local",
    createdAt: at("2026-10-01 00:00"),
    updatedAt: at("2026-10-01 00:00"),
  });
}

function seedMembership(role = "owner") {
  memberships.push({
    id: randomUUID(),
    memberId: MEMBER_ID,
    tenantId: TENANT_ID,
    role,
    createdAt: at("2026-10-01 00:00"),
  });
}

function seedSession() {
  sessions.push({
    id: hashSessionToken(SESSION_TOKEN),
    memberId: MEMBER_ID,
    namespace: "tenant",
    expiresAt: at("2999-01-01 00:00"),
    revokedAt: null,
    createdAt: at("2026-10-01 00:00"),
    lastUsedAt: Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime(),
  });
}

function headers(): Headers {
  return new Headers({ cookie: `menuza_tenant_sid=${SESSION_TOKEN}` });
}

function seedIntegration(overrides: Row = {}) {
  const row = {
    id: randomUUID(),
    tenantId: TENANT_ID,
    provider: "pagarme",
    label: "Pagar.me",
    status: "active",
    credentials: null,
    webhookToken: randomUUID().replace(/-/g, ""),
    createdAt: at("2026-10-01 00:00"),
    updatedAt: at("2026-10-01 00:00"),
    ...overrides,
  };

  integrations.push(row);

  return row;
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
    expect.unreachable();
  } catch (error) {
    expect(error).toBeInstanceOf(ORPCError);
    // SAFETY: `instanceof` above proves the shape; the cast only narrows `code`.
    expect((error as ORPCError<string, unknown>).code).toBe(code);
  }
}

beforeAll(() => {
  process.env.INTEGRATION_SECRET_KEY = Buffer.alloc(32, 5).toString("base64url");

  installFakes();
});

afterAll(restoreFakes);

beforeEach(() => {
  for (const source of Object.values(SOURCES)) source.length = 0;

  installFakes();

  seedTenant();
  seedMembership();
  seedSession();
});

describe("panel.getPaymentSettings", () => {
  test("lists the integrations and never a secret", async () => {
    const integration = seedIntegration();

    const result = await call(
      getPaymentSettingsImpl,
      { storeSlug: STORE_SLUG },
      { context: { reqHeaders: headers() } },
    );

    expect(result.integrations).toHaveLength(1);
    expect(result.integrations[0]?.id).toBe(integration.id);
    expect(result.integrations[0]?.hasCredentials).toBe(false);
    expect(result.integrations[0]?.webhookPath).toBe(
      `/webhooks/pagarme/${integration.webhookToken}`,
    );

    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("credentials");
    expect(serialized).not.toContain("webhookToken");
  });

  test("a non-member sees nothing", async () => {
    tenants.push({
      id: OTHER_TENANT_ID,
      slug: "outra-loja",
      displayName: "Outra",
      createdAt: at("2026-10-01 00:00"),
      updatedAt: at("2026-10-01 00:00"),
    });

    await expectCode(
      call(
        getPaymentSettingsImpl,
        { storeSlug: "outra-loja" },
        { context: { reqHeaders: headers() } },
      ),
      "NOT_FOUND",
    );
  });
});

describe("panel.savePaymentIntegration", () => {
  test("creates an online integration and stores only ciphertext", async () => {
    const result = await call(
      savePaymentIntegrationImpl,
      {
        storeSlug: STORE_SLUG,
        provider: "pagarme",
        label: "Pagar.me principal",
        secretKey: "sk_test_123",
      },
      { context: { reqHeaders: headers() } },
    );

    expect(result.integration.hasCredentials).toBe(true);

    const stored = integrations[0];

    expect(stored?.credentials).not.toBeNull();
    expect(String(stored?.credentials)).not.toContain("sk_test_123");

    const decrypted = decryptSecret(String(stored?.credentials));

    expect(JSON.parse(decrypted)).toEqual({ secretKey: "sk_test_123" });
  });

  test("an offline integration needs no secret", async () => {
    const result = await call(
      savePaymentIntegrationImpl,
      {
        storeSlug: STORE_SLUG,
        provider: "offline",
        label: "Conciliação manual",
      },
      { context: { reqHeaders: headers() } },
    );

    expect(result.integration.hasCredentials).toBe(false);
    expect(integrations[0]?.credentials).toBeNull();
  });

  test("refuses a public key in the secret slot", async () => {
    await expectCode(
      call(
        savePaymentIntegrationImpl,
        {
          storeSlug: STORE_SLUG,
          provider: "pagarme",
          label: "Pagar.me",
          secretKey: "pk_test_123",
        },
        { context: { reqHeaders: headers() } },
      ),
      "VALIDATION_FAILED",
    );

    expect(integrations).toHaveLength(0);
  });

  test("an update without a secret keeps the stored credential", async () => {
    const created = await call(
      savePaymentIntegrationImpl,
      { storeSlug: STORE_SLUG, provider: "pagarme", label: "Antigo", secretKey: "sk_test_123" },
      { context: { reqHeaders: headers() } },
    );

    await call(
      savePaymentIntegrationImpl,
      {
        storeSlug: STORE_SLUG,
        integrationId: created.integration.id,
        provider: "pagarme",
        label: "Novo nome",
      },
      { context: { reqHeaders: headers() } },
    );

    expect(integrations[0]?.label).toBe("Novo nome");
    expect(JSON.parse(decryptSecret(String(integrations[0]?.credentials)))).toEqual({
      secretKey: "sk_test_123",
    });
  });

  test("the provider of an existing integration cannot be swapped", async () => {
    const created = await call(
      savePaymentIntegrationImpl,
      { storeSlug: STORE_SLUG, provider: "pagarme", label: "Pagar.me", secretKey: "sk_test_123" },
      { context: { reqHeaders: headers() } },
    );

    await expectCode(
      call(
        savePaymentIntegrationImpl,
        {
          storeSlug: STORE_SLUG,
          integrationId: created.integration.id,
          provider: "offline",
          label: "Pagar.me",
        },
        { context: { reqHeaders: headers() } },
      ),
      "VALIDATION_FAILED",
    );
  });

  test("staff may not write", async () => {
    memberships.length = 0;
    seedMembership("staff");

    await expectCode(
      call(
        savePaymentIntegrationImpl,
        { storeSlug: STORE_SLUG, provider: "offline", label: "Manual" },
        { context: { reqHeaders: headers() } },
      ),
      "FORBIDDEN",
    );
  });
});

describe("panel.savePaymentMethodAssignment", () => {
  test("points a method at an integration and replaces it on the next save", async () => {
    const first = seedIntegration({ label: "A" });
    const second = seedIntegration({ label: "B" });

    const assigned = await call(
      savePaymentMethodAssignmentImpl,
      { storeSlug: STORE_SLUG, method: "pix", integrationId: first.id },
      { context: { reqHeaders: headers() } },
    );

    expect(assigned.assignments).toEqual([
      { method: "pix", integrationId: first.id, provider: "pagarme", label: "A" },
    ]);

    const replaced = await call(
      savePaymentMethodAssignmentImpl,
      { storeSlug: STORE_SLUG, method: "pix", integrationId: second.id },
      { context: { reqHeaders: headers() } },
    );

    expect(replaced.assignments).toHaveLength(1);
    expect(replaced.assignments[0]?.integrationId).toBe(second.id);
  });

  test("null clears the method", async () => {
    const integration = seedIntegration();

    await call(
      savePaymentMethodAssignmentImpl,
      { storeSlug: STORE_SLUG, method: "boleto", integrationId: integration.id },
      { context: { reqHeaders: headers() } },
    );

    const cleared = await call(
      savePaymentMethodAssignmentImpl,
      { storeSlug: STORE_SLUG, method: "boleto", integrationId: null },
      { context: { reqHeaders: headers() } },
    );

    expect(cleared.assignments).toEqual([]);
    expect(assignments).toHaveLength(0);
  });

  test("another store's integration is not found", async () => {
    integrations.push({
      id: OTHER_INTEGRATION_ID,
      tenantId: OTHER_TENANT_ID,
      provider: "pagarme",
      label: "Alheia",
      status: "active",
      credentials: null,
      webhookToken: randomUUID().replace(/-/g, ""),
      createdAt: at("2026-10-01 00:00"),
      updatedAt: at("2026-10-01 00:00"),
    });

    await expectCode(
      call(
        savePaymentMethodAssignmentImpl,
        { storeSlug: STORE_SLUG, method: "pix", integrationId: OTHER_INTEGRATION_ID },
        { context: { reqHeaders: headers() } },
      ),
      "NOT_FOUND",
    );

    expect(assignments).toHaveLength(0);
  });
});

describe("panel.deletePaymentIntegration", () => {
  test("removes an unused integration", async () => {
    const integration = seedIntegration();

    const result = await call(
      deletePaymentIntegrationImpl,
      { storeSlug: STORE_SLUG, integrationId: integration.id },
      { context: { reqHeaders: headers() } },
    );

    expect(result).toEqual({ deleted: true });
    expect(integrations).toHaveLength(0);
  });

  test("refuses while a method still points at it", async () => {
    const integration = seedIntegration();

    assignments.push({
      id: randomUUID(),
      tenantId: TENANT_ID,
      method: "pix",
      integrationId: integration.id,
      createdAt: at("2026-10-01 00:00"),
      updatedAt: at("2026-10-01 00:00"),
    });

    await expectCode(
      call(
        deletePaymentIntegrationImpl,
        { storeSlug: STORE_SLUG, integrationId: integration.id },
        { context: { reqHeaders: headers() } },
      ),
      "CONFLICT",
    );

    expect(integrations).toHaveLength(1);
  });
});
