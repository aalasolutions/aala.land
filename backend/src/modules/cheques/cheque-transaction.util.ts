import { BadRequestException } from '@nestjs/common';
import { daysBetween } from '../../shared/utils/region-time.util';
import { TransactionCategory } from '../financial/entities/transaction.entity';
import { ChequeType } from './entities/cheque.entity';

// Exhaustive by type: adding a ChequeType stops compiling until its category is chosen.
const CHEQUE_TYPE_CATEGORY: Record<ChequeType, TransactionCategory> = {
  [ChequeType.RENT]: TransactionCategory.RENT,
  [ChequeType.SECURITY_DEPOSIT]: TransactionCategory.DEPOSIT,
  [ChequeType.MAINTENANCE]: TransactionCategory.MAINTENANCE,
  [ChequeType.OTHER]: TransactionCategory.OTHER,
};

export function chequeTransactionCategory(
  type: ChequeType,
): TransactionCategory {
  return CHEQUE_TYPE_CATEGORY[type];
}

// The 30-day window and the no-future rule come from the finance module; these are
// the two limits only a cheque has.
export function assertChequeClearedDate(
  clearedDate: string,
  dueDate: string,
  depositDate: string | null,
): void {
  if (daysBetween(dueDate, clearedDate) < 0) {
    throw new BadRequestException(
      `A cheque cannot clear before its due date of ${dueDate}.`,
    );
  }
  if (depositDate && daysBetween(depositDate, clearedDate) < 0) {
    throw new BadRequestException(
      `A cheque cannot clear before it was deposited on ${depositDate}.`,
    );
  }
}
