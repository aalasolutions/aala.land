import type { Type } from '@nestjs/common';
import type { ColumnDef } from '@shared/spreadsheet/column-def';
import {
  CONTACT_COLUMNS,
  CONTACT_TEMPLATE_EXAMPLE,
} from '@modules/contacts/transfer/contact.columns';
import {
  UNIT_COLUMNS,
  UNIT_TEMPLATE_EXAMPLE,
} from '@modules/properties/transfer/unit.columns';
import type { EntityImporter } from './entity-importer';
import { ContactsImportService } from './contacts-import.service';
import { UnitsImportService } from './units-import.service';

// notes describes the download of imported rows that carry a remark; an entity without one has no notes file.
export interface TransferEntity {
  columns: ColumnDef[];
  example: Record<string, string>;
  fileStem: string;
  importer: Type<EntityImporter>;
  notes?: { columns: ColumnDef[]; fileStem: string };
}

export const UNIT_NOTE_COLUMNS: ColumnDef[] = [
  { header: 'Asset', key: 'asset', type: 'string' },
  { header: 'Unit Number', key: 'unitNumber', type: 'string' },
  { header: 'Link', key: 'link', type: 'string' },
];

export const TRANSFER_ENTITIES: Record<string, TransferEntity> = {
  contacts: {
    columns: CONTACT_COLUMNS,
    example: CONTACT_TEMPLATE_EXAMPLE,
    fileStem: 'contacts',
    importer: ContactsImportService,
  },
  units: {
    columns: UNIT_COLUMNS,
    example: UNIT_TEMPLATE_EXAMPLE,
    fileStem: 'units',
    importer: UnitsImportService,
    notes: { columns: UNIT_NOTE_COLUMNS, fileStem: 'units-without-owner' },
  },
};

export const TRANSFER_ENTITY_NAMES = Object.keys(TRANSFER_ENTITIES);

export function transferEntity(name: string): TransferEntity | undefined {
  return Object.prototype.hasOwnProperty.call(TRANSFER_ENTITIES, name)
    ? TRANSFER_ENTITIES[name]
    : undefined;
}
