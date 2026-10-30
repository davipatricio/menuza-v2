#!/usr/bin/env -S node
import type { Contract as Start } from "../../snapshots/5d2fdbe64aba68f866284af3267cd29a8e673c5693ae8dedf703eae723148303/contract";
import startContract from "../../snapshots/5d2fdbe64aba68f866284af3267cd29a8e673c5693ae8dedf703eae723148303/contract.json" with { type: "json" };
import type { Contract as End } from "../../snapshots/8a05a16c66967f77178a96d3034577cb4b825472cdc005983df5d05b8a910fc8/contract";
import endContract from "../../snapshots/8a05a16c66967f77178a96d3034577cb4b825472cdc005983df5d05b8a910fc8/contract.json" with { type: "json" };
import { Migration, MigrationCLI, col, fn, sql } from "@prisma/orm-postgres/migration";

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropConstraint({
        schema: "public",
        table: "CouponRedemption",
        constraint: "CouponRedemption_couponId_customerId_key",
      }),
      this.addColumn({
        schema: "public",
        table: "CouponRedemption",
        column: col("createdAt", "timestamp(3)", {
          notNull: true,
          default: fn(sql`now()`),
          codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
        }),
      }),
      this.createIndex({
        schema: "public",
        table: "CouponRedemption",
        index: "CouponRedemption_couponId_customerId_idx",
        columns: ["couponId", "customerId"],
      }),
      this.createIndex({
        schema: "public",
        table: "CouponRedemption",
        index: "CouponRedemption_tenantId_createdAt_idx",
        columns: ["tenantId", "createdAt"],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
