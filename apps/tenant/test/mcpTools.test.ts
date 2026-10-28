/**
 * MCP tool catalog — unit, infrastructure-free.
 *
 * The catalog is a *view* over the panel procedures, so what needs proving is
 * that the view cannot widen what a caller may do: a role only ever sees tools
 * whose capability it holds, and the `storeSlug` argument collapses only when
 * the grant makes the answer unambiguous.
 */
import { describe, expect, test } from "bun:test";
import { TOOLS, toolsFor } from "../src/mcp/tools.ts";

describe("MCP tool catalog", () => {
  test("staff sees only the tools its role can actually call", () => {
    const { tools } = toolsFor({ roles: ["staff"], singleStoreSlug: null });
    const names = tools.map((tool) => tool.name).sort();

    expect(names).toContain("orders_list");
    expect(names).toContain("products_list");

    // `staff` holds neither catalog:write nor seo:write nor team:read.
    expect(names).not.toContain("product_create");
    expect(names).not.toContain("product_update");
    expect(names).not.toContain("product_delete");
    expect(names).not.toContain("coupon_create");
    expect(names).not.toContain("seo_list_entities");
  });

  test("owner sees every tool", () => {
    const { tools } = toolsFor({ roles: ["owner"], singleStoreSlug: null });

    expect(tools).toHaveLength(TOOLS.length);
  });

  test("an unrecognized stored role is treated as staff, never as owner", () => {
    const { tools } = toolsFor({ roles: ["superuser"], singleStoreSlug: null });
    const names = tools.map((tool) => tool.name);

    expect(names).not.toContain("product_create");
    expect(names).toContain("orders_list");
  });

  test("roles from several stores union, so one admin membership lifts the floor", () => {
    const { tools } = toolsFor({
      roles: ["staff", "owner"],
      singleStoreSlug: null,
    });

    const names = tools.map((tool) => tool.name);

    expect(names).toContain("product_create");
  });

  test("no role means no tools at all", () => {
    expect(toolsFor({ roles: [], singleStoreSlug: null }).tools).toEqual([]);
  });

  test("a single-store grant drops storeSlug from the schema and its required list", () => {
    const { tools } = toolsFor({ roles: ["owner"], singleStoreSlug: "loja-a" });
    const orders = tools.find((tool) => tool.name === "orders_list");

    expect(orders).toBeDefined();
    expect(orders?.inputSchema.properties).toBeDefined();
    expect(Object.keys(orders?.inputSchema.properties ?? {})).not.toContain("storeSlug");
    expect(orders?.inputSchema.required ?? []).not.toContain("storeSlug");
  });

  test("a multi-store grant keeps storeSlug required so the caller names the store", () => {
    const { tools } = toolsFor({ roles: ["owner"], singleStoreSlug: null });
    const orders = tools.find((tool) => tool.name === "orders_list");

    expect(Object.keys(orders?.inputSchema.properties ?? {})).toContain("storeSlug");
    expect(orders?.inputSchema.required ?? []).toContain("storeSlug");
  });

  test("every catalog entry delegates to a real panel procedure", () => {
    // A router entry is a lazy procedure object, never a bare function: the
    // delegation goes through `call`, which needs the schema it carries.
    for (const tool of TOOLS) {
      expect(tool.impl).toBeTruthy();
      expect(tool.impl).not.toBeInstanceOf(Function);
    }
  });

  test("tool names are unique, so a call can never be ambiguous", () => {
    const names = TOOLS.map((tool) => tool.name);

    expect(new Set(names).size).toBe(names.length);
  });
});
