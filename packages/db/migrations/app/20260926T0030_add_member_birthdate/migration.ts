#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/082f771a135a33b28fba31b8261800380468ea346017d3ecd102c887e0f4822f/contract';
import endContract from '../../snapshots/082f771a135a33b28fba31b8261800380468ea346017d3ecd102c887e0f4822f/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/cfa84de253ecd9e37a1063e047132df958ed37f3022d8ca43e620c91f7248ab0/contract';
import startContract from '../../snapshots/cfa84de253ecd9e37a1063e047132df958ed37f3022d8ca43e620c91f7248ab0/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Member',
        column: col('birthdate', 'timestamp(3)', {
          codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
