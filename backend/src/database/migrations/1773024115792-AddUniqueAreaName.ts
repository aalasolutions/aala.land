import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUniqueAreaName1773024115792 implements MigrationInterface {
    name = 'AddUniqueAreaName1773024115792'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_4d153b6ace7ffa8f60a492c298" ON "property_areas" ("name", "company_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_4d153b6ace7ffa8f60a492c298"`);
    }

}
