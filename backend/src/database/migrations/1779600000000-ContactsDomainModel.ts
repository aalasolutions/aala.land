import { MigrationInterface, QueryRunner } from 'typeorm';

// Contacts becomes the single identity table, replacing owners; prod is empty, no backfill needed
export class ContactsDomainModel1779600000000 implements MigrationInterface {
  name = 'ContactsDomainModel1779600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. first_name nullable: a WhatsApp contact may have a number and no name
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD COLUMN "nationality" varchar(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD COLUMN "national_id" varchar(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD COLUMN "is_whatsapp" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" ALTER COLUMN "first_name" DROP NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "contacts" DROP COLUMN "whatsapp_number"`,
    );
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "tags"`);
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "lead_id"`);
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "type"`);
    await queryRunner.query(`DROP TYPE "contacts_type_enum"`);

    // 3. assigned_agent_id moves to units: assignment lives on the thing, not the person
    await queryRunner.query(
      `ALTER TABLE "units" ADD COLUMN "assigned_agent_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" ADD CONSTRAINT "fk_units_assigned_agent" FOREIGN KEY ("assigned_agent_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );

    // 4. leads: contact_id + city_id (city was the only missing location rung).
    await queryRunner.query(`ALTER TABLE "leads" ADD COLUMN "contact_id" uuid`);
    await queryRunner.query(`ALTER TABLE "leads" ADD COLUMN "city_id" uuid`);
    await queryRunner.query(
      `CREATE INDEX "IDX_LEADS_CONTACT_ID" ON "leads" ("contact_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_LEADS_CITY_ID" ON "leads" ("city_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "leads" ADD CONSTRAINT "fk_leads_contact" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "leads" ADD CONSTRAINT "fk_leads_city" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL`,
    );

    // 5. leases: tenant becomes a contact edge.
    await queryRunner.query(
      `ALTER TABLE "leases" ADD COLUMN "contact_id" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_LEASES_CONTACT_ID" ON "leases" ("contact_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "leases" ADD CONSTRAINT "fk_leases_contact" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL`,
    );

    // 6. whatsapp_chats: an inbound message must resolve to a person.
    await queryRunner.query(
      `ALTER TABLE "whatsapp_chats" ADD COLUMN "contact_id" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_wa_chats_contact_id" ON "whatsapp_chats" ("contact_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_chats" ADD CONSTRAINT "fk_wa_chats_contact" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL`,
    );

    // 7. repoints owner_id FK from owners to contacts; column and its index stay valid
    await queryRunner.query(
      `ALTER TABLE "units" DROP CONSTRAINT "fk_units_owner"`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" ADD CONSTRAINT "fk_units_owner" FOREIGN KEY ("owner_id") REFERENCES "contacts"("id") ON DELETE SET NULL`,
    );

    // 8. drops lead identity columns: identity now lives on contacts
    await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN "first_name"`);
    await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN "last_name"`);
    await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN "email"`);
    await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN "phone"`);
    await queryRunner.query(
      `ALTER TABLE "leads" DROP COLUMN "whatsapp_number"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leads" ALTER COLUMN "region_code" DROP DEFAULT`,
    );

    await queryRunner.query(`ALTER TABLE "leases" DROP COLUMN "tenant_name"`);
    await queryRunner.query(`ALTER TABLE "leases" DROP COLUMN "tenant_email"`);
    await queryRunner.query(`ALTER TABLE "leases" DROP COLUMN "tenant_phone"`);
    await queryRunner.query(
      `ALTER TABLE "leases" DROP COLUMN "tenant_national_id"`,
    );

    // 10. owners table goes; FKs/indexes drop with it, units FK already repointed above
    await queryRunner.query(`DROP TABLE "owners"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreates owners as migration 1774000000004 did, to stay consistent on revert
    await queryRunner.query(`
            CREATE TABLE "owners" (
                "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                "name" varchar(255) NOT NULL,
                "email" varchar(255),
                "phone" varchar(50),
                "nationality_id" varchar(100),
                "address" text,
                "notes" text,
                "assigned_agent_id" uuid,
                "company_id" uuid NOT NULL,
                "created_at" timestamp DEFAULT now(),
                "updated_at" timestamp DEFAULT now(),
                CONSTRAINT "fk_owners_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
                CONSTRAINT "fk_owners_agent" FOREIGN KEY ("assigned_agent_id") REFERENCES "users"("id")
            )
        `);
    await queryRunner.query(
      `CREATE INDEX "IDX_OWNERS_COMPANY_ID" ON "owners"("company_id")`,
    );

    // 9. tenant_name was dropped irreversibly; backfill a placeholder before NOT NULL
    await queryRunner.query(
      `ALTER TABLE "leases" ADD COLUMN "tenant_national_id" varchar(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE "leases" ADD COLUMN "tenant_phone" varchar(30)`,
    );
    await queryRunner.query(
      `ALTER TABLE "leases" ADD COLUMN "tenant_email" varchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "leases" ADD COLUMN "tenant_name" varchar(255)`,
    );
    await queryRunner.query(
      `UPDATE "leases" SET "tenant_name" = 'Unknown tenant' WHERE "tenant_name" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "leases" ALTER COLUMN "tenant_name" SET NOT NULL`,
    );

    // 8. restores lead identity columns, same placeholder treatment for first_name
    await queryRunner.query(
      `ALTER TABLE "leads" ALTER COLUMN "region_code" SET DEFAULT 'dubai'`,
    );
    await queryRunner.query(
      `ALTER TABLE "leads" ADD COLUMN "whatsapp_number" varchar(50)`,
    );
    await queryRunner.query(`ALTER TABLE "leads" ADD COLUMN "phone" varchar(50)`);
    await queryRunner.query(
      `ALTER TABLE "leads" ADD COLUMN "email" varchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "leads" ADD COLUMN "last_name" varchar(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "leads" ADD COLUMN "first_name" varchar(100)`,
    );
    await queryRunner.query(
      `UPDATE "leads" SET "first_name" = 'Unknown' WHERE "first_name" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "leads" ALTER COLUMN "first_name" SET NOT NULL`,
    );

    // 7. owner identity was lost by up(); null dangling refs before FK to empty owners
    await queryRunner.query(
      `UPDATE "units" SET "owner_id" = NULL WHERE "owner_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" DROP CONSTRAINT "fk_units_owner"`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" ADD CONSTRAINT "fk_units_owner" FOREIGN KEY ("owner_id") REFERENCES "owners"("id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "whatsapp_chats" DROP CONSTRAINT "fk_wa_chats_contact"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_wa_chats_contact_id"`);
    await queryRunner.query(
      `ALTER TABLE "whatsapp_chats" DROP COLUMN "contact_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "leases" DROP CONSTRAINT "fk_leases_contact"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_LEASES_CONTACT_ID"`);
    await queryRunner.query(`ALTER TABLE "leases" DROP COLUMN "contact_id"`);

    await queryRunner.query(
      `ALTER TABLE "leads" DROP CONSTRAINT "fk_leads_city"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leads" DROP CONSTRAINT "fk_leads_contact"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_LEADS_CITY_ID"`);
    await queryRunner.query(`DROP INDEX "IDX_LEADS_CONTACT_ID"`);
    await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN "city_id"`);
    await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN "contact_id"`);

    await queryRunner.query(
      `ALTER TABLE "units" DROP CONSTRAINT "fk_units_assigned_agent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" DROP COLUMN "assigned_agent_id"`,
    );

    await queryRunner.query(
      `CREATE TYPE "contacts_type_enum" AS ENUM('LEAD', 'TENANT', 'OWNER', 'VENDOR', 'OTHER')`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD COLUMN "type" contacts_type_enum NOT NULL DEFAULT 'OTHER'`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD COLUMN "lead_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD COLUMN "tags" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD COLUMN "whatsapp_number" varchar(50)`,
    );

    // 1. backfill first_name before SET NOT NULL, same as leads/leases above
    await queryRunner.query(
      `UPDATE "contacts" SET "first_name" = 'Unknown' WHERE "first_name" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" ALTER COLUMN "first_name" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" DROP COLUMN "is_whatsapp"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" DROP COLUMN "national_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" DROP COLUMN "nationality"`,
    );
  }
}
