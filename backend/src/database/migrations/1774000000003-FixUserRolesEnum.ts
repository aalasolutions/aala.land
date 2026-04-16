import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixUserRolesEnum1774000000003 implements MigrationInterface {
    name = 'FixUserRolesEnum1774000000003';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // First, drop the default value on the role column
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);

        // Create a new enum type with the correct values
        await queryRunner.query(`CREATE TYPE "users_role_enum_new" AS ENUM ('super_admin', 'company_admin', 'agent', 'viewer')`);

        // Update the column to use the new enum type
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE "users_role_enum_new" USING (
            CASE
                WHEN "role" = 'admin' THEN 'company_admin'::"users_role_enum_new"
                WHEN "role" = 'agent' THEN 'agent'::"users_role_enum_new"
                ELSE 'agent'::"users_role_enum_new"
            END
        )`);

        // Drop the old enum and rename the new one
        await queryRunner.query(`DROP TYPE "users_role_enum"`);
        await queryRunner.query(`ALTER TYPE "users_role_enum_new" RENAME TO "users_role_enum"`);

        // Set the new default value
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'agent'::"users_role_enum"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop the default value first
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);

        // Recreate the old enum type
        await queryRunner.query(`CREATE TYPE "users_role_enum_old" AS ENUM ('admin', 'agent', 'manager', 'boss')`);

        // Update the column back to old enum type
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE "users_role_enum_old" USING (
            CASE
                WHEN "role" = 'company_admin' THEN 'admin'::"users_role_enum_old"
                WHEN "role" = 'super_admin' THEN 'admin'::"users_role_enum_old"
                WHEN "role" = 'agent' THEN 'agent'::"users_role_enum_old"
                ELSE 'agent'::"users_role_enum_old"
            END
        )`);

        // Drop the new enum and rename the old one
        await queryRunner.query(`DROP TYPE "users_role_enum"`);
        await queryRunner.query(`ALTER TYPE "users_role_enum_old" RENAME TO "users_role_enum"`);

        // Set the old default value
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'agent'::"users_role_enum"`);
    }
}
