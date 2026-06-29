import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateListingsTable1779300000001 implements MigrationInterface {
  name = 'CreateListingsTable1779300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."listings_type_enum" AS ENUM('RENT', 'SALE')`);
    await queryRunner.query(`CREATE TYPE "public"."listings_status_enum" AS ENUM('DRAFT', 'ACTIVE', 'PAUSED', 'CLOSED')`);
    await queryRunner.query(`
      CREATE TABLE "listings" (
        "id"               uuid           NOT NULL DEFAULT uuid_generate_v4(),
        "unit_id"          uuid           NOT NULL,
        "company_id"       uuid           NOT NULL,
        "title"            varchar(255)   NOT NULL,
        "description"      text,
        "price"            numeric(12,2)  NOT NULL,
        "type"             "public"."listings_type_enum" NOT NULL DEFAULT 'RENT',
        "status"           "public"."listings_status_enum" NOT NULL DEFAULT 'DRAFT',
        "photos"           jsonb          NOT NULL DEFAULT '[]',
        "contact_phone"    varchar(20),
        "contact_email"    varchar(255),
        "featured"         boolean        NOT NULL DEFAULT false,
        "views_count"      integer        NOT NULL DEFAULT 0,
        "inquiries_count"  integer        NOT NULL DEFAULT 0,
        "published_at"     TIMESTAMPTZ,
        "created_at"       TIMESTAMP      NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP      NOT NULL DEFAULT now(),
        CONSTRAINT "PK_listings" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "listings"
        ADD CONSTRAINT "FK_listings_unit"
        FOREIGN KEY ("unit_id") REFERENCES "units"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "listings"
        ADD CONSTRAINT "FK_listings_company"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "listings" DROP CONSTRAINT "FK_listings_company"`);
    await queryRunner.query(`ALTER TABLE "listings" DROP CONSTRAINT "FK_listings_unit"`);
    await queryRunner.query(`DROP TABLE "listings"`);
    await queryRunner.query(`DROP TYPE "public"."listings_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."listings_type_enum"`);
  }
}
