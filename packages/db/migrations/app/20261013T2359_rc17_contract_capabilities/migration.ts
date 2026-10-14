#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/58cb7bbc6bd04d87c315df0ab778be249760abe27976f3aa48748857231eb27f/contract';
import endContract from '../../snapshots/58cb7bbc6bd04d87c315df0ab778be249760abe27976f3aa48748857231eb27f/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/ba1b2b6afacbea32c59c7b45149c0e99d4d36f380a561669c8948f21b0350ea6/contract';
import startContract from '../../snapshots/ba1b2b6afacbea32c59c7b45149c0e99d4d36f380a561669c8948f21b0350ea6/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [];
  }
}

MigrationCLI.run(import.meta.url, M);
