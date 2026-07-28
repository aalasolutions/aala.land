import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserSoftDeleteAndReleaseEmail1779500000058 implements MigrationInterface {
  name = 'AddUserSoftDeleteAndReleaseEmail1779500000058';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz`,
    );

    // Partial unique: a deleted row stops reserving its email, so the address
    // is reusable while the row stays for the audit trail.
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_97672ac88f789774dd47f7c8be3"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_email_not_deleted" ON "users" ("email") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Fails if a released email was reissued; clear duplicates before reverting.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_users_email_not_deleted"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email")`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "deleted_at"`,
    );
  }
}
