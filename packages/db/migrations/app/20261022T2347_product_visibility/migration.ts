#!/usr/bin/env -S node
import type { Contract as End } from "../../snapshots/0c390acea790ecb8b9187f9e9eb5f642e864ffda93d3eddf0a92ea8831140f1c/contract";
import endContract from "../../snapshots/0c390acea790ecb8b9187f9e9eb5f642e864ffda93d3eddf0a92ea8831140f1c/contract.json" with { type: "json" };
import type { Contract as Start } from "../../snapshots/c37a2f3113252b2174a11c63e51dfcd2a89f861759d025c8777eb2fadd2b8a66/contract";
import startContract from "../../snapshots/c37a2f3113252b2174a11c63e51dfcd2a89f861759d025c8777eb2fadd2b8a66/contract.json" with { type: "json" };
import { Migration, MigrationCLI, col, lit } from "@prisma/orm-postgres/migration";

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: "public",
        table: "Product",
        column: col("archived", "bool", {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: "pg/bool@1" },
        }),
      }),
      this.addColumn({
        schema: "public",
        table: "Product",
        column: col("hidden", "bool", {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: "pg/bool@1" },
        }),
      }),
      this.addColumn({
        schema: "public",
        table: "Product",
        column: col("private", "bool", {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: "pg/bool@1" },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
