import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPasswordResetToUsers1773400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    if (!table) {
      return;
    }

    const hasToken = table.findColumnByName('reset_password_token');
    if (!hasToken) {
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: 'reset_password_token',
          type: 'varchar',
          length: '255',
          isNullable: true,
        }),
      );
    }

    const hasExpires = table.findColumnByName('reset_password_expires');
    if (!hasExpires) {
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: 'reset_password_expires',
          type: 'timestamp',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    if (!table) {
      return;
    }

    if (table.findColumnByName('reset_password_expires')) {
      await queryRunner.dropColumn('users', 'reset_password_expires');
    }
    if (table.findColumnByName('reset_password_token')) {
      await queryRunner.dropColumn('users', 'reset_password_token');
    }
  }
}
