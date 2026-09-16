import { MigrationInterface, QueryRunner } from 'typeorm';

// DB backstop against two concurrent renews leaving a unit with two ACTIVE leases
export class AddActiveLeaseUniquePerUnit1779500000043 implements MigrationInterface {
  name = 'AddActiveLeaseUniquePerUnit1779500000043';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_leases_active_unit" ` +
        `ON "leases" ("unit_id") WHERE "status" = 'ACTIVE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_leases_active_unit"`);
  }
}
