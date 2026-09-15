import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRecordHistory1779700000000 implements MigrationInterface {
  name = 'CreateRecordHistory1779700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "record_history" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "company_id" uuid,
                "action" varchar(50) NOT NULL,
                "entity_type" varchar(100) NOT NULL,
                "entity_id" uuid NOT NULL,
                "entity_title" varchar(255) NOT NULL,
                "context_title" varchar(255),
                "reason" text,
                "actor_id" uuid,
                "actor_name" varchar(255) NOT NULL,
                "region_code" varchar(50),
                "metadata" jsonb,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_record_history" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_record_history_company_created" ON "record_history" ("company_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_record_history_entity" ON "record_history" ("entity_type", "entity_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_record_history_region_code" ON "record_history" ("region_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_record_history_actor" ON "record_history" ("actor_id")`,
    );
    await queryRunner.query(`
            ALTER TABLE "record_history"
            ADD CONSTRAINT "FK_record_history_company"
            FOREIGN KEY ("company_id") REFERENCES "companies"("id")
            ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "record_history"
            ADD CONSTRAINT "FK_record_history_actor"
            FOREIGN KEY ("actor_id") REFERENCES "users"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "record_history"
            DROP CONSTRAINT IF EXISTS "FK_record_history_actor",
            DROP CONSTRAINT IF EXISTS "FK_record_history_company"
        `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_record_history_actor"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_record_history_region_code"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_record_history_entity"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_record_history_company_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "record_history"`);
  }
}
