import { helper } from '@ember/component/helper';
import { creditDisplayAmount } from 'land/utils/billing-credit';

const REFUND_STATUS = {
  pending: { label: 'Refund requested', tagClass: 'tag-txn-pending' },
  approved: { label: 'Refunded', tagClass: 'tag-txn-completed' },
  rejected: { label: 'Refund rejected', tagClass: 'tag-txn-failed' },
};

// Amounts are minor units in the row's own currency.
export default helper(function billingHistoryStatus([row]) {
  const applied = row?.creditApplied ?? 0;
  const issued = row?.creditIssued ?? 0;
  let label = 'Failed';
  let tagClass = 'tag-txn-failed';
  if (row?.type === 'payment_succeeded') {
    label = 'Paid';
    tagClass = 'tag-txn-completed';
  } else if (row?.type === 'settled_without_charge') {
    tagClass =
      applied > 0 || issued > 0 ? 'tag-txn-completed' : 'tag-txn-cancelled';
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
  return { label, tagClass, creditAmount, creditNote };
});
