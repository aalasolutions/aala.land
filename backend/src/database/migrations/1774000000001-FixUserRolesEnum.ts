import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixUserRolesEnum1774000000001 implements MigrationInterface {
    name = 'FixUserRolesEnum1774000000001';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);

        await queryRunner.query(`CREATE TYPE "users_role_enum_new" AS ENUM ('super_admin', 'company_admin', 'admin', 'manager', 'agent', 'accountant')`);

        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE "users_role_enum_new" USING (
            CASE
                WHEN "role" = 'boss' THEN 'super_admin'::"users_role_enum_new"
                WHEN "role" = 'admin' THEN 'company_admin'::"users_role_enum_new"
                WHEN "role" = 'manager' THEN 'manager'::"users_role_enum_new"
                WHEN "role" = 'agent' THEN 'agent'::"users_role_enum_new"
                ELSE 'agent'::"users_role_enum_new"
            END
        )`);

        await queryRunner.query(`DROP TYPE "users_role_enum"`);
        await queryRunner.query(`ALTER TYPE "users_role_enum_new" RENAME TO "users_role_enum"`);

        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'agent'::"users_role_enum"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);

        await queryRunner.query(`CREATE TYPE "users_role_enum_old" AS ENUM ('admin', 'agent', 'manager', 'boss')`);

        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE "users_role_enum_old" USING (
            CASE
                WHEN "role" = 'company_admin' THEN 'admin'::"users_role_enum_old"
                WHEN "role" = 'super_admin' THEN 'boss'::"users_role_enum_old"
                WHEN "role" = 'manager' THEN 'manager'::"users_role_enum_old"
                WHEN "role" = 'agent' THEN 'agent'::"users_role_enum_old"
                ELSE 'agent'::"users_role_enum_old"
            END
        )`);

        await queryRunner.query(`DROP TYPE "users_role_enum"`);
        await queryRunner.query(`ALTER TYPE "users_role_enum_old" RENAME TO "users_role_enum"`);

        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'agent'::"users_role_enum"`);
    }
}
