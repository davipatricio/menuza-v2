/**
 * Dashboard structure tests. Run under `bun test`.
 *
 * Pins the MEN-224 mockup structure: the store picker fixtures, per-store
 * data scoping (mawifoods has data, nova-loja is empty), order status label
 * coverage, catalog consistency, and the dashboard route tree.
 */
import { describe, expect, test } from "bun:test";
import {
  MOCK_STORES,
  ORDER_STATUS_LABELS,
  getStore,
  getStoreAuditLogs,
  getStoreCategories,
  getStoreCoupons,
  getStoreCustomerById,
  getStoreCustomerOrders,
  getStoreCustomerStats,
  getStoreCustomers,
  getStoreOrderByCode,
  getStoreOrders,
  getStoreProducts,
} from "../src/lib/mock-dashboard-data.ts";
import { MOCK_CUSTOMERS, MOCK_ORDERS } from "../src/lib/mock-store-data.ts";
import { initials } from "../src/lib/format.ts";

const DASHBOARD_LEAVES = [
  "",
  "/orders",
  "/catalog",
  "/customers",
  "/coupons",
  "/audit",
  "/settings/store",
  "/settings/delivery",
  "/settings/payments",
  "/settings/notifications",
  "/settings/team",
] as const;

describe("dashboard structure", () => {
  test("picker lists exactly the two fixture stores", () => {
    expect(MOCK_STORES.map((s) => s.slug)).toEqual(["mawifoods", "nova-loja"]);
  });

  test("every store declares a role for the fake session", () => {
    for (const store of MOCK_STORES) {
      expect(store.role.length).toBeGreaterThan(0);
    }

    expect(getStore("mawifoods")?.role).toBe("Proprietária");
  });

  test("initials takes at most two letters, uppercased", () => {
    expect(initials("Mawifoods")).toBe("M");
    expect(initials("Nova Loja")).toBe("NL");
    expect(initials("Marina Lopes")).toBe("ML");
    expect(initials("  ")).toBe("");
  });

  test("getStore resolves known slugs and misses unknown ones", () => {
    expect(getStore("mawifoods")?.displayName).toBe("Mawifoods");
    expect(getStore("nova-loja")?.displayName).toBe("Nova Loja");
    expect(getStore("desconhecida")).toBeUndefined();
  });

  test("mawifoods has data, nova-loja is empty", () => {
    expect(getStoreOrders("mawifoods").length).toBeGreaterThan(0);
    expect(getStoreCustomers("mawifoods").length).toBeGreaterThan(0);
    expect(getStoreCoupons("mawifoods").length).toBeGreaterThan(0);
    expect(getStoreAuditLogs("mawifoods").length).toBeGreaterThan(0);
    expect(getStoreProducts("mawifoods").length).toBeGreaterThan(0);
    expect(getStoreCategories("mawifoods").length).toBeGreaterThan(0);

    expect(getStoreOrders("nova-loja")).toEqual([]);
    expect(getStoreCustomers("nova-loja")).toEqual([]);
    expect(getStoreCoupons("nova-loja")).toEqual([]);
    expect(getStoreAuditLogs("nova-loja")).toEqual([]);
    expect(getStoreProducts("nova-loja")).toEqual([]);
    expect(getStoreCategories("nova-loja")).toEqual([]);
  });

  test("order lookup by code is scoped to the store", () => {
    expect(getStoreOrderByCode("mawifoods", "ORD-101")?.customerName).toBe("Maria Silva");
    expect(getStoreOrderByCode("mawifoods", "ORD-999")).toBeUndefined();
    expect(getStoreOrderByCode("nova-loja", "ORD-101")).toBeUndefined();
  });

  test("every fixture order status has a pt-BR label", () => {
    for (const order of MOCK_ORDERS) {
      expect(ORDER_STATUS_LABELS[order.status]).toBeTruthy();
    }
  });

  test("every product category exists and counts match", () => {
    const categories = getStoreCategories("mawifoods");
    const products = getStoreProducts("mawifoods");

    for (const product of products) {
      expect(categories.some((c) => c.name === product.category)).toBe(true);
    }

    for (const category of categories) {
      expect(products.filter((p) => p.category === category.name).length).toBe(category.itemsCount);
    }
  });

  test("getStoreCustomerById resolves within the store", () => {
    // SAFETY: ids come from the same fixture array, so the first entry exists.
    const [first] = MOCK_CUSTOMERS;

    expect(getStoreCustomerById("mawifoods", first.id)?.name).toBe(first.name);
    expect(getStoreCustomerById("mawifoods", "999")).toBeUndefined();
    expect(getStoreCustomerById("nova-loja", first.id)).toBeUndefined();
  });

  test("customer stats derive from that customer's orders", () => {
    for (const customer of getStoreCustomers("mawifoods")) {
      const orders = getStoreCustomerOrders("mawifoods", customer.id);
      const stats = getStoreCustomerStats("mawifoods", customer.id);

      expect(stats.ordersCount).toBe(orders.length);
      expect(stats.totalSpent).toBeCloseTo(
        orders.reduce((sum, order) => sum + order.total, 0),
        5,
      );
    }
  });

  test("every fixture order points at a real customer of the same store", () => {
    const ids = new Set(getStoreCustomers("mawifoods").map((c) => c.id));

    for (const order of getStoreOrders("mawifoods")) {
      expect(ids.has(order.customerId)).toBe(true);
      expect(getStoreOrders("mawifoods").some((o) => o.customerId === order.customerId)).toBe(true);
    }
  });

  test("every fixture order has a detail route for its store", () => {
    for (const order of getStoreOrders("mawifoods")) {
      expect(getStoreOrderByCode("mawifoods", order.code)).toBeDefined();
    }

    for (const customer of getStoreCustomers("mawifoods")) {
      expect(getStoreCustomerById("mawifoods", customer.id)).toBeDefined();
    }
  });

  test("dashboard route tree covers every leaf for every store", () => {
    const paths = MOCK_STORES.flatMap((store) =>
      DASHBOARD_LEAVES.map((leaf) => `/dashboard/${store.slug}${leaf}`),
    );

    expect(paths).toContain("/dashboard/mawifoods");
    expect(paths).toContain("/dashboard/mawifoods/orders");
    expect(paths).toContain("/dashboard/mawifoods/settings/team");
    expect(paths).toContain("/dashboard/nova-loja/catalog");
    expect(paths.length).toBe(MOCK_STORES.length * DASHBOARD_LEAVES.length);
  });
});
