#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/21bd2f732eaf95c0a077584b854002d8779f17bc0740e58dad0f16d15b2501ed/contract';
import endContract from '../../snapshots/21bd2f732eaf95c0a077584b854002d8779f17bc0740e58dad0f16d15b2501ed/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/7f4c4b2e2b5c4683663026ea7d80e97cd2c7f64745e648e89ff268c1269fbe88/contract';
import startContract from '../../snapshots/7f4c4b2e2b5c4683663026ea7d80e97cd2c7f64745e648e89ff268c1269fbe88/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'PushPreference',
        columns: [
          col('createdAt', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('event', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('memberId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tenantId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'], { name: 'PushPreference_pkey' })],
      }),
      this.createTable({
        schema: 'public',
        table: 'PushSubscription',
        columns: [
          col('auth', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('endpoint', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('expirationTime', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('memberId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('p256dh', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tenantId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'], { name: 'PushSubscription_pkey' })],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PushPreference',
        index: 'PushPreference_memberId_idx_76b3c263',
        columns: ['memberId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PushPreference',
        index: 'PushPreference_tenantId_idx',
        columns: ['tenantId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PushPreference',
        index: 'PushPreference_tenantId_memberId_event_key',
        columns: ['tenantId', 'memberId', 'event'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'PushSubscription',
        index: 'PushSubscription_endpoint_key',
        columns: ['endpoint'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'PushSubscription',
        index: 'PushSubscription_memberId_idx_76b3c263',
        columns: ['memberId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PushSubscription',
        index: 'PushSubscription_tenantId_idx',
        columns: ['tenantId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PushSubscription',
        index: 'PushSubscription_tenantId_memberId_idx',
        columns: ['tenantId', 'memberId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PushPreference',
        foreignKey: {
          name: 'PushPreference_memberId_fkey',
          columns: ['memberId'],
          references: { schema: 'public', table: 'Member', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PushPreference',
        foreignKey: {
          name: 'PushPreference_tenantId_fkey',
          columns: ['tenantId'],
          references: { schema: 'public', table: 'Tenant', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PushSubscription',
        foreignKey: {
          name: 'PushSubscription_memberId_fkey',
          columns: ['memberId'],
          references: { schema: 'public', table: 'Member', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PushSubscription',
        foreignKey: {
          name: 'PushSubscription_tenantId_fkey',
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
