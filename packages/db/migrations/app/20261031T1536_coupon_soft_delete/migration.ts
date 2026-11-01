#!/usr/bin/env -S node
import type { Contract as Start } from "../../snapshots/3bbd1c2d04d6c1aa2cb336f0eb47165160d68754970377336faa9d85e2af1765/contract";
import startContract from "../../snapshots/3bbd1c2d04d6c1aa2cb336f0eb47165160d68754970377336faa9d85e2af1765/contract.json" with { type: "json" };
import type { Contract as End } from "../../snapshots/614b7140b9b6b1df315fb57a9ec5fd9b0b14acf671d89c7eff6fc87343d0f1e4/contract";
import endContract from "../../snapshots/614b7140b9b6b1df315fb57a9ec5fd9b0b14acf671d89c7eff6fc87343d0f1e4/contract.json" with { type: "json" };
import { Migration, MigrationCLI, col } from "@prisma/orm-postgres/migration";

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: "public",
        table: "Coupon",
        column: col("deletedAt", "timestamp(3)", {
          codecRef: { codecId: "pg/timestamp-temporal@1", typeParams: { precision: 3 } },
        }),
      }),
      this.createIndex({
        schema: "public",
        table: "Coupon",
        index: "Coupon_tenantId_deletedAt_idx",
        columns: ["tenantId", "deletedAt"],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
