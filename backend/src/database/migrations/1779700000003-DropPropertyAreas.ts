import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropPropertyAreas1779700000003 implements MigrationInterface {
  name = 'DropPropertyAreas1779700000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "property_areas"`);
  }

  // Restores schema only. Rows dropped by up() are not recoverable.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "property_areas" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying(255) NOT NULL,
                "description" text,
                "company_id" uuid NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "location" varchar(255),
                "region_code" varchar(50) NOT NULL DEFAULT 'dubai',
                CONSTRAINT "PK_87149f58701164f29382b289aa4" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_4d153b6ace7ffa8f60a492c298" ON "property_areas" ("name", "company_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_PROPERTY_AREAS_REGION_CODE" ON "property_areas" ("region_code")`,
    );
    await queryRunner.query(`
            ALTER TABLE "property_areas"
            ADD CONSTRAINT "FK_59357780b6866671c299509aa14"
            FOREIGN KEY ("company_id") REFERENCES "companies"("id")
            ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
  }
}
