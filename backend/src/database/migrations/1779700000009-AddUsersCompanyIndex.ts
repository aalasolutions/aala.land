import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsersCompanyIndex1779700000009 implements MigrationInterface {
  name = 'AddUsersCompanyIndex1779700000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_USERS_COMPANY_ID" ON "users" ("company_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_USERS_COMPANY_ID"`);
  }
}
