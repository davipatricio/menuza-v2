#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/972045a5e4c28e5496ba760ec8cf1e503dc45fa3f2c45c9a5f5f754d93e8fb0a/contract';
import endContract from '../../snapshots/972045a5e4c28e5496ba760ec8cf1e503dc45fa3f2c45c9a5f5f754d93e8fb0a/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'Domain',
        columns: [
          col('createdAt', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('host', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tenantId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'], { name: 'Domain_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'Tenant',
        columns: [
          col('createdAt', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('displayName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('slug', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'], { name: 'Tenant_pkey' })],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Domain',
        index: 'Domain_host_key',
        columns: ['host'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'Domain',
        index: 'Domain_tenantId_idx',
        columns: ['tenantId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Tenant',
        index: 'Tenant_slug_key',
        columns: ['slug'],
        extras: { unique: true },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Domain',
        foreignKey: {
          name: 'Domain_tenantId_fkey',
          columns: ['tenantId'],
          references: { schema: 'public', table: 'Tenant', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
