import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  addDays,
  dateInZone,
  daysBetween,
  isDateOnly,
  regionTimezone,
  regionToday,
} from '../../shared/utils/region-time.util';
import { Transaction, TransactionStatus } from './entities/transaction.entity';

export const MAX_BACKDATE_DAYS = 30;
export const LOCK_AFTER_DAYS = 30;

// The row fields a window decision needs; the stored entity satisfies it.
export type TransactionDateBasis = Pick<
  Transaction,
  'transactionDate' | 'regionCode' | 'createdAt'
>;

// PARKED with assertTransactionEditable below: the basis that rule was written against.
// Not the money date, which is transactionDate.
function transactionBusinessDate(
  transaction: TransactionDateBasis,
  at: Date = new Date(),
): string {
  return (
    transaction.transactionDate ??
    dateInZone(
      regionTimezone(transaction.regionCode),
      transaction.createdAt ?? at,
    )
  );
}

// COMPLETED means the money arrived, so the day it arrived cannot be missing.
export function assertCompletedHasDate(
  status: TransactionStatus | undefined,
  transactionDate: string | null | undefined,
): void {
  if (status === TransactionStatus.COMPLETED && !isDateOnly(transactionDate)) {
    throw new BadRequestException(
      'A completed transaction needs the date the money arrived.',
    );
  }
}

export function transactionDateWindow(
  regionCode?: string | null,
  at: Date = new Date(),
): { earliest: string; latest: string } {
  const today = regionToday(regionCode, at);
  return { earliest: addDays(today, -MAX_BACKDATE_DAYS), latest: today };
}

// The date money arrived: never ahead of today, never more than MAX_BACKDATE_DAYS behind it.
export function assertTransactionDateInWindow(
  transactionDate: string | null | undefined,
  regionCode?: string | null,
  at: Date = new Date(),
): void {
  // A malformed date is reported by IsDateOnly on the DTO, not here.
  if (!isDateOnly(transactionDate)) {
    return;
  }
  const date = transactionDate as string;
  const { earliest, latest } = transactionDateWindow(regionCode, at);

  if (daysBetween(earliest, date) < 0) {
    throw new BadRequestException(
      `Transaction date cannot be backdated more than ${MAX_BACKDATE_DAYS} days. The earliest date accepted today is ${earliest}.`,
    );
  }
  if (daysBetween(date, latest) < 0) {
    throw new BadRequestException(
      `Transaction date cannot be in the future. The latest date accepted today is ${latest}.`,
    );
  }
}

// PARKED, deliberately not called: this froze the whole record (not just its date field) once PENDING rent-due rows aged past due.
export function assertTransactionEditable(
  transaction: TransactionDateBasis,
  at: Date = new Date(),
): void {
  const businessDate = transactionBusinessDate(transaction, at);
  const age = daysBetween(
    businessDate,
    regionToday(transaction.regionCode, at),
  );
  if (age > LOCK_AFTER_DAYS) {
    throw new ConflictException(
      `This transaction is dated ${businessDate}, ${age} days ago. A transaction locks once its date is more than ${LOCK_AFTER_DAYS} days old and can no longer be edited.`,
    );
  }
}
