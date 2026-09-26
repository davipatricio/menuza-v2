#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/23b3f68b43a45de174b3def4030bdbac6097038f4fff3f4aa38bad0420477a9b/contract';
import endContract from '../../snapshots/23b3f68b43a45de174b3def4030bdbac6097038f4fff3f4aa38bad0420477a9b/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/3480ecc11377ab48c21443851b5cee4b43f454ddf47957fd5c35a778ed24f700/contract';
import startContract from '../../snapshots/3480ecc11377ab48c21443851b5cee4b43f454ddf47957fd5c35a778ed24f700/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'MemberOnboarding',
        columns: [
          col('completedAt', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('createdAt', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('memberId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('persona', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('referral', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('segment', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'], { name: 'MemberOnboarding_pkey' })],
      }),
      this.addUnique({
        schema: 'public',
        table: 'MemberOnboarding',
        constraint: 'MemberOnboarding_memberId_key',
        columns: ['memberId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'MemberOnboarding',
        foreignKey: {
          name: 'MemberOnboarding_memberId_fkey',
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
