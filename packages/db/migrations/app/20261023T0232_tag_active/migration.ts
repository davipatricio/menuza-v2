#!/usr/bin/env -S node
import type { Contract as Start } from "../../snapshots/b951107d1ce0de6a0cee35f0414c7545d68921feaea81f5e6d5db5513da0030f/contract";
import startContract from "../../snapshots/b951107d1ce0de6a0cee35f0414c7545d68921feaea81f5e6d5db5513da0030f/contract.json" with { type: "json" };
import type { Contract as End } from "../../snapshots/f690fd048448242c9b88a37955c17a26a8af6ca04250b409d024338114d393c1/contract";
import endContract from "../../snapshots/f690fd048448242c9b88a37955c17a26a8af6ca04250b409d024338114d393c1/contract.json" with { type: "json" };
import { Migration, MigrationCLI, col, lit } from "@prisma/orm-postgres/migration";

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropColumn({ schema: "public", table: "Tag", column: "sortOrder" }),
      this.addColumn({
        schema: "public",
        table: "Tag",
        column: col("isActive", "bool", {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: "pg/bool@1" },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
