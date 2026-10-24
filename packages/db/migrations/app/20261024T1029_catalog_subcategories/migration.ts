#!/usr/bin/env -S node
import type { Contract as End } from "../../snapshots/9a33a1d6cb743f4cc337a290c49370d830e729a40a917a83220ae5d55f99ee95/contract";
import endContract from "../../snapshots/9a33a1d6cb743f4cc337a290c49370d830e729a40a917a83220ae5d55f99ee95/contract.json" with { type: "json" };
import type { Contract as Start } from "../../snapshots/f690fd048448242c9b88a37955c17a26a8af6ca04250b409d024338114d393c1/contract";
import startContract from "../../snapshots/f690fd048448242c9b88a37955c17a26a8af6ca04250b409d024338114d393c1/contract.json" with { type: "json" };
import {
  Migration,
  MigrationCLI,
  col,
  fn,
  lit,
  primaryKey,
  rawSql,
} from "@prisma/orm-postgres/migration";

/**
 * One `Geral` subcategory per category is where the pre-existing products land:
 * they carried `categoryId` directly, and the subcategory becomes the only
 * grouping a product has. The id is derived from the category so re-running the
 * insert is a no-op.
 */
function createGeneralSubcategories() {
  return rawSql({
    id: "data_migration.create-general-subcategories",
    label: 'Create one "Geral" subcategory per category',
    operationClass: "data",
    target: { id: "postgres" },
    precheck: [
      {
        description: "Check the Subcategory table exists",
        sql: `SELECT to_regclass('"public"."Subcategory"') IS NOT NULL AS ok`,
        params: [],
      },
    ],
    execute: [
      {
        description: 'Insert the "Geral" subcategory of every category',
        sql: `INSERT INTO "public"."Subcategory" ("id", "tenantId", "categoryId", "name", "sortOrder", "active")
SELECT md5('geral:' || "Category"."id"), "Category"."tenantId", "Category"."id", 'Geral', 0, true
FROM "public"."Category"
ON CONFLICT ("id") DO NOTHING`,
        params: [],
      },
    ],
    postcheck: [
      {
        description: 'Verify every category has exactly one "Geral" subcategory',
        sql: `SELECT NOT EXISTS (
  SELECT 1
  FROM "public"."Category" AS c
  WHERE (
    SELECT count(*)
    FROM "public"."Subcategory" AS s
    WHERE s."categoryId" = c."id" AND s."name" = 'Geral'
  ) <> 1
) AS ok`,
        params: [],
      },
    ],
  });
}

/**
 * The old `Product.categoryId` maps 1:1 onto that category's `Geral`
 * subcategory. Runs before the column is dropped.
 */
function backfillProductSubcategories() {
  return rawSql({
    id: "data_migration.backfill-product-subcategories",
    label: 'Backfill "Product"."subcategoryId" from "Product"."categoryId"',
    operationClass: "data",
    target: { id: "postgres" },
    precheck: [
      {
        description: "Check the Subcategory table exists",
        sql: `SELECT to_regclass('"public"."Subcategory"') IS NOT NULL AS ok`,
        params: [],
      },
    ],
    execute: [
      {
        description: 'Point every product at its category\'s "Geral" subcategory',
        sql: `UPDATE "public"."Product" AS p
SET "subcategoryId" = s."id"
FROM "public"."Subcategory" AS s
WHERE s."categoryId" = p."categoryId" AND s."name" = 'Geral'`,
        params: [],
      },
    ],
    postcheck: [
      {
        description: "Verify no categorized product is left without a subcategory",
        sql: `SELECT NOT EXISTS (
  SELECT 1
  FROM "public"."Product"
  WHERE "categoryId" IS NOT NULL AND "subcategoryId" IS NULL
) AS ok`,
        params: [],
      },
    ],
  });
}

/**
 * Categories used to reach departments only through products. The links are
 * inferred from the products that carried both ids; a category never paired
 * with a department starts unlinked (documented limitation).
 */
function inferCategoryDepartments() {
  return rawSql({
    id: "data_migration.infer-category-departments",
    label: 'Infer "CategoryDepartment" links from products',
    operationClass: "data",
    target: { id: "postgres" },
    precheck: [
      {
        description: "Check the CategoryDepartment table exists",
        sql: `SELECT to_regclass('"public"."CategoryDepartment"') IS NOT NULL AS ok`,
        params: [],
      },
    ],
    execute: [
      {
        description: "Insert the category/department pairs the products imply",
        sql: `INSERT INTO "public"."CategoryDepartment" ("categoryId", "departmentId")
SELECT DISTINCT p."categoryId", p."departmentId"
FROM "public"."Product" AS p
WHERE p."categoryId" IS NOT NULL AND p."departmentId" IS NOT NULL
ON CONFLICT ("categoryId", "departmentId") DO NOTHING`,
        params: [],
      },
    ],
    postcheck: [
      {
        description: "Verify every paired product has its category/department link",
        sql: `SELECT NOT EXISTS (
  SELECT 1
  FROM "public"."Product" AS p
  WHERE p."categoryId" IS NOT NULL
    AND p."departmentId" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "public"."CategoryDepartment" AS cd
      WHERE cd."categoryId" = p."categoryId" AND cd."departmentId" = p."departmentId"
    )
) AS ok`,
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
      this.dropConstraint({
        schema: "public",
        table: "Product",
        constraint: "Product_categoryId_fkey",
        kind: "foreignKey",
      }),
      this.dropConstraint({
        schema: "public",
        table: "Product",
        constraint: "Product_departmentId_fkey",
        kind: "foreignKey",
      }),
      this.dropIndex({ schema: "public", table: "Product", index: "Product_categoryId_idx" }),
      this.createTable({
        schema: "public",
        table: "CategoryDepartment",
        columns: [
          col("categoryId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("departmentId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
        ],
        constraints: [
          primaryKey(["categoryId", "departmentId"], { name: "CategoryDepartment_pkey" }),
        ],
      }),
      this.createTable({
        schema: "public",
        table: "Subcategory",
        columns: [
          col("active", "bool", {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: "pg/bool@1" },
          }),
          col("categoryId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("id", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("name", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("sortOrder", "int4", {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: "pg/int4@1" },
          }),
          col("tenantId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("updatedAt", "timestamp(3)", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(["id"], { name: "Subcategory_pkey" })],
      }),
      this.addColumn({
        schema: "public",
        table: "Category",
        column: col("active", "bool", {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: "pg/bool@1" },
        }),
      }),
      this.addColumn({
        schema: "public",
        table: "Category",
        column: col("updatedAt", "timestamp(3)", {
          notNull: true,
          default: fn("now()"),
          codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
        }),
      }),
      this.addColumn({
        schema: "public",
        table: "Department",
        column: col("updatedAt", "timestamp(3)", {
          notNull: true,
          default: fn("now()"),
          codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
        }),
      }),
      this.addColumn({
        schema: "public",
        table: "Product",
        column: col("subcategoryId", "text", { codecRef: { codecId: "pg/text@1" } }),
      }),
      this.addColumn({
        schema: "public",
        table: "Product",
        column: col("updatedAt", "timestamp(3)", {
          notNull: true,
          default: fn("now()"),
          codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
        }),
      }),
      this.addColumn({
        schema: "public",
        table: "Tag",
        column: col("updatedAt", "timestamp(3)", {
          notNull: true,
          default: fn("now()"),
          codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
        }),
      }),
      this.addUnique({
        schema: "public",
        table: "Subcategory",
        constraint: "Subcategory_categoryId_name_key",
        columns: ["categoryId", "name"],
      }),
      this.createIndex({
        schema: "public",
        table: "CategoryDepartment",
        index: "CategoryDepartment_categoryId_idx_15c304f2",
        columns: ["categoryId"],
      }),
      this.createIndex({
        schema: "public",
        table: "CategoryDepartment",
        index: "CategoryDepartment_departmentId_idx",
        columns: ["departmentId"],
      }),
      this.createIndex({
        schema: "public",
        table: "Product",
        index: "Product_subcategoryId_idx",
        columns: ["subcategoryId"],
      }),
      this.createIndex({
        schema: "public",
        table: "Subcategory",
        index: "Subcategory_categoryId_idx",
        columns: ["categoryId"],
      }),
      this.createIndex({
        schema: "public",
        table: "Subcategory",
        index: "Subcategory_tenantId_idx",
        columns: ["tenantId"],
      }),
      this.addForeignKey({
        schema: "public",
        table: "CategoryDepartment",
        foreignKey: {
          name: "CategoryDepartment_categoryId_fkey",
          columns: ["categoryId"],
          references: { schema: "public", table: "Category", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "CategoryDepartment",
        foreignKey: {
          name: "CategoryDepartment_departmentId_fkey",
          columns: ["departmentId"],
          references: { schema: "public", table: "Department", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "Subcategory",
        foreignKey: {
          name: "Subcategory_tenantId_fkey",
          columns: ["tenantId"],
          references: { schema: "public", table: "Tenant", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "Subcategory",
        foreignKey: {
          name: "Subcategory_categoryId_fkey",
          columns: ["categoryId"],
          references: { schema: "public", table: "Category", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "Product",
        foreignKey: {
          name: "Product_subcategoryId_fkey",
          columns: ["subcategoryId"],
          references: { schema: "public", table: "Subcategory", columns: ["id"] },
          onDelete: "setNull",
          onUpdate: "cascade",
        },
      }),
      createGeneralSubcategories(),
      backfillProductSubcategories(),
      inferCategoryDepartments(),
      this.dropIndex({
        schema: "public",
        table: "Product",
        index: "Product_departmentId_idx_8e261ed8",
      }),
      this.dropColumn({ schema: "public", table: "Product", column: "categoryId" }),
      this.dropColumn({ schema: "public", table: "Product", column: "departmentId" }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
