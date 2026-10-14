#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/6bbac7133ee539ff464a30f04997843b3e51265ed1f3f8863e78f556a1d49d08/contract';
import endContract from '../../snapshots/6bbac7133ee539ff464a30f04997843b3e51265ed1f3f8863e78f556a1d49d08/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/082f771a135a33b28fba31b8261800380468ea346017d3ecd102c887e0f4822f/contract';
import startContract from '../../snapshots/082f771a135a33b28fba31b8261800380468ea346017d3ecd102c887e0f4822f/contract.json' with { type: 'json' };
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
