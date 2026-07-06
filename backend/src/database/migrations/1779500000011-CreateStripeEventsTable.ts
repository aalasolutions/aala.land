import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStripeEventsTable1779500000011 implements MigrationInterface {
    name = 'CreateStripeEventsTable1779500000011';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "stripe_events" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "provider_event_id" varchar(255) NOT NULL,
                "type" varchar(255) NOT NULL,
                "payload" jsonb NOT NULL,
                "received_at" TIMESTAMP NOT NULL DEFAULT now(),
                "processed_at" TIMESTAMP,
                CONSTRAINT "PK_stripe_events" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_stripe_events_provider_event_id" UNIQUE ("provider_event_id")
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "stripe_events"`);
    }
}
