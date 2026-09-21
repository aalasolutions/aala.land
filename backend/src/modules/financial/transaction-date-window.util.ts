import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  addDays,
  addMonthsToInstant,
  dateInZone,
  daysBetween,
  isDateOnly,
  regionTimezone,
  regionToday,
} from '../../shared/utils/region-time.util';
import { Transaction } from './entities/transaction.entity';

export const MAX_BACKDATE_DAYS = 30;
export const MAX_FORWARD_MONTHS = 1;
export const LOCK_AFTER_DAYS = 30;

// The row fields a window decision needs; the stored entity satisfies it.
export type TransactionDateBasis = Pick<
  Transaction,
  'transactionDate' | 'regionCode' | 'createdAt'
>;

// A date-only string carries no zone, so UTC midnight keeps month arithmetic on the same day.
function addMonths(day: string, months: number): string {
  return dateInZone(
    'UTC',
    addMonthsToInstant(new Date(`${day}T00:00:00.000Z`), months),
  );
}

// Same basis as businessDateSql: the stated date, else the region day the row was recorded on.
export function transactionBusinessDate(
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

export function transactionDateWindow(
  regionCode?: string | null,
  at: Date = new Date(),
): { earliest: string; latest: string } {
  const today = regionToday(regionCode, at);
  return {
    earliest: addDays(today, -MAX_BACKDATE_DAYS),
    latest: addMonths(today, MAX_FORWARD_MONTHS),
  };
}

// Backdating is bounded rather than forbidden: reconciliation lands after the business day.
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
      `Transaction date cannot be more than ${MAX_FORWARD_MONTHS} month ahead. The latest date accepted today is ${latest}.`,
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
