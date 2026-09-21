// Opt-in pre-read: only the entity types listed here pay an extra SELECT on UPDATE and DELETE.
export interface OldValueSource {
  table: string;
  // Audit field name to database column, so old_value keys line up with the request keys in new_value.
  fields: Record<string, string>;
}

const OLD_VALUE_SOURCES: Record<string, OldValueSource> = {
  Transaction: {
    table: 'transactions',
    fields: {
      type: 'type',
      category: 'category',
      status: 'status',
      amount: 'amount',
      currency: 'currency',
      paymentMethod: 'payment_method',
      description: 'description',
      referenceNumber: 'reference_number',
      regionCode: 'region_code',
      unitId: 'unit_id',
      transactionDate: 'transaction_date',
      dueDate: 'due_date',
      paidAt: 'paid_at',
      updatedAt: 'updated_at',
    },
  },
};

export function oldValueSourceFor(
  entityType: string,
): OldValueSource | undefined {
  return OLD_VALUE_SOURCES[entityType];
}
