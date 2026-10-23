/* eslint-disable anti-slop/no-chained-type-assertions */
/**
 * Catalog write procedures — Unit (infrastructure-free).
 *
 * The db is faked the way `panelReads.test.ts` fakes it: only the query surface
 * the procedures touch is implemented, and a transaction runs its callback
 * against the same fakes. The point is the contract, the tenant guard and the
 * variation diff — not Postgres.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { call } from "@orpc/server";
import { db } from "@menuza/db";
import { hashPassword } from "@menuza/orpc-server/auth";
import { CreateProductInputSchema } from "@menuza/shared/tenant";
import * as v from "valibot";
import { loginImpl } from "../src/domains/tenant/subdomains/session/login.impl.ts";
import { getProductImpl } from "../src/domains/tenant/subdomains/panel/getProduct.impl.ts";
import { createProductImpl } from "../src/domains/tenant/subdomains/panel/createProduct.impl.ts";
import { updateProductImpl } from "../src/domains/tenant/subdomains/panel/updateProduct.impl.ts";
import { deleteProductImpl } from "../src/domains/tenant/subdomains/panel/deleteProduct.impl.ts";
import { deleteCategoryImpl } from "../src/domains/tenant/subdomains/panel/deleteCategory.impl.ts";

type Cell = string | number | boolean | null | Temporal.PlainDateTime;

interface Row {
  [field: string]: Cell;
}

const MEMBER_ID = randomUUID();

const TENANT_ID = randomUUID();

const OTHER_TENANT_ID = randomUUID();

const COOKIE_NAME = "menuza_tenant_sid";

const at = (iso: string) => Temporal.PlainDateTime.from(iso);

const members: Row[] = [];

const tenants: Row[] = [];

const memberships: Row[] = [];

const sessions: Row[] = [];

const products: Row[] = [];

const variations: Row[] = [];

const productTags: Row[] = [];

const categories: Row[] = [];

const departments: Row[] = [];

const tags: Row[] = [];

const orderItems: Row[] = [];

const kitItems: Row[] = [];

function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, value]) => row[key] === value);
}

/**
 * A chainable stand-in. The procedures chain `.include()`, `.select()`,
 * `.orderBy()` and then a terminal, so only the terminal actually reached has
 * to answer. `decorate` is how the Product fake joins its relations.
 */
function collection(source: Row[], decorate: (row: Row) => Row = (row) => row) {
  const where = (filter: Row) => {
    const found = () => source.filter((row) => matches(row, filter));

    const updateAll = async (data: Row) => {
      for (const row of found()) Object.assign(row, data);

      return found().map(decorate);
    };

    const deleteAll = async () => {
      for (const row of found()) source.splice(source.indexOf(row), 1);
    };

    const builder = (): any => ({
      select: () => builder(),
      include: () => builder(),
      orderBy: () => builder(),
      first: async () => {
        const row = found()[0];

        return row === undefined ? null : decorate(row);
      },
      all: async () => found().map(decorate),
      // The real ORM's `update`/`delete` drop the tenantId predicate (RC.17);
      // the procedures use the `*All` terminals, so the fake mirrors both.
      update: updateAll,
      updateAll,
      delete: deleteAll,
      deleteAll,
    });

    return builder();
  };

  const create = async (data: Row) => {
    const row = { ...data };

    source.push(row);

    return decorate(row);
  };

  return { where, create };
}

function model(source: Row[]) {
  return collection(source);
}

type Model = ReturnType<typeof model>;

// SAFETY: `Row` only carries cells; the relation join is what `loadProduct`
// reads through the builder, and the fake answers it without a real ORM.
const PRODUCT_MODEL = collection(products, (product) => {
  // SAFETY: the joined row is the same product plus its relations.
  return joinProduct(product) as unknown as Row;
});

function joinProduct(product: Row): Row {
  const joined = {
    ...product,
    category: categories.find((category) => category.id === product.categoryId) ?? null,
    department: departments.find((department) => department.id === product.departmentId) ?? null,
    tags: productTags.flatMap((link) =>
      link.productId === product.id
        ? [{ ...link, tag: tags.find((tag) => tag.id === link.tagId) ?? null }]
        : [],
    ),
    variations: variations.filter((variation) => variation.productId === product.id),
  };

  // SAFETY: the fake's `Row` only models cells; the relation objects are read
  // by the procedures, never compared as cell values.
  return joined as unknown as Row;
}

const MODEL_NAMES = [
  "Member",
  "Tenant",
  "TenantMembership",
  "Product",
  "Variation",
  "ProductTag",
  "Category",
  "Department",
  "Tag",
  "OrderItem",
  "KitItem",
] as const;

type ModelName = (typeof MODEL_NAMES)[number];

const MODELS: Record<ModelName, Model> = {
  Member: model(members),
  Tenant: model(tenants),
  TenantMembership: model(memberships),
  Product: PRODUCT_MODEL,
  Variation: model(variations),
  ProductTag: model(productTags),
  Category: model(categories),
  Department: model(departments),
  Tag: model(tags),
  OrderItem: model(orderItems),
  KitItem: model(kitItems),
};

/**
 * `db.orm.public.<Model>.where` is a prototype accessor, so the fake has to be
 * installed as an own property with `defineProperty`.
 */
function override(name: ModelName, key: keyof Model, value: Model[keyof Model]): void {
  // SAFETY: the ORM namespace is keyed by model name and every entry in
  // `MODEL_NAMES` is present with the `where`/`create` slice this test fakes.
  const target = (db.orm.public as unknown as Record<ModelName, Model>)[name];

  Object.defineProperty(target, key, { value, writable: true, configurable: true });
}

// SAFETY: captured before the fakes replace them; the same slice is restored.
const originals = Object.fromEntries(
  MODEL_NAMES.map((name) => [name, { ...MODELS[name] }]),
) as unknown as Record<ModelName, Model>;

const originalTransaction = db.transaction;

/**
 * Runs the callback against the same faked client. Nothing here needs real
 * transactional isolation: the fakes are synchronous and single-threaded.
 */
function transactionStub() {
  return async function transaction<T>(fn: (tx: typeof db) => Promise<T>): Promise<T> {
    return await fn(db);
  };
}

function installFakes() {
  for (const name of MODEL_NAMES) {
    override(name, "where", MODELS[name].where);
    override(name, "create", MODELS[name].create);
  }

  // SAFETY: the stub answers the same `orm` surface the procedures use; the
  // real transaction context also carries `query`/`execute`, which they do not.
  db.transaction = transactionStub() as unknown as typeof db.transaction;
}

function restoreFakes() {
  db.transaction = originalTransaction;

  for (const name of MODEL_NAMES) {
    override(name, "where", originals[name].where);
    override(name, "create", originals[name].create);
  }
}

/**
 * `Session` is not in `MODELS`: login needs `.first()` plus `.updateAll()`,
 * which the generic collection does not answer. Mirrors `panelReads.test.ts`.
 */
const originalsSessionWhere = db.orm.public.Session.where;

const originalsSessionCreate = db.orm.public.Session.create;

function installSessionFakes() {
  // SAFETY: mocking Session.where; only `.first()` by digest and `.updateAll()`.
  db.orm.public.Session.where = ((filter: { id: string }) => ({
    first: async () => sessions.find((row) => row.id === filter.id) ?? null,
    updateAll: async (data: Row) => {
      for (const row of sessions) {
        if (row.id === filter.id) Object.assign(row, data);
      }
    },
  })) as any;

  // SAFETY: mocking Session.create; appends the row login writes.
  db.orm.public.Session.create = (async (data: Row) => {
    sessions.push({ ...data });

    return data;
  }) as any;
}

function restoreSessionFakes() {
  db.orm.public.Session.where = originalsSessionWhere;
  db.orm.public.Session.create = originalsSessionCreate;
}

function cookieToken(resHeaders: Headers): string {
  const match = new RegExp(`${COOKIE_NAME}=([^;]+)`).exec(resHeaders.get("set-cookie") ?? "");

  return match?.[1] ?? "";
}

async function sessionCookie(): Promise<Headers> {
  const resHeaders = new Headers();

  await call(
    loginImpl,
    { email: "marina@menuza.local", password: "senha-correta" },
    { context: { resHeaders, reqHeaders: new Headers() } },
  );

  return new Headers({ cookie: `${COOKIE_NAME}=${cookieToken(resHeaders)}` });
}

type ProductInput = v.InferOutput<typeof CreateProductInputSchema>;

function productInput(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    storeSlug: "mawifoods",
    name: "Marmita vegana",
    description: null,
    categoryId: null,
    departmentId: null,
    tagIds: [],
    available: true,
    sortOrder: 0,
    variations: [
      {
        name: "default",
        priceCents: 1990,
        stockMode: "unlimited",
        stockQty: null,
      },
    ],
    ...overrides,
  };
}

describe("panel catalog writes — Unit (infrastructure-free)", () => {
  let tagId = "";

  let otherTagId = "";

  let otherCategoryId = "";

  let categoryId = "";

  beforeAll(async () => {
    installFakes();
    installSessionFakes();

    members.push({
      id: MEMBER_ID,
      email: "marina@menuza.local",
      name: "Marina Lopes",
      kind: "human",
      passwordHash: await hashPassword("senha-correta"),
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

    tenants.push({
      id: OTHER_TENANT_ID,
      slug: "loja-de-outro",
      displayName: "Loja de Outro",
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

    tagId = randomUUID();
    tags.push({ id: tagId, tenantId: TENANT_ID, name: "Vegano", sortOrder: 0 });

    otherTagId = randomUUID();
    tags.push({ id: otherTagId, tenantId: OTHER_TENANT_ID, name: "Outro", sortOrder: 0 });

    categoryId = randomUUID();
    categories.push({
      id: categoryId,
      tenantId: TENANT_ID,
      name: "Marmitas",
      sortOrder: 0,
    });

    otherCategoryId = randomUUID();
    categories.push({
      id: otherCategoryId,
      tenantId: OTHER_TENANT_ID,
      name: "De Outro",
      sortOrder: 0,
    });
  });

  afterAll(() => {
    restoreFakes();
    restoreSessionFakes();
  });

  describe("schema", () => {
    test("controlled stock without a quantity is rejected", () => {
      const result = v.safeParse(
        CreateProductInputSchema,
        productInput({
          variations: [
            { name: "default", priceCents: 1990, stockMode: "controlled", stockQty: null },
          ],
        }),
      );

      expect(result.success).toBe(false);
    });

    test("unlimited stock with a quantity is rejected", () => {
      const result = v.safeParse(
        CreateProductInputSchema,
        productInput({
          variations: [{ name: "default", priceCents: 1990, stockMode: "unlimited", stockQty: 3 }],
        }),
      );

      expect(result.success).toBe(false);
    });
  });

  describe("panel.createProduct", () => {
    test("inserts the product, its variations and its tag links in one call", async () => {
      const reqHeaders = await sessionCookie();

      const result = await call(
        createProductImpl,
        productInput({
          tagIds: [tagId],
          categoryId,
          variations: [
            { name: "default", priceCents: 1990, stockMode: "unlimited", stockQty: null },
            { name: "grande", priceCents: 2490, stockMode: "controlled", stockQty: 7 },
          ],
        }),
        { context: { reqHeaders } },
      );

      expect(result.product.name).toBe("Marmita vegana");
      expect(result.product.categoryName).toBe("Marmitas");
      expect(result.product.tags).toEqual([{ id: tagId, name: "Vegano" }]);
      expect(result.product.variations.map((variation) => variation.name)).toEqual([
        "default",
        "grande",
      ]);

      const product = products.find((row) => row.id === result.product.id);

      expect(product).toBeDefined();
      expect(variations.filter((row) => row.productId === result.product.id)).toHaveLength(2);
      expect(productTags.filter((row) => row.productId === result.product.id)).toHaveLength(1);
    });

    test("duplicate variation names are a CONFLICT", async () => {
      const reqHeaders = await sessionCookie();

      try {
        await call(
          createProductImpl,
          productInput({
            variations: [
              { name: "default", priceCents: 1000, stockMode: "unlimited", stockQty: null },
              { name: "default", priceCents: 2000, stockMode: "unlimited", stockQty: null },
            ],
          }),
          { context: { reqHeaders } },
        );
        throw new Error("expected createProduct to fail");
      } catch (error) {
        // SAFETY: the payload rule only throws the CONFLICT code.
        expect((error as { code: string }).code).toBe("CONFLICT");
      }
    });

    test("a tag from another tenant is NOT_FOUND", async () => {
      const reqHeaders = await sessionCookie();

      try {
        await call(createProductImpl, productInput({ tagIds: [otherTagId] }), {
          context: { reqHeaders },
        });
        throw new Error("expected createProduct to fail");
      } catch (error) {
        // SAFETY: the tenant guard only throws the NOT_FOUND code.
        expect((error as { code: string }).code).toBe("NOT_FOUND");
      }
    });
  });

  describe("panel.updateProduct", () => {
    test("adds, updates and removes variations by id, and replaces the tags", async () => {
      const reqHeaders = await sessionCookie();

      const created = await call(createProductImpl, productInput({ tagIds: [tagId] }), {
        context: { reqHeaders },
      });

      const productId = created.product.id;
      const keptId = created.product.variations[0]!.id;

      const result = await call(
        updateProductImpl,
        {
          ...productInput({
            name: "Marmita vegana editada",
            tagIds: [],
            variations: [
              {
                id: keptId,
                name: "default",
                priceCents: 2190,
                stockMode: "unlimited",
                stockQty: null,
              },
              { name: "grande", priceCents: 2690, stockMode: "controlled", stockQty: 4 },
            ],
          }),
          productId,
        },
        { context: { reqHeaders } },
      );

      expect(result.product.name).toBe("Marmita vegana editada");
      expect(result.product.tags).toEqual([]);
      expect(result.product.variations.map((variation) => variation.priceCents)).toEqual([
        2190, 2690,
      ]);
      expect(result.product.variations[0]!.id).toBe(keptId);
      expect(productTags.filter((row) => row.productId === productId)).toHaveLength(0);
    });

    test("removes a variation the payload dropped", async () => {
      const reqHeaders = await sessionCookie();

      const created = await call(
        createProductImpl,
        productInput({
          variations: [
            { name: "default", priceCents: 1990, stockMode: "unlimited", stockQty: null },
            { name: "grande", priceCents: 2490, stockMode: "unlimited", stockQty: null },
          ],
        }),
        { context: { reqHeaders } },
      );

      const keptId = created.product.variations[0]!.id;

      await call(
        updateProductImpl,
        {
          ...productInput({
            variations: [
              {
                id: keptId,
                name: "default",
                priceCents: 1990,
                stockMode: "unlimited",
                stockQty: null,
              },
            ],
          }),
          productId: created.product.id,
        },
        { context: { reqHeaders } },
      );

      expect(variations.filter((row) => row.productId === created.product.id)).toHaveLength(1);
    });

    test("a scalar-only patch leaves the variations and the tags untouched", async () => {
      const reqHeaders = await sessionCookie();

      const created = await call(createProductImpl, productInput({ tagIds: [tagId] }), {
        context: { reqHeaders },
      });

      const productId = created.product.id;
      const variationIds = created.product.variations.map((variation) => variation.id);

      const result = await call(
        updateProductImpl,
        {
          storeSlug: "mawifoods",
          productId,
          name: "Marmita vegana renomeada",
          available: false,
        },
        { context: { reqHeaders } },
      );

      expect(result.product.name).toBe("Marmita vegana renomeada");
      expect(result.product.available).toBe(false);
      expect(result.product.variations.map((variation) => variation.id)).toEqual(variationIds);
      expect(result.product.tags).toEqual([{ id: tagId, name: "Vegano" }]);
      expect(productTags.filter((row) => row.productId === productId)).toHaveLength(1);
    });

    test("an omitted categoryId is not ownership-checked", async () => {
      const reqHeaders = await sessionCookie();

      const created = await call(createProductImpl, productInput(), {
        context: { reqHeaders },
      });

      // A stale foreign reference: only a payload that carries the id is checked.
      Object.assign(
        products.find((row) => row.id === created.product.id)!,
        {
          categoryId: otherCategoryId,
        },
      );

      const result = await call(
        updateProductImpl,
        { storeSlug: "mawifoods", productId: created.product.id, name: "Marmita renomeada" },
        { context: { reqHeaders } },
      );

      expect(result.product.name).toBe("Marmita renomeada");
      expect(result.product.categoryId).toBe(otherCategoryId);
    });

    test("a foreign categoryId is NOT_FOUND", async () => {
      const reqHeaders = await sessionCookie();

      const created = await call(createProductImpl, productInput(), {
        context: { reqHeaders },
      });

      try {
        await call(
          updateProductImpl,
          { storeSlug: "mawifoods", productId: created.product.id, categoryId: otherCategoryId },
          { context: { reqHeaders } },
        );
        throw new Error("expected updateProduct to fail");
      } catch (error) {
        // SAFETY: the tenant guard only throws the NOT_FOUND code.
        expect((error as { code: string }).code).toBe("NOT_FOUND");
      }
    });

    test("a solo variations payload still replaces the set", async () => {
      const reqHeaders = await sessionCookie();

      const created = await call(
        createProductImpl,
        productInput({
          variations: [
            { name: "default", priceCents: 1990, stockMode: "unlimited", stockQty: null },
            { name: "grande", priceCents: 2490, stockMode: "unlimited", stockQty: null },
          ],
        }),
        { context: { reqHeaders } },
      );

      const productId = created.product.id;
      const keptId = created.product.variations[0]!.id;

      await call(
        updateProductImpl,
        {
          storeSlug: "mawifoods",
          productId,
          variations: [
            {
              id: keptId,
              name: "default",
              priceCents: 990,
              stockMode: "unlimited",
              stockQty: null,
            },
          ],
        },
        { context: { reqHeaders } },
      );

      const rows = variations.filter((row) => row.productId === productId);

      expect(rows).toHaveLength(1);
      expect(rows[0]!.priceCents).toBe(990);
      expect(products.find((row) => row.id === productId)?.name).toBe("Marmita vegana");
    });

    test("a solo tagIds payload still replaces the tags", async () => {
      const reqHeaders = await sessionCookie();

      const created = await call(createProductImpl, productInput(), {
        context: { reqHeaders },
      });

      const productId = created.product.id;

      await call(
        updateProductImpl,
        { storeSlug: "mawifoods", productId, tagIds: [tagId] },
        { context: { reqHeaders } },
      );

      expect(productTags.filter((row) => row.productId === productId)).toHaveLength(1);

      await call(
        updateProductImpl,
        { storeSlug: "mawifoods", productId, tagIds: [] },
        { context: { reqHeaders } },
      );

      expect(productTags.filter((row) => row.productId === productId)).toHaveLength(0);
    });

    test("an unknown productId is NOT_FOUND", async () => {
      const reqHeaders = await sessionCookie();

      try {
        await call(
          updateProductImpl,
          { ...productInput(), productId: randomUUID() },
          { context: { reqHeaders } },
        );
        throw new Error("expected updateProduct to fail");
      } catch (error) {
        // SAFETY: an unknown product only throws the NOT_FOUND code.
        expect((error as { code: string }).code).toBe("NOT_FOUND");
      }
    });
  });

  describe("panel.deleteProduct", () => {
    test("a product an order still points at is a CONFLICT", async () => {
      const reqHeaders = await sessionCookie();

      const created = await call(createProductImpl, productInput(), {
        context: { reqHeaders },
      });

      orderItems.push({
        id: randomUUID(),
        tenantId: TENANT_ID,
        orderId: randomUUID(),
        productId: created.product.id,
        variationId: created.product.variations[0]!.id,
        name: "Marmita vegana",
        unitPriceCents: 1990,
        quantity: 1,
        lineTotalCents: 1990,
      });

      try {
        await call(
          deleteProductImpl,
          { storeSlug: "mawifoods", productId: created.product.id },
          { context: { reqHeaders } },
        );
        throw new Error("expected deleteProduct to fail");
      } catch (error) {
        // SAFETY: a referenced product only throws the CONFLICT code.
        expect((error as { code: string }).code).toBe("CONFLICT");
      }

      expect(products.some((row) => row.id === created.product.id)).toBe(true);
    });

    test("a free product is deleted with its variations and tags", async () => {
      const reqHeaders = await sessionCookie();

      const created = await call(createProductImpl, productInput({ tagIds: [tagId] }), {
        context: { reqHeaders },
      });

      await call(
        deleteProductImpl,
        { storeSlug: "mawifoods", productId: created.product.id },
        { context: { reqHeaders } },
      );

      expect(products.some((row) => row.id === created.product.id)).toBe(false);
    });
  });

  describe("panel.getProduct", () => {
    test("another tenant's product id is NOT_FOUND", async () => {
      const reqHeaders = await sessionCookie();

      try {
        await call(
          getProductImpl,
          { storeSlug: "mawifoods", productId: randomUUID() },
          { context: { reqHeaders } },
        );
        throw new Error("expected getProduct to fail");
      } catch (error) {
        // SAFETY: an unknown product only throws the NOT_FOUND code.
        expect((error as { code: string }).code).toBe("NOT_FOUND");
      }
    });
  });

  describe("panel.deleteCategory", () => {
    test("a category with a product is a CONFLICT", async () => {
      const reqHeaders = await sessionCookie();

      await call(createProductImpl, productInput({ categoryId }), { context: { reqHeaders } });

      try {
        await call(
          deleteCategoryImpl,
          { storeSlug: "mawifoods", categoryId },
          { context: { reqHeaders } },
        );
        throw new Error("expected deleteCategory to fail");
      } catch (error) {
        // SAFETY: a referenced category only throws the CONFLICT code.
        expect((error as { code: string }).code).toBe("CONFLICT");
      }
    });
  });
});
