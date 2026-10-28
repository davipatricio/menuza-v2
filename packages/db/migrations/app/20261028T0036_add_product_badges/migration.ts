#!/usr/bin/env -S node
import type { Contract as Start } from "../../snapshots/3ffcaaf20c0eb7a87d43415b953d9c4db06db042c13d4c947c0e37f4e44f731b/contract";
import startContract from "../../snapshots/3ffcaaf20c0eb7a87d43415b953d9c4db06db042c13d4c947c0e37f4e44f731b/contract.json" with { type: "json" };
import type { Contract as End } from "../../snapshots/dab0dc9fa8fd2f3066aacb18bab8fdc86501182c1714cb38c2389242d7c8b115/contract";
import endContract from "../../snapshots/dab0dc9fa8fd2f3066aacb18bab8fdc86501182c1714cb38c2389242d7c8b115/contract.json" with { type: "json" };
import {
  Migration,
  MigrationCLI,
  col,
  fn,
  lit,
  primaryKey,
  rawSql,
  sql,
} from "@prisma/orm-postgres/migration";

function guardProductBadgeTenant() {
  return rawSql({
    id: "data_migration.guard-product-badge-tenant",
    label: "Reject a ProductBadge row whose product and badge do not share its tenant",
    operationClass: "data",
    target: { id: "postgres" },
    precheck: [
      {
        description: "Check the ProductBadge table exists",
        sql: `SELECT to_regclass('"public"."ProductBadge"') IS NOT NULL AS ok`,
        params: [],
      },
    ],
    execute: [
      {
        description: "Update the guard function to include ProductBadge",
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
        description: "Drop the product badge guard if it is already there",
        sql: `DROP TRIGGER IF EXISTS "ProductBadge_tenant_matches_parents" ON "public"."ProductBadge"`,
        params: [],
      },
      {
        description: "Guard the product badges",
        sql: `CREATE TRIGGER "ProductBadge_tenant_matches_parents"
BEFORE INSERT OR UPDATE ON "public"."ProductBadge"
FOR EACH ROW EXECUTE FUNCTION "public"."menuza_join_tenant_guard"()`,
        params: [],
      },
    ],
    postcheck: [
      {
        description: "Verify ProductBadge carries the guard",
        sql: `SELECT (
  SELECT count(*) FROM pg_trigger
  WHERE tgname = 'ProductBadge_tenant_matches_parents'
    AND NOT tgisinternal
) = 1 AS ok`,
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
        table: "Badge",
        columns: [
          col("id", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("imageUrl", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("isActive", "bool", {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: "pg/bool@1" },
          }),
          col("name", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("sortOrder", "int4", {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: "pg/int4@1" },
          }),
          col("tenantId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("updatedAt", "timestamp(3)", {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(["id"], { name: "Badge_pkey" })],
      }),
      this.createTable({
        schema: "public",
        table: "ProductBadge",
        columns: [
          col("badgeId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("productId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("tenantId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
        ],
        constraints: [primaryKey(["productId", "badgeId"], { name: "ProductBadge_pkey" })],
      }),
      this.addUnique({
        schema: "public",
        table: "Badge",
        constraint: "Badge_tenantId_name_key",
        columns: ["tenantId", "name"],
      }),
      this.createIndex({
        schema: "public",
        table: "Badge",
        index: "Badge_tenantId_idx",
        columns: ["tenantId"],
      }),
      this.createIndex({
        schema: "public",
        table: "ProductBadge",
        index: "ProductBadge_badgeId_idx",
        columns: ["badgeId"],
      }),
      this.createIndex({
        schema: "public",
        table: "ProductBadge",
        index: "ProductBadge_productId_idx_5858600a",
        columns: ["productId"],
      }),
      this.createIndex({
        schema: "public",
        table: "ProductBadge",
        index: "ProductBadge_tenantId_idx",
        columns: ["tenantId"],
      }),
      this.addForeignKey({
        schema: "public",
        table: "Badge",
        foreignKey: {
          name: "Badge_tenantId_fkey",
          columns: ["tenantId"],
          references: { schema: "public", table: "Tenant", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "ProductBadge",
        foreignKey: {
          name: "ProductBadge_tenantId_fkey",
          columns: ["tenantId"],
          references: { schema: "public", table: "Tenant", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "ProductBadge",
        foreignKey: {
          name: "ProductBadge_productId_fkey",
          columns: ["productId"],
          references: { schema: "public", table: "Product", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "ProductBadge",
        foreignKey: {
          name: "ProductBadge_badgeId_fkey",
          columns: ["badgeId"],
          references: { schema: "public", table: "Badge", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      guardProductBadgeTenant(),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
