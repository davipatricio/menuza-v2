#!/usr/bin/env -S node
import type { Contract as Start } from "../../snapshots/2b04ebf67687759bfd159eb702452803b32f5d6f91411cb3526f49c569411b15/contract";
import startContract from "../../snapshots/2b04ebf67687759bfd159eb702452803b32f5d6f91411cb3526f49c569411b15/contract.json" with { type: "json" };
import type { Contract as End } from "../../snapshots/ee24d44f3b093457e1ae043dcb9af5c93388a16f2b44e34eb8c200a97bdf4d89/contract";
import endContract from "../../snapshots/ee24d44f3b093457e1ae043dcb9af5c93388a16f2b44e34eb8c200a97bdf4d89/contract.json" with { type: "json" };
import { Migration, MigrationCLI, col } from "@prisma/orm-postgres/migration";

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: "public",
        table: "Product",
        column: col("imageUrl", "text", { codecRef: { codecId: "pg/text@1" } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
