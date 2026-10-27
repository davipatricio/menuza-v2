#!/usr/bin/env -S node
import type { Contract as End } from "../../snapshots/2eb0ae28c0fd5fd3c1ceae928608fdb791fa42e99167e8492aaa95c5acd5accf/contract";
import endContract from "../../snapshots/2eb0ae28c0fd5fd3c1ceae928608fdb791fa42e99167e8492aaa95c5acd5accf/contract.json" with { type: "json" };
import type { Contract as Start } from "../../snapshots/9039d576d5f2a309079461a67bef5f0afbd964f5894a4a4a10611457e39d5ec4/contract";
import startContract from "../../snapshots/9039d576d5f2a309079461a67bef5f0afbd964f5894a4a4a10611457e39d5ec4/contract.json" with { type: "json" };
import { Migration, MigrationCLI, rawSql, sql } from "@prisma/orm-postgres/migration";

/**
 * `stockMode` and `stockQty` were never tied together, so a variation can
 * carry an unlimited mode with a quantity, or a controlled mode with none.
 * Normalize before the constraint lands: an unlimited variation has no
 * quantity to keep, and a controlled one starts from nothing available.
 */
function normalizeVariationStock() {
  return rawSql({
    id: "data_migration.normalize-variation-stock",
    label: "Tie the variation stock mode to its quantity",
    operationClass: "data",
    target: { id: "postgres" },
    precheck: [
      {
        description: "Check the Variation table exists",
        sql: `SELECT to_regclass('"public"."Variation"') IS NOT NULL AS ok`,
        params: [],
      },
    ],
    execute: [
      {
        description: "Drop the quantity of every unlimited variation",
        sql: `UPDATE "public"."Variation"
SET "stockQty" = NULL
WHERE "stockMode" = 'unlimited' AND "stockQty" IS NOT NULL`,
        params: [],
      },
      {
        description: "Give every controlled variation a quantity",
        sql: `UPDATE "public"."Variation"
SET "stockQty" = 0
WHERE "stockMode" = 'controlled' AND "stockQty" IS NULL`,
        params: [],
      },
    ],
    postcheck: [
      {
        description: "Verify every variation agrees with its stock mode",
        sql: `SELECT NOT EXISTS (
  SELECT 1
  FROM "public"."Variation"
  WHERE ("stockMode" = 'unlimited' AND "stockQty" IS NOT NULL)
     OR ("stockMode" = 'controlled' AND "stockQty" IS NULL)
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
      normalizeVariationStock(),
      this.addCheckConstraint({
        schema: "public",
        table: "Variation",
        constraint: "variation_stock_mode_consistent_e90ad844",
        expression: sql`("stockMode" = 'unlimited' AND "stockQty" IS NULL) OR ("stockMode" = 'controlled' AND "stockQty" IS NOT NULL)`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
