import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStoragePurgeJobs1779700000001 implements MigrationInterface {
  name = 'CreateStoragePurgeJobs1779700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "storage_purge_jobs" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "company_id" uuid NOT NULL,
                "bucket_kind" varchar(20) NOT NULL,
                "s3_key" varchar(500) NOT NULL,
                "bytes" bigint NOT NULL DEFAULT 0,
                "source_type" varchar(50),
                "source_id" uuid,
                "status" varchar(20) NOT NULL DEFAULT 'PENDING',
                "attempts" integer NOT NULL DEFAULT 0,
                "last_error" text,
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "processed_at" timestamptz,
                CONSTRAINT "PK_storage_purge_jobs" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_storage_purge_jobs_status_created" ON "storage_purge_jobs" ("status", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_storage_purge_jobs_company" ON "storage_purge_jobs" ("company_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_storage_purge_jobs_company"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_storage_purge_jobs_status_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "storage_purge_jobs"`);
  }
}
