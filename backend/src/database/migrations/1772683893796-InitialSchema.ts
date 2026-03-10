import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1772683893796 implements MigrationInterface {
    name = 'InitialSchema1772683893796'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "companies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "slug" character varying(100) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_b28b07d25e4324eee577de5496d" UNIQUE ("slug"), CONSTRAINT "PK_d4bc3e82a314fa9e29f652c2c22" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'agent', 'manager', 'boss')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "email" character varying(255) NOT NULL, "password" character varying(255) NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'agent', "company_id" uuid NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "property_areas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "description" text, "company_id" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_87149f58701164f29382b289aa4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "buildings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "area_id" uuid NOT NULL, "company_id" uuid NOT NULL, "address" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_bc65c1acce268c383e41a69003a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."units_status_enum" AS ENUM('available', 'rented', 'sold', 'maintenance')`);
        await queryRunner.query(`CREATE TABLE "units" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "unit_number" character varying(50) NOT NULL, "building_id" uuid NOT NULL, "company_id" uuid NOT NULL, "status" "public"."units_status_enum" NOT NULL DEFAULT 'available', "price" numeric(12,2), "sq_ft" numeric(10,2), "bedrooms" integer NOT NULL DEFAULT '0', "bathrooms" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5a8f2f064919b587d93936cb223" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."property_media_type_enum" AS ENUM('image', 'video', 'virtual_tour')`);
        await queryRunner.query(`CREATE TABLE "property_media" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "url" character varying(255) NOT NULL, "type" "public"."property_media_type_enum" NOT NULL DEFAULT 'image', "is_primary" boolean NOT NULL DEFAULT false, "unit_id" uuid, "building_id" uuid, "company_id" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d18a71a690f74cc103387bd67df" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "property_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "url" character varying(255) NOT NULL, "fileType" character varying(50), "unit_id" uuid, "building_id" uuid, "company_id" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_325aeeeb5044657915b10c4ecb2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_7ae6334059289559722437bcc1c" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "property_areas" ADD CONSTRAINT "FK_59357780b6866671c299509aa14" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "buildings" ADD CONSTRAINT "FK_b4ca96035adadaf63d289e716ec" FOREIGN KEY ("area_id") REFERENCES "property_areas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "buildings" ADD CONSTRAINT "FK_5eba2a0d7830341f2c8d0394d3d" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "units" ADD CONSTRAINT "FK_173b4aee6c28c4db7e929760d80" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "units" ADD CONSTRAINT "FK_3061afe5df76df44acb79d8fc2b" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "property_media" ADD CONSTRAINT "FK_dfbc87d1110227dc8f156de239c" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "property_media" ADD CONSTRAINT "FK_f64263a84a1565153406400aca8" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "property_media" ADD CONSTRAINT "FK_44248212d532a9d682c24c83df3" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "property_documents" ADD CONSTRAINT "FK_6c36fa38bc823870baca6e9cd14" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "property_documents" ADD CONSTRAINT "FK_c7f883c7b620726dc402fcaf43f" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "property_documents" ADD CONSTRAINT "FK_4f76badb45158db1cbb653193c7" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "property_documents" DROP CONSTRAINT "FK_4f76badb45158db1cbb653193c7"`);
        await queryRunner.query(`ALTER TABLE "property_documents" DROP CONSTRAINT "FK_c7f883c7b620726dc402fcaf43f"`);
        await queryRunner.query(`ALTER TABLE "property_documents" DROP CONSTRAINT "FK_6c36fa38bc823870baca6e9cd14"`);
        await queryRunner.query(`ALTER TABLE "property_media" DROP CONSTRAINT "FK_44248212d532a9d682c24c83df3"`);
        await queryRunner.query(`ALTER TABLE "property_media" DROP CONSTRAINT "FK_f64263a84a1565153406400aca8"`);
        await queryRunner.query(`ALTER TABLE "property_media" DROP CONSTRAINT "FK_dfbc87d1110227dc8f156de239c"`);
        await queryRunner.query(`ALTER TABLE "units" DROP CONSTRAINT "FK_3061afe5df76df44acb79d8fc2b"`);
        await queryRunner.query(`ALTER TABLE "units" DROP CONSTRAINT "FK_173b4aee6c28c4db7e929760d80"`);
        await queryRunner.query(`ALTER TABLE "buildings" DROP CONSTRAINT "FK_5eba2a0d7830341f2c8d0394d3d"`);
        await queryRunner.query(`ALTER TABLE "buildings" DROP CONSTRAINT "FK_b4ca96035adadaf63d289e716ec"`);
        await queryRunner.query(`ALTER TABLE "property_areas" DROP CONSTRAINT "FK_59357780b6866671c299509aa14"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_7ae6334059289559722437bcc1c"`);
        await queryRunner.query(`DROP TABLE "property_documents"`);
        await queryRunner.query(`DROP TABLE "property_media"`);
        await queryRunner.query(`DROP TYPE "public"."property_media_type_enum"`);
        await queryRunner.query(`DROP TABLE "units"`);
        await queryRunner.query(`DROP TYPE "public"."units_status_enum"`);
        await queryRunner.query(`DROP TABLE "buildings"`);
        await queryRunner.query(`DROP TABLE "property_areas"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP TABLE "companies"`);
    }

}
