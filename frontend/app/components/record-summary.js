import Component from '@glimmer/component';
import { service } from '@ember/service';
import {
  LEASE_STATUS_OPTIONS,
  MAINTENANCE_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  PROPERTY_STATUS_OPTIONS,
  optionLabelFor,
} from 'land/constants';
import {
  contactEmail,
  contactName,
  contactPhone,
  isLimited,
} from 'land/utils/contact-display';
import { formatDate } from 'land/helpers/format-date';

const join = (...parts) => parts.filter(Boolean).join(', ');

// Read-only facts about a picked record so the user can confirm the pick; renders from the list item.
export default class RecordSummaryComponent extends Component {
  @service region;

  get isLimited() {
    return this.args.type === 'contact' && isLimited(this.args.record);
  }

  get rows() {
    const r = this.args.record;
    if (!r) return [];
    const rows = this.rowsFor(this.args.type, r) ?? [];
    return rows.filter((row) => row.description);
  }

  rowsFor(type, r) {
    switch (type) {
      case 'unit':
        return [
          { term: 'Unit', description: r.unitNumber },
          { term: 'Building', description: join(r.assetName, r.areaName) },
          { term: 'Owner', description: r.ownerName },
          {
            term: 'Status',
            description: optionLabelFor(PROPERTY_STATUS_OPTIONS, r.status),
          },
        ];
      case 'asset':
        return [
          { term: 'Building', description: r.name },
          {
            term: 'Location',
            description: join(r.locality?.name, r.locality?.city?.name),
          },
          { term: 'Address', description: r.address },
          {
            term: 'Units',
            description: Array.isArray(r.units) ? String(r.units.length) : '',
          },
        ];
      case 'contact':
        return [
          { term: 'Name', description: contactName(r) },
          { term: 'Phone', description: contactPhone(r) },
          { term: 'Email', description: contactEmail(r) },
          { term: 'Region', description: this.regionName(r.regionCode) },
        ];
      case 'lease':
        return [
          { term: 'Tenant', description: contactName(r.contact, 'No tenant') },
          {
            term: 'Unit',
            description: join(r.unit?.unitNumber, r.unit?.asset?.name),
          },
          { term: 'Ref', description: r.tenancyRegistrationRef },
          {
            term: 'Period',
            description: [formatDate(r.startDate), formatDate(r.endDate)]
              .filter(Boolean)
              .join(' to '),
          },
          {
            term: 'Status',
            description:
              LEASE_STATUS_OPTIONS.find((o) => o.id === r.status)?.label ??
              r.status,
          },
        ];
      case 'work_order':
        return [
          { term: 'Title', description: r.title },
          { term: 'Unit', description: join(r.unitNumber, r.assetName) },
          { term: 'Vendor', description: r.vendorName },
          {
            term: 'Status',
            description: optionLabelFor(MAINTENANCE_STATUS_OPTIONS, r.status),
          },
          {
            term: 'Priority',
            description: optionLabelFor(PRIORITY_OPTIONS, r.priority),
          },
        ];
      default:
        return [];
    }
  }

  regionName(code) {
    if (!code) return '';
    return this.region.regions.find((x) => x.code === code)?.name ?? code;
  }
}
