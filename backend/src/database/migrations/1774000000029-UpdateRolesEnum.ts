import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateRolesEnum1774000000029 implements MigrationInterface {
  name = 'UpdateRolesEnum1774000000029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'admin'`,
    );
    await queryRunner.query(
      `ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'manager'`,
    );
    await queryRunner.query(
      `ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'accountant'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres cannot remove enum values, so this migration is irreversible
    void queryRunner;
  }
}
