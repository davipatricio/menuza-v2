#!/usr/bin/env -S node
import type { Contract as End } from "../../snapshots/212ede6a2bcc3594234caed0244334a6b6bb3990349742655ddedf63e9ce64e0/contract";
import endContract from "../../snapshots/212ede6a2bcc3594234caed0244334a6b6bb3990349742655ddedf63e9ce64e0/contract.json" with { type: "json" };
import type { Contract as Start } from "../../snapshots/6df4e3bc494fdd54b25972c4c7ebe2158a749962f90f669f9ff266f7288c9eac/contract";
import startContract from "../../snapshots/6df4e3bc494fdd54b25972c4c7ebe2158a749962f90f669f9ff266f7288c9eac/contract.json" with { type: "json" };
import { Migration, MigrationCLI, col, rawSql } from "@prisma/orm-postgres/migration";

/**
 * The join rows carry their tenant now, so the column lands empty and is
 * filled from the parent rows. A row whose two parents disagree about the
 * tenant cannot be repaired — it is dropped, and the trigger below keeps a new
 * one from ever being written.
 */
function backfillJoinTenants() {
  return rawSql({
    id: "data_migration.backfill-join-tenants",
    label: "Fill the tenant of every join row from its parent",
    operationClass: "data",
    target: { id: "postgres" },
    precheck: [
      {
        description: "Check the join tables exist",
        sql: `SELECT to_regclass('"public"."ProductTag"') IS NOT NULL
   AND to_regclass('"public"."CategoryDepartment"') IS NOT NULL AS ok`,
        params: [],
      },
    ],
    execute: [
      {
        description: "Drop the product tags whose product and tag disagree about the tenant",
        sql: `DELETE FROM "public"."ProductTag" AS pt
USING "public"."Product" AS p, "public"."Tag" AS t
WHERE pt."productId" = p."id" AND pt."tagId" = t."id" AND p."tenantId" <> t."tenantId"`,
        params: [],
      },
      {
        description:
          "Drop the category links whose category and department disagree about the tenant",
        sql: `DELETE FROM "public"."CategoryDepartment" AS cd
USING "public"."Category" AS c, "public"."Department" AS d
WHERE cd."categoryId" = c."id" AND cd."departmentId" = d."id" AND c."tenantId" <> d."tenantId"`,
        params: [],
      },
      {
        description: "Fill the tenant of every product tag from its product",
        sql: `UPDATE "public"."ProductTag" AS pt
SET "tenantId" = p."tenantId"
FROM "public"."Product" AS p
WHERE pt."productId" = p."id" AND pt."tenantId" IS NULL`,
        params: [],
      },
      {
        description: "Fill the tenant of every category link from its category",
        sql: `UPDATE "public"."CategoryDepartment" AS cd
SET "tenantId" = c."tenantId"
FROM "public"."Category" AS c
WHERE cd."categoryId" = c."id" AND cd."tenantId" IS NULL`,
        params: [],
      },
    ],
    postcheck: [
      {
        description: "Verify every join row carries the tenant of its parent",
        sql: `SELECT NOT EXISTS (
  SELECT 1 FROM "public"."ProductTag" AS pt
  JOIN "public"."Product" AS p ON p."id" = pt."productId"
  WHERE pt."tenantId" IS DISTINCT FROM p."tenantId"
) AND NOT EXISTS (
  SELECT 1 FROM "public"."CategoryDepartment" AS cd
  JOIN "public"."Category" AS c ON c."id" = cd."categoryId"
  WHERE cd."tenantId" IS DISTINCT FROM c."tenantId"
) AS ok`,
        params: [],
      },
    ],
  });
}

/**
 * A foreign key says a join row points at a parent; it cannot say the two
 * parents share a tenant. The trigger is what closes that gap, so a join row
 * can never link across the tenant boundary.
 */
function guardJoinTenants() {
  return rawSql({
    id: "data_migration.guard-join-tenants",
    label: "Reject a join row whose parents do not share its tenant",
    operationClass: "data",
    target: { id: "postgres" },
    precheck: [
      {
        description: "Check the join tables exist",
        sql: `SELECT to_regclass('"public"."ProductTag"') IS NOT NULL
   AND to_regclass('"public"."CategoryDepartment"') IS NOT NULL AS ok`,
        params: [],
      },
    ],
    execute: [
      {
        description: "Create the guard the join triggers call",
        sql: `CREATE OR REPLACE FUNCTION "public"."menuza_join_tenant_guard"() RETURNS trigger AS $$
DECLARE
  first_tenant text;
  second_tenant text;
BEGIN
  IF TG_TABLE_NAME = 'ProductTag' THEN
    SELECT "tenantId" INTO first_tenant FROM "public"."Product" WHERE "id" = NEW."productId";
    SELECT "tenantId" INTO second_tenant FROM "public"."Tag" WHERE "id" = NEW."tagId";
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
        description: "Drop the product tag guard if it is already there",
        sql: `DROP TRIGGER IF EXISTS "ProductTag_tenant_matches_parents" ON "public"."ProductTag"`,
        params: [],
      },
      {
        description: "Guard the product tags",
        sql: `CREATE TRIGGER "ProductTag_tenant_matches_parents"
BEFORE INSERT OR UPDATE ON "public"."ProductTag"
FOR EACH ROW EXECUTE FUNCTION "public"."menuza_join_tenant_guard"()`,
        params: [],
      },
      {
        description: "Drop the category link guard if it is already there",
        sql: `DROP TRIGGER IF EXISTS "CategoryDepartment_tenant_matches_parents" ON "public"."CategoryDepartment"`,
        params: [],
      },
      {
        description: "Guard the category links",
        sql: `CREATE TRIGGER "CategoryDepartment_tenant_matches_parents"
BEFORE INSERT OR UPDATE ON "public"."CategoryDepartment"
FOR EACH ROW EXECUTE FUNCTION "public"."menuza_join_tenant_guard"()`,
        params: [],
      },
    ],
    postcheck: [
      {
        description: "Verify both join tables carry the guard",
        sql: `SELECT (
  SELECT count(*) FROM pg_trigger
  WHERE tgname IN ('ProductTag_tenant_matches_parents', 'CategoryDepartment_tenant_matches_parents')
    AND NOT tgisinternal
) = 2 AS ok`,
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
      this.addColumn({
        schema: "public",
        table: "CategoryDepartment",
        column: col("tenantId", "text", { codecRef: { codecId: "pg/text@1" } }),
      }),
      this.addColumn({
        schema: "public",
        table: "ProductTag",
        column: col("tenantId", "text", { codecRef: { codecId: "pg/text@1" } }),
      }),
      backfillJoinTenants(),
      this.setNotNull({ schema: "public", table: "CategoryDepartment", column: "tenantId" }),
      this.setNotNull({ schema: "public", table: "ProductTag", column: "tenantId" }),
      this.createIndex({
        schema: "public",
        table: "CategoryDepartment",
        index: "CategoryDepartment_tenantId_idx",
        columns: ["tenantId"],
      }),
      this.createIndex({
        schema: "public",
        table: "ProductTag",
        index: "ProductTag_tenantId_idx",
        columns: ["tenantId"],
      }),
      this.addForeignKey({
        schema: "public",
        table: "CategoryDepartment",
        foreignKey: {
          name: "CategoryDepartment_tenantId_fkey",
          columns: ["tenantId"],
          references: { schema: "public", table: "Tenant", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "ProductTag",
        foreignKey: {
          name: "ProductTag_tenantId_fkey",
          columns: ["tenantId"],
          references: { schema: "public", table: "Tenant", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      guardJoinTenants(),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
