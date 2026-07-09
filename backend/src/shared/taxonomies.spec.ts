import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as taxonomies from '@land/taxonomies';
import * as lists from './taxonomies';

// Drift guard: the backend's allowed-value lists (src/shared/taxonomies.ts) are
// the safety net that replaces the dropped Postgres enum constraints for the
// killed (varchar) taxonomy columns. This test pins them to @land/taxonomies so
// any divergence fails CI.

const sharedSource = readFileSync(
  resolve(__dirname, '../../../shared/index.js'),
  'utf8',
);
const sourceExports = [...sharedSource.matchAll(/^export const (\w+)/gm)].map(
  (m) => m[1],
);

describe('@land/taxonomies build freshness', () => {
  it('committed CJS build exposes every ESM source export (rebuild shared/ after editing index.js)', () => {
    const cjsKeys = Object.keys(taxonomies);
    const missing = sourceExports.filter((name) => !cjsKeys.includes(name));
    expect(missing).toEqual([]);
  });
});

describe('backend value lists match shared source of truth', () => {
  const cases: Array<{ field: string; values: string[]; shared: string[] }> = [
    {
      field: 'cheques.type',
      values: lists.CHEQUE_TYPE_VALUES,
      shared: vals(taxonomies.CHEQUE_TYPE_OPTIONS),
    },
    {
      field: 'cheques.status',
      values: lists.CHEQUE_STATUS_VALUES,
      shared: vals(taxonomies.CHEQUE_STATUS_OPTIONS),
    },
    {
      field: 'contacts.type',
      values: lists.CONTACT_TYPE_VALUES,
      shared: vals(taxonomies.CONTACT_TYPES),
    },
    {
      field: 'property_documents.category',
      values: lists.DOCUMENT_CATEGORY_VALUES,
      shared: vals(taxonomies.CATEGORIES),
    },
    {
      field: 'transactions.type',
      values: lists.TRANSACTION_TYPE_VALUES,
      shared: vals(taxonomies.TRANSACTION_TYPE_OPTIONS),
    },
    {
      field: 'transactions.category',
      values: lists.TRANSACTION_CATEGORY_VALUES,
      shared: vals(taxonomies.TRANSACTION_CATEGORY_OPTIONS),
    },
    {
      field: 'transactions.payment_method',
      values: lists.PAYMENT_METHOD_VALUES,
      shared: vals(taxonomies.PAYMENT_METHOD_OPTIONS),
    },
    {
      field: 'transactions.status',
      values: lists.TRANSACTION_STATUS_VALUES,
      shared: vals(taxonomies.TRANSACTION_STATUS_OPTIONS),
    },
    {
      field: 'leads.status',
      values: lists.LEAD_STATUS_VALUES,
      shared: taxonomies.LEAD_STAGES.map((s) => s.status),
    },
    {
      field: 'leads.temperature',
      values: lists.LEAD_TEMPERATURE_VALUES,
      shared: taxonomies.TEMPERATURE_STAGES.map((s) => s.temperature),
    },
    {
      field: 'leads.source',
      values: lists.LEAD_SOURCE_VALUES,
      shared: vals(taxonomies.LEAD_SOURCE_OPTIONS),
    },
    {
      field: 'leases.type',
      values: lists.LEASE_TYPE_VALUES,
      shared: vals(taxonomies.LEASE_TYPE_OPTIONS),
    },
    {
      field: 'leases.status',
      values: lists.LEASE_STATUS_VALUES,
      shared: vals(taxonomies.LEASE_STATUS_OPTIONS),
    },
    {
      field: 'work_orders.status',
      values: lists.WORK_ORDER_STATUS_VALUES,
      shared: vals(taxonomies.MAINTENANCE_STATUS_OPTIONS),
    },
    {
      field: 'work_orders.category',
      values: lists.WORK_ORDER_CATEGORY_VALUES,
      shared: vals(taxonomies.MAINTENANCE_CATEGORY_OPTIONS),
    },
    {
      field: 'work_orders.schedule_frequency',
      values: lists.SCHEDULE_FREQUENCY_VALUES,
      shared: vals(taxonomies.SCHEDULE_FREQUENCY_OPTIONS),
    },
    {
      field: 'commissions.type',
      values: lists.COMMISSION_TYPE_VALUES,
      shared: vals(taxonomies.COMMISSION_TYPE_OPTIONS),
    },
    {
      field: 'commissions.status',
      values: lists.COMMISSION_STATUS_VALUES,
      shared: vals(taxonomies.COMMISSION_STATUS_OPTIONS),
    },
    {
      field: 'units.status',
      values: lists.UNIT_STATUS_VALUES,
      shared: vals(taxonomies.PROPERTY_STATUS_OPTIONS),
    },
    {
      field: 'email_templates.category',
      values: lists.EMAIL_CATEGORY_VALUES,
      shared: vals(taxonomies.EMAIL_CATEGORIES),
    },
    {
      field: 'units/assets.property_type',
      values: lists.PROPERTY_TYPE_VALUES,
      shared: vals(taxonomies.PROPERTY_TYPE_OPTIONS),
    },
    {
      field: 'notifications.type',
      values: lists.NOTIFICATION_TYPE_VALUES,
      shared: vals(taxonomies.NOTIFICATION_TYPES),
    },
    {
      field: 'lead_activities.type',
      values: lists.ACTIVITY_TYPE_VALUES,
      shared: vals(taxonomies.ACTIVITY_TYPE_OPTIONS),
    },
  ];

  it.each(cases)(
    '$field backend list matches shared constants',
    ({ values, shared }) => {
      expect(values).toEqual(shared);
    },
  );

  it.each(cases)('$field backend list is non-empty', ({ values }) => {
    expect(values.length).toBeGreaterThan(0);
  });

  it('vendors.specialty is unified with work_orders.category (single shared list)', () => {
    expect(lists.VENDOR_SPECIALTY_VALUES).toEqual(
      lists.WORK_ORDER_CATEGORY_VALUES,
    );
    expect(lists.VENDOR_SPECIALTY_VALUES).toEqual(
      vals(taxonomies.MAINTENANCE_CATEGORY_OPTIONS),
    );
  });
});

function vals(opts: ReadonlyArray<{ value: string }>): string[] {
  return opts.map((o) => o.value).filter((v) => v !== '');
}
