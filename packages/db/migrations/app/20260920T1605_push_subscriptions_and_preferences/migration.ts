#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/188ab8b5f429a4cf96c7769f17da3c34da00b4e5c3bd0ce09e193fec21e02405/contract';
import endContract from '../../snapshots/188ab8b5f429a4cf96c7769f17da3c34da00b4e5c3bd0ce09e193fec21e02405/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/cb931e2de65c76223464b6b0f1b4d5b8b33dc2985337aa78d9154e79b17fb4b6/contract';
import startContract from '../../snapshots/cb931e2de65c76223464b6b0f1b4d5b8b33dc2985337aa78d9154e79b17fb4b6/contract.json' with { type: 'json' };
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
