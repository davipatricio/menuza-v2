#!/usr/bin/env -S node
import type { Contract as End } from "../../snapshots/3bbd1c2d04d6c1aa2cb336f0eb47165160d68754970377336faa9d85e2af1765/contract";
import endContract from "../../snapshots/3bbd1c2d04d6c1aa2cb336f0eb47165160d68754970377336faa9d85e2af1765/contract.json" with { type: "json" };
import type { Contract as Start } from "../../snapshots/8a05a16c66967f77178a96d3034577cb4b825472cdc005983df5d05b8a910fc8/contract";
import startContract from "../../snapshots/8a05a16c66967f77178a96d3034577cb4b825472cdc005983df5d05b8a910fc8/contract.json" with { type: "json" };
import {
  Migration,
  MigrationCLI,
  col,
  lit,
  primaryKey,
  rawSql,
  sql,
} from "@prisma/orm-postgres/migration";

function guardCouponProductTenant() {
  return rawSql({
    id: "data_migration.guard-coupon-product-tenant",
    label: "Reject a CouponProduct row whose coupon and product do not share its tenant",
    operationClass: "data",
    target: { id: "postgres" },
    precheck: [
      {
        description: "Check the CouponProduct table exists",
        sql: `SELECT to_regclass('"public"."CouponProduct"') IS NOT NULL AS ok`,
        params: [],
      },
    ],
    execute: [
      {
        description: "Update the guard function to include CouponProduct",
        sql: `CREATE OR REPLACE FUNCTION "public"."menuza_join_tenant_guard"() RETURNS trigger AS $$
DECLARE
  first_tenant text;
  second_tenant text;
BEGIN
  IF TG_TABLE_NAME = 'ProductTag' THEN
    SELECT "tenantId" INTO first_tenant FROM "public"."Product" WHERE "id" = NEW."productId";
    SELECT "tenantId" INTO second_tenant FROM "public"."Tag" WHERE "id" = NEW."tagId";
  ELSIF TG_TABLE_NAME = 'ProductBadge' THEN
    SELECT "tenantId" INTO first_tenant FROM "public"."Product" WHERE "id" = NEW."productId";
    SELECT "tenantId" INTO second_tenant FROM "public"."Badge" WHERE "id" = NEW."badgeId";
  ELSIF TG_TABLE_NAME = 'CouponProduct' THEN
    SELECT "tenantId" INTO first_tenant FROM "public"."Coupon" WHERE "id" = NEW."couponId";
    SELECT "tenantId" INTO second_tenant FROM "public"."Product" WHERE "id" = NEW."productId";
  ELSE
    SELECT "tenantId" INTO first_tenant FROM "public"."Category" WHERE "id" = NEW."categoryId";
    SELECT "tenantId" INTO second_tenant FROM "public"."Department" WHERE "id" = NEW."departmentId";
  END IF;

  IF first_tenant IS NULL
     OR second_tenant IS NULL
     OR first_tenant <> NEW."tenantId"
     OR second_tenant <> NEW."tenantId" THEN
    RAISE EXCEPTION '% row tenant % does not match its parents (%) and (%)',
      TG_TABLE_NAME, NEW."tenantId", first_tenant, second_tenant;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql`,
        params: [],
      },
      {
        description: "Drop the coupon product guard if it is already there",
        sql: `DROP TRIGGER IF EXISTS "CouponProduct_tenant_matches_parents" ON "public"."CouponProduct"`,
        params: [],
      },
      {
        description: "Guard the coupon products",
        sql: `CREATE TRIGGER "CouponProduct_tenant_matches_parents"
BEFORE INSERT OR UPDATE ON "public"."CouponProduct"
FOR EACH ROW EXECUTE FUNCTION "public"."menuza_join_tenant_guard"()`,
        params: [],
      },
    ],
    postcheck: [
      {
        description: "Verify CouponProduct carries the guard",
        sql: `SELECT (
  SELECT count(*) FROM pg_trigger
  WHERE tgname = 'CouponProduct_tenant_matches_parents'
    AND NOT tgisinternal
) = 1 AS ok`,
        params: [],
      },
      {
        description: "Verify the guard function handles CouponProduct",
        sql: `SELECT pg_get_functiondef(p.oid) LIKE '%CouponProduct%' AS ok
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'menuza_join_tenant_guard'`,
        params: [],
      },
    ],
  });
}

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: "public",
        table: "CouponProduct",
        columns: [
          col("couponId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("productId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("tenantId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
        ],
        constraints: [primaryKey(["couponId", "productId"], { name: "CouponProduct_pkey" })],
      }),
      this.addColumn({
        schema: "public",
        table: "Coupon",
        column: col("productScopeMode", "text", {
          notNull: true,
          default: lit("include"),
          codecRef: { codecId: "pg/text@1" },
        }),
      }),
      this.addCheckConstraint({
        schema: "public",
        table: "Coupon",
        constraint: "coupon_product_scope_mode_valid_79b7f4e5",
        expression: sql`"productScopeMode" IN ('include', 'exclude')`,
      }),
      this.createIndex({
        schema: "public",
        table: "CouponProduct",
        index: "CouponProduct_couponId_idx_a9dd19dc",
        columns: ["couponId"],
      }),
      this.createIndex({
        schema: "public",
        table: "CouponProduct",
        index: "CouponProduct_productId_idx_5858600a",
        columns: ["productId"],
      }),
      this.createIndex({
        schema: "public",
        table: "CouponProduct",
        index: "CouponProduct_tenantId_idx",
        columns: ["tenantId"],
      }),
      this.createIndex({
        schema: "public",
        table: "CouponProduct",
        index: "CouponProduct_tenantId_productId_idx",
        columns: ["tenantId", "productId"],
      }),
      this.addForeignKey({
        schema: "public",
        table: "CouponProduct",
        foreignKey: {
          name: "CouponProduct_tenantId_fkey",
          columns: ["tenantId"],
          references: { schema: "public", table: "Tenant", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "CouponProduct",
        foreignKey: {
          name: "CouponProduct_couponId_fkey",
          columns: ["couponId"],
          references: { schema: "public", table: "Coupon", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "CouponProduct",
        foreignKey: {
          name: "CouponProduct_productId_fkey",
          columns: ["productId"],
          references: { schema: "public", table: "Product", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      guardCouponProductTenant(),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
