import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddGoogleAuthToUsers1779300000006 implements MigrationInterface {
  name = 'AddGoogleAuthToUsers1779300000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'google_id',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_users_google_id" ON "users" ("google_id") WHERE "google_id" IS NOT NULL`,
    );

    await queryRunner.query(
      `CREATE TYPE "users_auth_provider_enum" AS ENUM('local', 'google')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "auth_provider" "users_auth_provider_enum" NOT NULL DEFAULT 'local'`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('users', 'IDX_users_google_id');
    await queryRunner.dropColumn('users', 'google_id');
    await queryRunner.dropColumn('users', 'auth_provider');
    await queryRunner.query(`DROP TYPE "users_auth_provider_enum"`);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "password" SET NOT NULL`,
    );
  }
}
