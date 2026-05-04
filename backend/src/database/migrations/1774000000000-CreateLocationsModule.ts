import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLocationsModule1774000000000 implements MigrationInterface {
    name = 'CreateLocationsModule1774000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // === Create cities table ===
        await queryRunner.query(`
            CREATE TABLE "cities" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar(255) NOT NULL,
                "region_code" varchar(50) NOT NULL,
                "country" varchar(2) NOT NULL,
                "created_by_company_id" uuid NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_cities" PRIMARY KEY ("id")
            )
        `);

        // Unique index: one city name per region
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_cities_name_region" ON "cities" ("name", "region_code")
        `);

        // === Create localities table ===
        await queryRunner.query(`
            CREATE TABLE "localities" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar(255) NOT NULL,
                "city_id" uuid NOT NULL,
                "created_by_company_id" uuid NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_localities" PRIMARY KEY ("id"),
                CONSTRAINT "FK_localities_city" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE NO ACTION
            )
        `);

        // Unique index: one locality name per city
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_localities_name_city" ON "localities" ("name", "city_id")
        `);

        // === Alter buildings: area_id → locality_id ===

        // Check if area_id column exists (it may have been renamed already)
        const hasAreaId = await queryRunner.query(
            `SELECT column_name FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'area_id'`,
        );

        if (hasAreaId.length) {
            // Drop the old FK constraint on area_id specifically
            const fkConstraints = await queryRunner.query(
                `SELECT con.conname AS constraint_name
                 FROM pg_constraint con
                 JOIN pg_attribute att ON att.attnum = ANY(con.conkey) AND att.attrelid = con.conrelid
                 WHERE con.conrelid = 'buildings'::regclass
                   AND con.contype = 'f'
                   AND att.attname = 'area_id'`,
            );
            for (const fk of fkConstraints) {
                await queryRunner.query(`ALTER TABLE "buildings" DROP CONSTRAINT "${fk.constraint_name}"`);
            }

            // Rename column
            await queryRunner.query(`ALTER TABLE "buildings" RENAME COLUMN "area_id" TO "locality_id"`);
        }

        // Add FK to localities (if not already present)
        const existingFk = await queryRunner.query(
            `SELECT constraint_name FROM information_schema.table_constraints
             WHERE table_name = 'buildings' AND constraint_type = 'FOREIGN KEY'
             AND constraint_name LIKE '%locality%'`,
        );
        if (!existingFk.length) {
            await queryRunner.query(`
                ALTER TABLE "buildings"
                ADD CONSTRAINT "FK_buildings_locality" FOREIGN KEY ("locality_id") REFERENCES "localities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
            `);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert buildings FK
        await queryRunner.query(`ALTER TABLE "buildings" DROP CONSTRAINT IF EXISTS "FK_buildings_locality"`);
        await queryRunner.query(`ALTER TABLE "buildings" RENAME COLUMN "locality_id" TO "area_id"`);

        // Add back FK to property_areas
        await queryRunner.query(`
            ALTER TABLE "buildings"
            ADD CONSTRAINT "FK_buildings_area" FOREIGN KEY ("area_id") REFERENCES "property_areas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);

        // Drop localities
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_localities_name_city"`);
        await queryRunner.query(`DROP TABLE "localities"`);

        // Drop cities
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cities_name_region"`);
        await queryRunner.query(`DROP TABLE "cities"`);
    }
}
