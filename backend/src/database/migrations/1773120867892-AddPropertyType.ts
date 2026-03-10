import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from "typeorm";

export class AddPropertyType1773120867892 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Check if columns already exist (DB_SYNC may have created them)
        const buildingsTable = await queryRunner.getTable('buildings');
        const unitsTable = await queryRunner.getTable('units');

        const buildingHasPropertyType = buildingsTable?.findColumnByName('property_type');
        const unitHasPropertyType = unitsTable?.findColumnByName('property_type');

        // Add property_type to buildings table if not exists
        if (!buildingHasPropertyType) {
            await queryRunner.addColumn('buildings', new TableColumn({
                name: 'property_type',
                type: 'enum',
                enum: ['RENTAL', 'FOR_SALE'],
                default: "'RENTAL'",
                isNullable: false,
            }));
        }

        // Add property_type to units table if not exists (nullable for inheritance)
        if (!unitHasPropertyType) {
            await queryRunner.addColumn('units', new TableColumn({
                name: 'property_type',
                type: 'enum',
                enum: ['RENTAL', 'FOR_SALE'],
                isNullable: true,
            }));
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn('units', 'property_type');
        await queryRunner.dropColumn('buildings', 'property_type');
    }

}
