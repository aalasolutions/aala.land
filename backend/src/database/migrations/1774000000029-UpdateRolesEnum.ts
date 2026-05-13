import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateRolesEnum1774000000029 implements MigrationInterface {
    name = 'UpdateRolesEnum1774000000029';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'admin'`);
        await queryRunner.query(`ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'manager'`);
        await queryRunner.query(`ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'accountant'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // PostgreSQL does not support removing enum values
        // If this migration needs to be reverted, the app version
        // should be compatible with the 6-value enum.
        void queryRunner;
    }
}
