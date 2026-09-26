#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/3480ecc11377ab48c21443851b5cee4b43f454ddf47957fd5c35a778ed24f700/contract';
import endContract from '../../snapshots/3480ecc11377ab48c21443851b5cee4b43f454ddf47957fd5c35a778ed24f700/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/7338f471cf21fc7e681791e61e27ed4e6f93f4d02b810c484156415c6a62a3d1/contract';
import startContract from '../../snapshots/7338f471cf21fc7e681791e61e27ed4e6f93f4d02b810c484156415c6a62a3d1/contract.json' with { type: 'json' };
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
