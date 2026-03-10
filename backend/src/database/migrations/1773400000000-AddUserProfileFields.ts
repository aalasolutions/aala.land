import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserProfileFields1773400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`,
    );
    const columns = table.map((row: any) => row.column_name);

    if (!columns.includes('phone')) {
      await queryRunner.query(`ALTER TABLE "users" ADD "phone" varchar(50)`);
    }

    if (!columns.includes('preferred_language')) {
      await queryRunner.query(`ALTER TABLE "users" ADD "preferred_language" varchar(5) NOT NULL DEFAULT 'en'`);
    }

    if (!columns.includes('date_format')) {
      await queryRunner.query(`ALTER TABLE "users" ADD "date_format" varchar(20) NOT NULL DEFAULT 'DD/MM/YYYY'`);
    }

    if (!columns.includes('currency')) {
      await queryRunner.query(`ALTER TABLE "users" ADD "currency" varchar(3) NOT NULL DEFAULT 'AED'`);
    }

    if (!columns.includes('timezone')) {
      await queryRunner.query(`ALTER TABLE "users" ADD "timezone" varchar(50) NOT NULL DEFAULT 'Asia/Dubai'`);
    }

    if (!columns.includes('last_login_at')) {
      await queryRunner.query(`ALTER TABLE "users" ADD "last_login_at" TIMESTAMP`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`,
    );
    const columns = table.map((row: any) => row.column_name);

    if (columns.includes('phone')) {
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "phone"`);
    }
    if (columns.includes('preferred_language')) {
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "preferred_language"`);
    }
    if (columns.includes('date_format')) {
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "date_format"`);
    }
    if (columns.includes('currency')) {
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "currency"`);
    }
    if (columns.includes('timezone')) {
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "timezone"`);
    }
    if (columns.includes('last_login_at')) {
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "last_login_at"`);
    }
  }
}
