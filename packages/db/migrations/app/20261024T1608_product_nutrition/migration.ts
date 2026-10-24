#!/usr/bin/env -S node
import type { Contract as End } from "../../snapshots/2b04ebf67687759bfd159eb702452803b32f5d6f91411cb3526f49c569411b15/contract";
import endContract from "../../snapshots/2b04ebf67687759bfd159eb702452803b32f5d6f91411cb3526f49c569411b15/contract.json" with { type: "json" };
import type { Contract as Start } from "../../snapshots/9a33a1d6cb743f4cc337a290c49370d830e729a40a917a83220ae5d55f99ee95/contract";
import startContract from "../../snapshots/9a33a1d6cb743f4cc337a290c49370d830e729a40a917a83220ae5d55f99ee95/contract.json" with { type: "json" };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from "@prisma/orm-postgres/migration";

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: "public",
        table: "ProductNutrition",
        columns: [
          col("addedSugarsMg", "int4", { codecRef: { codecId: "pg/int4@1" } }),
          col("basis", "text", {
            notNull: true,
            default: lit("solid"),
            codecRef: { codecId: "pg/text@1" },
          }),
          col("carbsMg", "int4", { codecRef: { codecId: "pg/int4@1" } }),
          col("createdAt", "timestamp(3)", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("energyKcal", "int4", { codecRef: { codecId: "pg/int4@1" } }),
          col("fiberMg", "int4", { codecRef: { codecId: "pg/int4@1" } }),
          col("householdMeasure", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("id", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("labelFormat", "text", {
            notNull: true,
            default: lit("vertical"),
            codecRef: { codecId: "pg/text@1" },
          }),
          col("notes", "text", { codecRef: { codecId: "pg/text@1" } }),
          col("portionMilli", "int4", { codecRef: { codecId: "pg/int4@1" } }),
          col("productId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("proteinMg", "int4", { codecRef: { codecId: "pg/int4@1" } }),
          col("published", "bool", {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: "pg/bool@1" },
          }),
          col("referenceAt", "timestamp(3)", {
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
          col("saturatedFatMg", "int4", { codecRef: { codecId: "pg/int4@1" } }),
          col("servingsPerPack", "int4", { codecRef: { codecId: "pg/int4@1" } }),
          col("showHighAddedSugar", "bool", {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: "pg/bool@1" },
          }),
          col("showHighSatFat", "bool", {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: "pg/bool@1" },
          }),
          col("showHighSodium", "bool", {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: "pg/bool@1" },
          }),
          col("sodiumMg", "int4", { codecRef: { codecId: "pg/int4@1" } }),
          col("source", "text", {
            notNull: true,
            default: lit("manual"),
            codecRef: { codecId: "pg/text@1" },
          }),
          col("tenantId", "text", { notNull: true, codecRef: { codecId: "pg/text@1" } }),
          col("totalFatMg", "int4", { codecRef: { codecId: "pg/int4@1" } }),
          col("totalSugarsMg", "int4", { codecRef: { codecId: "pg/int4@1" } }),
          col("transFatMg", "int4", { codecRef: { codecId: "pg/int4@1" } }),
          col("updatedAt", "timestamp(3)", {
            notNull: true,
            default: fn("now()"),
            codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(["id"], { name: "ProductNutrition_pkey" }),
          checkExpression(
            "ProductNutrition_basis_check_68e7bd4f",
            `"basis" IN ('solid', 'liquid')`,
          ),
          checkExpression(
            "ProductNutrition_labelFormat_check_0c42dc77",
            `"labelFormat" IN ('vertical', 'simplified')`,
          ),
          checkExpression(
            "ProductNutrition_source_check_6cb8808f",
            `"source" IN ('manual', 'lab', 'supplier_label', 'database', 'estimate')`,
          ),
          checkExpression(
            "product_nutrition_added_sugars_lte_total_3f18961d",
            '"addedSugarsMg" IS NULL OR "totalSugarsMg" IS NULL OR "addedSugarsMg" <= "totalSugarsMg"',
          ),
          checkExpression(
            "product_nutrition_added_sugars_non_negative_022bd555",
            '"addedSugarsMg" IS NULL OR "addedSugarsMg" >= 0',
          ),
          checkExpression(
            "product_nutrition_carbs_non_negative_d82b29bb",
            '"carbsMg" IS NULL OR "carbsMg" >= 0',
          ),
          checkExpression(
            "product_nutrition_energy_non_negative_6b58d52b",
            '"energyKcal" IS NULL OR "energyKcal" >= 0',
          ),
          checkExpression(
            "product_nutrition_fat_sum_fd3e689b",
            '"saturatedFatMg" IS NULL OR "transFatMg" IS NULL OR "totalFatMg" IS NULL OR "saturatedFatMg" + "transFatMg" <= "totalFatMg"',
          ),
          checkExpression(
            "product_nutrition_fiber_non_negative_ac7b8695",
            '"fiberMg" IS NULL OR "fiberMg" >= 0',
          ),
          checkExpression(
            "product_nutrition_portion_positive_46e9a389",
            '"portionMilli" IS NULL OR "portionMilli" > 0',
          ),
          checkExpression(
            "product_nutrition_protein_non_negative_b0d9690e",
            '"proteinMg" IS NULL OR "proteinMg" >= 0',
          ),
          checkExpression(
            "product_nutrition_saturated_fat_non_negative_da7b6a18",
            '"saturatedFatMg" IS NULL OR "saturatedFatMg" >= 0',
          ),
          checkExpression(
            "product_nutrition_servings_positive_ab1dd3a8",
            '"servingsPerPack" IS NULL OR "servingsPerPack" > 0',
          ),
          checkExpression(
            "product_nutrition_sodium_non_negative_2c6d9761",
            '"sodiumMg" IS NULL OR "sodiumMg" >= 0',
          ),
          checkExpression(
            "product_nutrition_total_fat_non_negative_402e18d5",
            '"totalFatMg" IS NULL OR "totalFatMg" >= 0',
          ),
          checkExpression(
            "product_nutrition_total_sugars_non_negative_aa52d3a2",
            '"totalSugarsMg" IS NULL OR "totalSugarsMg" >= 0',
          ),
          checkExpression(
            "product_nutrition_trans_fat_non_negative_5ffb64c8",
            '"transFatMg" IS NULL OR "transFatMg" >= 0',
          ),
        ],
      }),
      this.addUnique({
        schema: "public",
        table: "ProductNutrition",
        constraint: "ProductNutrition_productId_key",
        columns: ["productId"],
      }),
      this.createIndex({
        schema: "public",
        table: "ProductNutrition",
        index: "ProductNutrition_tenantId_idx",
        columns: ["tenantId"],
      }),
      this.addForeignKey({
        schema: "public",
        table: "ProductNutrition",
        foreignKey: {
          name: "ProductNutrition_tenantId_fkey",
          columns: ["tenantId"],
          references: { schema: "public", table: "Tenant", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
      this.addForeignKey({
        schema: "public",
        table: "ProductNutrition",
        foreignKey: {
          name: "ProductNutrition_productId_fkey",
          columns: ["productId"],
          references: { schema: "public", table: "Product", columns: ["id"] },
          onDelete: "cascade",
          onUpdate: "cascade",
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
