import { helper } from '@ember/component/helper';
import { TRANSACTION_CATEGORY_OPTIONS } from 'land/constants';

export function transactionCategoryLabel(value) {
  const match = TRANSACTION_CATEGORY_OPTIONS.find(
    (option) => option.value === value,
  );
  return match?.label ?? value;
}

export default helper(([value]) => transactionCategoryLabel(value));
