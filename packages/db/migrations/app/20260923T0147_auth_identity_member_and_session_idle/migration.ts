#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/188ab8b5f429a4cf96c7769f17da3c34da00b4e5c3bd0ce09e193fec21e02405/contract';
import startContract from '../../snapshots/188ab8b5f429a4cf96c7769f17da3c34da00b4e5c3bd0ce09e193fec21e02405/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/7338f471cf21fc7e681791e61e27ed4e6f93f4d02b810c484156415c6a62a3d1/contract';
import endContract from '../../snapshots/7338f471cf21fc7e681791e61e27ed4e6f93f4d02b810c484156415c6a62a3d1/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'MemberIdentity',
        columns: [
          col('createdAt', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('memberId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('provider', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('providerAccountId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'], { name: 'MemberIdentity_pkey' })],
      }),
      this.addColumn({
        schema: 'public',
        table: 'Member',
        column: col('kind', 'text', {
          notNull: true,
          default: lit('human'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Member',
        column: col('name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Session',
        column: col('lastUsedAt', 'timestamp(3)', {
          notNull: true,
          default: fn('now()'),
          codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
        }),
      }),
      this.dropNotNull({ schema: 'public', table: 'Member', column: 'passwordHash' }),
      this.createIndex({
        schema: 'public',
        table: 'MemberIdentity',
        index: 'MemberIdentity_memberId_idx',
        columns: ['memberId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'MemberIdentity',
        index: 'MemberIdentity_provider_providerAccountId_key',
        columns: ['provider', 'providerAccountId'],
        extras: { unique: true },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'MemberIdentity',
        foreignKey: {
          name: 'MemberIdentity_memberId_fkey',
          columns: ['memberId'],
          references: { schema: 'public', table: 'Member', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
