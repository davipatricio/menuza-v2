#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/972045a5e4c28e5496ba760ec8cf1e503dc45fa3f2c45c9a5f5f754d93e8fb0a/contract';
import startContract from '../../snapshots/972045a5e4c28e5496ba760ec8cf1e503dc45fa3f2c45c9a5f5f754d93e8fb0a/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/7f4c4b2e2b5c4683663026ea7d80e97cd2c7f64745e648e89ff268c1269fbe88/contract';
import endContract from '../../snapshots/7f4c4b2e2b5c4683663026ea7d80e97cd2c7f64745e648e89ff268c1269fbe88/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'Member',
        columns: [
          col('createdAt', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('passwordHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'], { name: 'Member_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'Session',
        columns: [
          col('createdAt', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('expiresAt', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('memberId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('namespace', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('revokedAt', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'], { name: 'Session_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'TenantMembership',
        columns: [
          col('createdAt', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('memberId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('role', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tenantId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'], { name: 'TenantMembership_pkey' })],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Member',
        index: 'Member_email_key',
        columns: ['email'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'Session',
        index: 'Session_expiresAt_idx',
        columns: ['expiresAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Session',
        index: 'Session_memberId_idx',
        columns: ['memberId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TenantMembership',
        index: 'TenantMembership_memberId_idx_76b3c263',
        columns: ['memberId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TenantMembership',
        index: 'TenantMembership_memberId_tenantId_key',
        columns: ['memberId', 'tenantId'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'TenantMembership',
        index: 'TenantMembership_tenantId_idx',
        columns: ['tenantId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Session',
        foreignKey: {
          name: 'Session_memberId_fkey',
          columns: ['memberId'],
          references: { schema: 'public', table: 'Member', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'TenantMembership',
        foreignKey: {
          name: 'TenantMembership_memberId_fkey',
          columns: ['memberId'],
          references: { schema: 'public', table: 'Member', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'TenantMembership',
        foreignKey: {
          name: 'TenantMembership_tenantId_fkey',
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
