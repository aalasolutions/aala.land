import { helper } from '@ember/component/helper';
import { creditDisplayAmount } from 'land/utils/billing-credit';

const REFUND_STATUS = {
  pending: { label: 'Refund requested', tagVariant: 'warning' },
  approved: { label: 'Refunded', tagVariant: 'success' },
  rejected: { label: 'Refund rejected', tagVariant: 'danger' },
};

// Amounts are minor units in the row's own currency.
export default helper(function billingHistoryStatus([row]) {
  const applied = row?.creditApplied ?? 0;
  const issued = row?.creditIssued ?? 0;
  let label = 'Failed';
  let tagVariant = 'danger';
  if (row?.type === 'payment_succeeded') {
    label = 'Paid';
    tagVariant = 'success';
  } else if (row?.type === 'settled_without_charge') {
    tagVariant = applied > 0 || issued > 0 ? 'success' : 'secondary';
    if (applied > 0) label = 'Paid with credit';
    else if (issued > 0) label = 'Credit issued';
    else label = 'No charge';
  }
  if (row?.type === 'refund') {
    const refund = REFUND_STATUS[row.refundStatus] ?? REFUND_STATUS.pending;
    return { ...refund, creditAmount: null, creditNote: '' };
  }
  const hasApplied = applied > 0;
  const creditAmount = creditDisplayAmount(row) || null;
  const creditNote = hasApplied ? 'used' : 'added to balance';
  return { label, tagVariant, creditAmount, creditNote };
});
