import { MigrationInterface, QueryRunner } from 'typeorm';
import { generateNKeysBetween } from '../../shared/utils/rank.util';

// One rank per kanban board, each ordering the leads that share a column value.
const BOARDS = [
  {
    rank: 'rank',
    column: 'status',
    index: 'IDX_LEADS_COMPANY_STATUS_RANK',
    order: '"position" ASC NULLS FIRST, "created_at" DESC',
  },
  {
    rank: 'temperature_rank',
    column: 'temperature',
    index: 'IDX_LEADS_COMPANY_TEMPERATURE_RANK',
    order: '"created_at" DESC',
  },
  {
    rank: 'agent_rank',
    column: 'assigned_to',
    index: 'IDX_LEADS_COMPANY_AGENT_RANK',
    order: '"created_at" DESC',
  },
];

export class AddLeadRank1779700000021 implements MigrationInterface {
  name = 'AddLeadRank1779700000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const board of BOARDS) {
      await queryRunner.query(
        `ALTER TABLE "leads" ADD COLUMN "${board.rank}" varchar COLLATE "C"`,
      );

      const rows = (await queryRunner.query(
        `SELECT "id", "company_id" || ':' || COALESCE("${board.column}"::text, '') AS "column_key"
         FROM "leads" ORDER BY "company_id", "${board.column}", ${board.order}`,
      )) as { id: string; column_key: string }[];
      const columns = new Map<string, string[]>();
      for (const row of rows) {
        const ids = columns.get(row.column_key) ?? [];
        ids.push(row.id);
        columns.set(row.column_key, ids);
      }
      for (const ids of columns.values()) {
        await queryRunner.query(
          `UPDATE "leads" l SET "${board.rank}" = o."rank"
           FROM unnest($1::uuid[], $2::varchar[]) AS o("id", "rank")
           WHERE l."id" = o."id"`,
          [ids, generateNKeysBetween(null, null, ids.length)],
        );
      }

      await queryRunner.query(
        `ALTER TABLE "leads" ALTER COLUMN "${board.rank}" SET NOT NULL`,
      );
      await queryRunner.query(
        `CREATE INDEX "${board.index}" ON "leads" ("company_id", "${board.column}", "${board.rank}")`,
      );
    }
    await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN "position"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "leads" ADD COLUMN "position" integer`,
    );
    await queryRunner.query(
      `UPDATE "leads" l SET "position" = o."position"
       FROM (
         SELECT "id", ROW_NUMBER() OVER (
           PARTITION BY "company_id", "status" ORDER BY "rank"
         ) - 1 AS "position"
         FROM "leads"
       ) o
       WHERE l."id" = o."id"`,
    );
    for (const board of BOARDS) {
      await queryRunner.query(`DROP INDEX "${board.index}"`);
      await queryRunner.query(
        `ALTER TABLE "leads" DROP COLUMN "${board.rank}"`,
      );
    }
  }
}
