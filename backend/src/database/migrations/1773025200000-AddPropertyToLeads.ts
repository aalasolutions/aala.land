import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPropertyToLeads1773025200000 implements MigrationInterface {
  name = 'AddPropertyToLeads1773025200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Columns and foreign keys already exist in database
    // This migration file exists to track the schema state
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "leads" DROP CONSTRAINT "FK_46373b1895ac68f99ed78c19ecd"`);
    await queryRunner.query(`ALTER TABLE "leads" DROP CONSTRAINT "FK_944e19e85c2bab99936ed423555"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_46373b1895ac68f99ed78c19ec"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_944e19e85c2bab99936ed42355"`);
    await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN "unit_id"`);
    await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN "property_id"`);
  }
}
