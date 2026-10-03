import { helper } from '@ember/component/helper';

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
  const hasApplied = applied > 0;
  const creditAmount = hasApplied ? applied : issued > 0 ? issued : null;
  const creditNote = hasApplied ? 'used' : 'added to balance';
  return { label, tagClass, creditAmount, creditNote };
});
