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

// The two limits only a cheque has; the window and no-future rule live in finance.
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

// A deposit sits between the day the record was added and the day it cleared.
export function assertChequeDepositDate(
  depositDate: string,
  addedDate: string,
  clearedDate: string,
): void {
  if (daysBetween(addedDate, depositDate) < 0) {
    throw new BadRequestException(
      `A cheque cannot be deposited before it was added on ${addedDate}.`,
    );
  }
  if (daysBetween(depositDate, clearedDate) < 0) {
    throw new BadRequestException(
      `A cheque cannot be deposited after it cleared on ${clearedDate}.`,
    );
  }
}
