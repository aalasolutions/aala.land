import { MigrationInterface, QueryRunner } from 'typeorm';

export class CleanLeadEnums1779300000002 implements MigrationInterface {
  name = 'CleanLeadEnums1779300000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- leads_status_enum ---
    await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(`ALTER TYPE "public"."leads_status_enum" RENAME TO "leads_status_enum_old"`);
    await queryRunner.query(`CREATE TYPE "public"."leads_status_enum" AS ENUM('NEW', 'CONTACTED', 'VIEWING', 'NEGOTIATING', 'WON', 'LOST')`);
    await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "status" TYPE "public"."leads_status_enum" USING "status"::text::"public"."leads_status_enum"`);
    await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "status" SET DEFAULT 'NEW'`);
    await queryRunner.query(`DROP TYPE "public"."leads_status_enum_old"`);

    // --- leads_temperature_enum ---
    await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "temperature" DROP DEFAULT`);
    await queryRunner.query(`ALTER TYPE "public"."leads_temperature_enum" RENAME TO "leads_temperature_enum_old"`);
    await queryRunner.query(`CREATE TYPE "public"."leads_temperature_enum" AS ENUM('HOT', 'WARM', 'COLD', 'DEAD')`);
    await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "temperature" TYPE "public"."leads_temperature_enum" USING "temperature"::text::"public"."leads_temperature_enum"`);
    await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "temperature" SET DEFAULT 'WARM'`);
    await queryRunner.query(`DROP TYPE "public"."leads_temperature_enum_old"`);

    // --- leads_source_enum ---
    await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "source" DROP DEFAULT`);
    await queryRunner.query(`ALTER TYPE "public"."leads_source_enum" RENAME TO "leads_source_enum_old"`);
    await queryRunner.query(`CREATE TYPE "public"."leads_source_enum" AS ENUM('WEBSITE', 'WHATSAPP', 'REFERRAL', 'SOCIAL_MEDIA', 'WALK_IN', 'OTHER')`);
    await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "source" TYPE "public"."leads_source_enum" USING "source"::text::"public"."leads_source_enum"`);
    await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "source" SET DEFAULT 'OTHER'`);
    await queryRunner.query(`DROP TYPE "public"."leads_source_enum_old"`);

    // --- lead_activities_type_enum ---
    await queryRunner.query(`ALTER TABLE "lead_activities" ALTER COLUMN "type" DROP DEFAULT`);
    await queryRunner.query(`ALTER TYPE "public"."lead_activities_type_enum" RENAME TO "lead_activities_type_enum_old"`);
    await queryRunner.query(`CREATE TYPE "public"."lead_activities_type_enum" AS ENUM('CALL', 'EMAIL', 'WHATSAPP', 'VIEWING', 'NOTE', 'STATUS_CHANGE', 'ASSIGNMENT')`);
    await queryRunner.query(`ALTER TABLE "lead_activities" ALTER COLUMN "type" TYPE "public"."lead_activities_type_enum" USING "type"::text::"public"."lead_activities_type_enum"`);
    await queryRunner.query(`ALTER TABLE "lead_activities" ALTER COLUMN "type" SET DEFAULT 'NOTE'`);
    await queryRunner.query(`DROP TYPE "public"."lead_activities_type_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore leads_status_enum with both cases
    await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(`ALTER TYPE "public"."leads_status_enum" RENAME TO "leads_status_enum_clean"`);
    await queryRunner.query(`CREATE TYPE "public"."leads_status_enum" AS ENUM('new', 'NEW', 'contacted', 'CONTACTED', 'viewing', 'VIEWING', 'negotiating', 'NEGOTIATING', 'won', 'WON', 'lost', 'LOST')`);
    await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "status" TYPE "public"."leads_status_enum" USING "status"::text::"public"."leads_status_enum"`);
    await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "status" SET DEFAULT 'NEW'`);
    await queryRunner.query(`DROP TYPE "public"."leads_status_enum_clean"`);

    // Restore leads_temperature_enum with both cases
    await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "temperature" DROP DEFAULT`);
    await queryRunner.query(`ALTER TYPE "public"."leads_temperature_enum" RENAME TO "leads_temperature_enum_clean"`);
    await queryRunner.query(`CREATE TYPE "public"."leads_temperature_enum" AS ENUM('hot', 'HOT', 'warm', 'WARM', 'cold', 'COLD', 'dead', 'DEAD')`);
    await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "temperature" TYPE "public"."leads_temperature_enum" USING "temperature"::text::"public"."leads_temperature_enum"`);
    await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "temperature" SET DEFAULT 'WARM'`);
    await queryRunner.query(`DROP TYPE "public"."leads_temperature_enum_clean"`);

    // Restore leads_source_enum with both cases
    await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "source" DROP DEFAULT`);
    await queryRunner.query(`ALTER TYPE "public"."leads_source_enum" RENAME TO "leads_source_enum_clean"`);
    await queryRunner.query(`CREATE TYPE "public"."leads_source_enum" AS ENUM('website', 'WEBSITE', 'whatsapp', 'WHATSAPP', 'referral', 'REFERRAL', 'social_media', 'SOCIAL_MEDIA', 'walk_in', 'WALK_IN', 'other', 'OTHER')`);
    await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "source" TYPE "public"."leads_source_enum" USING "source"::text::"public"."leads_source_enum"`);
    await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "source" SET DEFAULT 'OTHER'`);
    await queryRunner.query(`DROP TYPE "public"."leads_source_enum_clean"`);

    // Restore lead_activities_type_enum with both cases
    await queryRunner.query(`ALTER TABLE "lead_activities" ALTER COLUMN "type" DROP DEFAULT`);
    await queryRunner.query(`ALTER TYPE "public"."lead_activities_type_enum" RENAME TO "lead_activities_type_enum_clean"`);
    await queryRunner.query(`CREATE TYPE "public"."lead_activities_type_enum" AS ENUM('call', 'CALL', 'email', 'EMAIL', 'whatsapp', 'WHATSAPP', 'viewing', 'VIEWING', 'note', 'NOTE', 'status_change', 'STATUS_CHANGE', 'assignment', 'ASSIGNMENT')`);
    await queryRunner.query(`ALTER TABLE "lead_activities" ALTER COLUMN "type" TYPE "public"."lead_activities_type_enum" USING "type"::text::"public"."lead_activities_type_enum"`);
    await queryRunner.query(`ALTER TABLE "lead_activities" ALTER COLUMN "type" SET DEFAULT 'NOTE'`);
    await queryRunner.query(`DROP TYPE "public"."lead_activities_type_enum_clean"`);
  }
}
