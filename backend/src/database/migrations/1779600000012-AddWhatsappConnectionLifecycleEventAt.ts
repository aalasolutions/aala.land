import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhatsappConnectionLifecycleEventAt1779600000012 implements MigrationInterface {
  name = 'AddWhatsappConnectionLifecycleEventAt1779600000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_connections" ADD COLUMN "lifecycle_event_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_connections" DROP COLUMN "lifecycle_event_at"`,
    );
  }
}
