#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/69017dffe52ede997e1041567640fae2e4caa17db3c93b733ebdd1fe852a7fd5/contract';
import startContract from '../../snapshots/69017dffe52ede997e1041567640fae2e4caa17db3c93b733ebdd1fe852a7fd5/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d11fdba84fd02ae50b93a350737f6ae9fb11d23c44b866f8441f8d559aa8ac6c/contract';
import endContract from '../../snapshots/d11fdba84fd02ae50b93a350737f6ae9fb11d23c44b866f8441f8d559aa8ac6c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Coupon',
        column: col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Coupon',
        column: col('endsAt', 'timestamp(3)', {
          codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Coupon',
        column: col('firstPurchaseOnly', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Coupon',
        column: col('maximumDiscountCents', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Coupon',
        column: col('minimumOrderCents', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Coupon',
        column: col('perCustomerLimit', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Coupon',
        column: col('stackable', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Coupon',
        column: col('startsAt', 'timestamp(3)', {
          codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Coupon',
        column: col('usageLimit', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.setDefault({
        schema: 'public',
        table: 'Coupon',
        column: col('status', 'text', {
          default: lit('active'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
