#!/usr/bin/env -S node
import type { Contract as Start } from "../../snapshots/0c390acea790ecb8b9187f9e9eb5f642e864ffda93d3eddf0a92ea8831140f1c/contract";
import startContract from "../../snapshots/0c390acea790ecb8b9187f9e9eb5f642e864ffda93d3eddf0a92ea8831140f1c/contract.json" with { type: "json" };
import type { Contract as End } from "../../snapshots/b951107d1ce0de6a0cee35f0414c7545d68921feaea81f5e6d5db5513da0030f/contract";
import endContract from "../../snapshots/b951107d1ce0de6a0cee35f0414c7545d68921feaea81f5e6d5db5513da0030f/contract.json" with { type: "json" };
import { Migration, MigrationCLI, col, lit } from "@prisma/orm-postgres/migration";

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropColumn({ schema: "public", table: "Department", column: "sortOrder" }),
      this.addColumn({
        schema: "public",
        table: "Department",
        column: col("active", "bool", {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: "pg/bool@1" },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
