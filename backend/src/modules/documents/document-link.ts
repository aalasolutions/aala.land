import { contactDisplayNameOr } from '@shared/utils/contact.util';
import { PropertyDocument } from '../properties/entities/property-document.entity';

export type DocumentLinkType =
  | 'unit'
  | 'asset'
  | 'contact'
  | 'lease'
  | 'work_order';

export const DOCUMENT_RELATED_FILTERS = [
  'unit',
  'asset',
  'contact',
  'lease',
  'work_order',
  'none',
] as const;

export type DocumentRelatedFilter = (typeof DOCUMENT_RELATED_FILTERS)[number];

export const DOCUMENT_LINK_COLUMNS: Record<DocumentLinkType, string> = {
  unit: 'unit_id',
  asset: 'asset_id',
  contact: 'contact_id',
  lease: 'lease_id',
  work_order: 'work_order_id',
};

export interface DocumentLink {
  type: DocumentLinkType;
  id: string;
  label: string;
}

// Reads the relations findAll joins; a parent that failed to join still yields its id.
export function documentLink(doc: PropertyDocument): DocumentLink | null {
  if (doc.unitId) {
    const assetName = doc.unit?.asset?.name;
    const unitNumber = doc.unit?.unitNumber ?? '';
    return {
      type: 'unit',
      id: doc.unitId,
      label: assetName ? `${assetName} ${unitNumber}`.trim() : unitNumber,
    };
  }
  if (doc.assetId) {
    return { type: 'asset', id: doc.assetId, label: doc.asset?.name ?? '' };
  }
  if (doc.contactId) {
    return {
      type: 'contact',
      id: doc.contactId,
      label: contactDisplayNameOr(doc.contact ?? null, 'Unnamed contact'),
    };
  }
  if (doc.leaseId) {
    const tenant = contactDisplayNameOr(
      doc.lease?.contact ?? null,
      'No tenant',
    );
    const startDate = doc.lease?.startDate ?? '';
    return {
      type: 'lease',
      id: doc.leaseId,
      label: `${tenant} ${startDate}`.trim(),
    };
  }
  if (doc.workOrderId) {
    return {
      type: 'work_order',
      id: doc.workOrderId,
      label: doc.workOrder?.title ?? '',
    };
  }
  return null;
}
