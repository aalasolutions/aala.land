import type { ColumnDef } from '@shared/spreadsheet/column-def';
import {
  CONTACT_COLUMNS,
  CONTACT_TEMPLATE_EXAMPLE,
} from '@modules/contacts/transfer/contact.columns';

export interface TransferEntity {
  columns: ColumnDef[];
  example: Record<string, string>;
  fileStem: string;
}

export const TRANSFER_ENTITIES: Record<string, TransferEntity> = {
  contacts: {
    columns: CONTACT_COLUMNS,
    example: CONTACT_TEMPLATE_EXAMPLE,
    fileStem: 'contacts',
  },
};

export function transferEntity(name: string): TransferEntity | undefined {
  return Object.prototype.hasOwnProperty.call(TRANSFER_ENTITIES, name)
    ? TRANSFER_ENTITIES[name]
    : undefined;
}
