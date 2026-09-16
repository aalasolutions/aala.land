import { MigrationInterface, QueryRunner } from 'typeorm';

// Closes a race where a commission approves between the pre-delete count and commit
export class AddCommissionsAgentFk1779500000045 implements MigrationInterface {
  name = 'AddCommissionsAgentFk1779500000045';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_commissions_agent_users'
        ) THEN
          ALTER TABLE "commissions"
            ADD CONSTRAINT "FK_commissions_agent_users"
            FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE RESTRICT;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "commissions" DROP CONSTRAINT IF EXISTS "FK_commissions_agent_users"`,
    );
  }
}
