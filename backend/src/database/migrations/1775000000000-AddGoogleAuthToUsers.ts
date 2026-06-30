import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddGoogleAuthToUsers1775000000000 implements MigrationInterface {
    name = 'AddGoogleAuthToUsers1775000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn(
            'users',
            new TableColumn({
                name: 'google_id',
                type: 'varchar',
                length: '255',
                isNullable: true,
            }),
        );

        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_users_google_id" ON "users" ("google_id") WHERE "google_id" IS NOT NULL`,
        );

        await queryRunner.addColumn(
            'users',
            new TableColumn({
                name: 'auth_provider',
                type: 'varchar',
                length: '20',
                default: `'local'`,
            }),
        );

        await queryRunner.query(
            `ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropIndex('users', 'IDX_users_google_id');
        await queryRunner.dropColumn('users', 'google_id');
        await queryRunner.dropColumn('users', 'auth_provider');
        await queryRunner.query(
            `ALTER TABLE "users" ALTER COLUMN "password" SET NOT NULL`,
        );
    }
}
