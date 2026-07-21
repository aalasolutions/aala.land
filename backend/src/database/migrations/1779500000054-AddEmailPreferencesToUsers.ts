import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailPreferencesToUsers1779500000054
  implements MigrationInterface
{
  name = 'AddEmailPreferencesToUsers1779500000054';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Per-user suppressible email categories. Transactional/account emails
    // (welcome, password reset, invite, quota, payment failed) ignore this and
    // always send. Only receipts, product updates, and the stats digest respect
    // it. Opt-out model: everyone starts subscribed to all.
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_preferences" jsonb NOT NULL DEFAULT '{"billing":true,"productUpdates":true,"statsDigest":true}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "email_preferences"`,
    );
  }
}
