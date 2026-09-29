import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContactAccessRequests1779700000011
  implements MigrationInterface
{
  name = 'CreateContactAccessRequests1779700000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "contact_access_requests" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "company_id" uuid NOT NULL,
                "contact_id" uuid NOT NULL,
                "requester_id" uuid NOT NULL,
                "region_code" varchar(50) NOT NULL,
                "kind" varchar(16) NOT NULL DEFAULT 'REQUEST',
                "status" varchar(16) NOT NULL DEFAULT 'PENDING',
                "source_type" varchar(50),
                "source_id" uuid,
                "note" text,
                "decided_by" uuid,
                "decided_at" TIMESTAMPTZ,
                "expires_at" TIMESTAMPTZ,
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT "PK_contact_access_requests" PRIMARY KEY ("id"),
                CONSTRAINT "FK_contact_access_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_contact_access_contact" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_contact_access_requester" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_contact_access_decided_by" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_contact_access_company_status" ON "contact_access_requests" ("company_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_contact_access_requester_status" ON "contact_access_requests" ("requester_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_contact_access_contact" ON "contact_access_requests" ("contact_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_contact_access_region" ON "contact_access_requests" ("region_code")`,
    );
    // One open request per agent and contact.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_contact_access_pending" ON "contact_access_requests" ("contact_id", "requester_id") WHERE "status" = 'PENDING'`,
    );

    await queryRunner.query(
      `ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'CONTACT_ACCESS_REQUESTED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'CONTACT_ACCESS_DECIDED'`,
    );

    // Existing assignments predate the verification rule and are grandfathered as manager-made links.
    await queryRunner.query(`
            INSERT INTO "contact_access_requests"
                ("company_id", "contact_id", "requester_id", "region_code", "kind", "status", "source_type", "source_id", "decided_at", "expires_at")
            SELECT DISTINCT ON (l."contact_id", l."assigned_to")
                l."company_id", l."contact_id", l."assigned_to", c."region_code", 'LINK', 'APPROVED', 'lead', l."id", now(), NULL
            FROM "leads" l
            JOIN "contacts" c ON c."id" = l."contact_id"
            WHERE l."contact_id" IS NOT NULL
              AND l."assigned_to" IS NOT NULL
              AND c."created_by" IS DISTINCT FROM l."assigned_to"
            ORDER BY l."contact_id", l."assigned_to", l."created_at" DESC
        `);
    await queryRunner.query(`
            INSERT INTO "contact_access_requests"
                ("company_id", "contact_id", "requester_id", "region_code", "kind", "status", "source_type", "source_id", "decided_at", "expires_at")
            SELECT DISTINCT ON (u."owner_id", u."assigned_agent_id")
                u."company_id", u."owner_id", u."assigned_agent_id", c."region_code", 'LINK', 'APPROVED', 'unit', u."id", now(), NULL
            FROM "units" u
            JOIN "contacts" c ON c."id" = u."owner_id"
            WHERE u."owner_id" IS NOT NULL
              AND u."assigned_agent_id" IS NOT NULL
              AND u."deleted_at" IS NULL
              AND c."created_by" IS DISTINCT FROM u."assigned_agent_id"
              AND NOT EXISTS (
                SELECT 1 FROM "contact_access_requests" r
                WHERE r."contact_id" = u."owner_id" AND r."requester_id" = u."assigned_agent_id"
              )
            ORDER BY u."owner_id", u."assigned_agent_id", u."created_at" DESC
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Enum values cannot be dropped; the two notification types stay.
    await queryRunner.query(`DROP TABLE IF EXISTS "contact_access_requests"`);
  }
}
