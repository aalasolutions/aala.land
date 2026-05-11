import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeUserCompanyIdNullable1774000000031 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "company_id" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "company_id" SET NOT NULL`);
    }
}
