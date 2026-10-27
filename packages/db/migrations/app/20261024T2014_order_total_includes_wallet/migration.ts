#!/usr/bin/env -S node
import type { Contract as End } from "../../snapshots/9039d576d5f2a309079461a67bef5f0afbd964f5894a4a4a10611457e39d5ec4/contract";
import endContract from "../../snapshots/9039d576d5f2a309079461a67bef5f0afbd964f5894a4a4a10611457e39d5ec4/contract.json" with { type: "json" };
import type { Contract as Start } from "../../snapshots/ee24d44f3b093457e1ae043dcb9af5c93388a16f2b44e34eb8c200a97bdf4d89/contract";
import startContract from "../../snapshots/ee24d44f3b093457e1ae043dcb9af5c93388a16f2b44e34eb8c200a97bdf4d89/contract.json" with { type: "json" };
import { Migration, MigrationCLI, rawSql, sql } from "@prisma/orm-postgres/migration";

/**
 * The old identity left the wallet out of the total, so an order that applied
 * wallet credit carries a total one credit too high. Recompute the total from
 * the columns the identity is built on, so the corrected constraint has rows
 * to validate.
 */
function recomputeOrderTotals() {
  return rawSql({
    id: "data_migration.recompute-order-totals",
    label: "Recompute the order totals that left the wallet out",
    operationClass: "data",
    target: { id: "postgres" },
    precheck: [
      {
        description: "Check the Order table exists",
        sql: `SELECT to_regclass('"public"."Order"') IS NOT NULL AS ok`,
        params: [],
      },
    ],
    execute: [
      {
        description: "Recompute every order total that breaks the money identity",
        sql: `UPDATE "public"."Order"
SET "totalCents" = "subtotalCents" - "discountCents" + "shippingCents" - "walletAppliedCents"
WHERE "totalCents" <> "subtotalCents" - "discountCents" + "shippingCents" - "walletAppliedCents"`,
        params: [],
      },
    ],
    postcheck: [
      {
        description: "Verify every order total matches the money identity",
        sql: `SELECT NOT EXISTS (
  SELECT 1
  FROM "public"."Order"
  WHERE "totalCents" <> "subtotalCents" - "discountCents" + "shippingCents" - "walletAppliedCents"
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
      this.dropCheckConstraint({
        schema: "public",
        table: "Order",
        constraint: "order_total_matches_lines_fb0005a4",
      }),
      recomputeOrderTotals(),
      this.addCheckConstraint({
        schema: "public",
        table: "Order",
        constraint: "order_total_matches_lines_570dca53",
        expression: sql`"totalCents" = "subtotalCents" - "discountCents" + "shippingCents" - "walletAppliedCents"`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
