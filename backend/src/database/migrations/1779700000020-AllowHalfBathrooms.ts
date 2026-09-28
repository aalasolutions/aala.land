import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowHalfBathrooms1779700000020 implements MigrationInterface {
  name = 'AllowHalfBathrooms1779700000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "units" ALTER COLUMN "bathrooms" TYPE numeric(3,1) USING "bathrooms"::numeric(3,1)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "units" ALTER COLUMN "bathrooms" TYPE integer USING round("bathrooms")::integer`,
    );
  }
}
