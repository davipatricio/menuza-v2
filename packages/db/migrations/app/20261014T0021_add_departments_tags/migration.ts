#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/58cb7bbc6bd04d87c315df0ab778be249760abe27976f3aa48748857231eb27f/contract';
import startContract from '../../snapshots/58cb7bbc6bd04d87c315df0ab778be249760abe27976f3aa48748857231eb27f/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/69017dffe52ede997e1041567640fae2e4caa17db3c93b733ebdd1fe852a7fd5/contract';
import endContract from '../../snapshots/69017dffe52ede997e1041567640fae2e4caa17db3c93b733ebdd1fe852a7fd5/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'Department',
        columns: [
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sortOrder', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('tenantId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'], { name: 'Department_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'ProductTag',
        columns: [
          col('productId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tagId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['productId', 'tagId'], { name: 'ProductTag_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'Tag',
        columns: [
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sortOrder', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('tenantId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'], { name: 'Tag_pkey' })],
      }),
      this.addColumn({
        schema: 'public',
        table: 'Product',
        column: col('departmentId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'Department',
        constraint: 'Department_tenantId_name_key',
        columns: ['tenantId', 'name'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Tag',
        constraint: 'Tag_tenantId_name_key',
        columns: ['tenantId', 'name'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Department',
        index: 'Department_tenantId_idx',
        columns: ['tenantId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Product',
        index: 'Product_departmentId_idx_8e261ed8',
        columns: ['departmentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ProductTag',
        index: 'ProductTag_productId_idx_5858600a',
        columns: ['productId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ProductTag',
        index: 'ProductTag_tagId_idx',
        columns: ['tagId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Tag',
        index: 'Tag_tenantId_idx',
        columns: ['tenantId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Department',
        foreignKey: {
          name: 'Department_tenantId_fkey',
          columns: ['tenantId'],
          references: { schema: 'public', table: 'Tenant', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Product',
        foreignKey: {
          name: 'Product_departmentId_fkey',
          columns: ['departmentId'],
          references: { schema: 'public', table: 'Department', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ProductTag',
        foreignKey: {
          name: 'ProductTag_productId_fkey',
          columns: ['productId'],
          references: { schema: 'public', table: 'Product', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ProductTag',
        foreignKey: {
          name: 'ProductTag_tagId_fkey',
          columns: ['tagId'],
          references: { schema: 'public', table: 'Tag', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Tag',
        foreignKey: {
          name: 'Tag_tenantId_fkey',
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
