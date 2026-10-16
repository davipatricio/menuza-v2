#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/c8f47e416ec3283638ee6fd97f99117ab6c129c45931f90b5f085e3d3c5849d6/contract';
import endContract from '../../snapshots/c8f47e416ec3283638ee6fd97f99117ab6c129c45931f90b5f085e3d3c5849d6/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/d11fdba84fd02ae50b93a350737f6ae9fb11d23c44b866f8441f8d559aa8ac6c/contract';
import startContract from '../../snapshots/d11fdba84fd02ae50b93a350737f6ae9fb11d23c44b866f8441f8d559aa8ac6c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Coupon',
        column: col('shippingDiscountPercent', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
