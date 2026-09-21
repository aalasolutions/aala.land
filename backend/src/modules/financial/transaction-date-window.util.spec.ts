import { BadRequestException } from '@nestjs/common';
import { TransactionStatus } from './entities/transaction.entity';
import {
  MAX_BACKDATE_DAYS,
  assertCompletedHasDate,
  assertTransactionDateInWindow,
  transactionDateWindow,
} from './transaction-date-window.util';

describe('transaction date rules', () => {
  // 20:30Z is already the next day in Dubai, so the window pivots on the region day.
  const at = new Date('2026-09-21T20:30:00Z');

  describe('transactionDateWindow', () => {
    it('opens 30 days back and closes today, never later', () => {
      expect(transactionDateWindow('dubai', at)).toEqual({
        earliest: '2026-08-23',
        latest: '2026-09-22',
      });
    });

    it('pivots on the region day, not the UTC day', () => {
      expect(transactionDateWindow(null, at)).toEqual({
        earliest: '2026-08-22',
        latest: '2026-09-21',
      });
    });

    it('keeps the cap at 30 days', () => {
      expect(MAX_BACKDATE_DAYS).toBe(30);
    });
  });

  describe('assertTransactionDateInWindow', () => {
    it('accepts today and the 30th day back', () => {
      expect(() =>
        assertTransactionDateInWindow('2026-09-22', 'dubai', at),
      ).not.toThrow();
      expect(() =>
        assertTransactionDateInWindow('2026-08-23', 'dubai', at),
      ).not.toThrow();
    });

    it('refuses the 31st day back, so a closed month cannot be reopened', () => {
      expect(() =>
        assertTransactionDateInWindow('2026-08-22', 'dubai', at),
      ).toThrow(/earliest date accepted today is 2026-08-23/);
    });

    it('refuses tomorrow: money cannot arrive in the future', () => {
      expect(() =>
        assertTransactionDateInWindow('2026-09-23', 'dubai', at),
      ).toThrow(/cannot be in the future/);
    });

    it('ignores a missing or malformed date, which the DTO reports', () => {
      expect(() =>
        assertTransactionDateInWindow(null, 'dubai', at),
      ).not.toThrow();
      expect(() =>
        assertTransactionDateInWindow('2026-02-31', 'dubai', at),
      ).not.toThrow();
    });
  });

  describe('assertCompletedHasDate', () => {
    it('refuses COMPLETED with no date', () => {
      expect(() =>
        assertCompletedHasDate(TransactionStatus.COMPLETED, null),
      ).toThrow(BadRequestException);
      expect(() =>
        assertCompletedHasDate(TransactionStatus.COMPLETED, undefined),
      ).toThrow(/needs the date the money arrived/);
      expect(() =>
        assertCompletedHasDate(TransactionStatus.COMPLETED, '2026-02-31'),
      ).toThrow(BadRequestException);
    });

    it('accepts COMPLETED with a real date', () => {
      expect(() =>
        assertCompletedHasDate(TransactionStatus.COMPLETED, '2026-09-22'),
      ).not.toThrow();
    });

    it('leaves every other status alone, date or not', () => {
      for (const status of [
        TransactionStatus.PENDING,
        TransactionStatus.CANCELLED,
        TransactionStatus.FAILED,
        undefined,
      ]) {
        expect(() => assertCompletedHasDate(status, null)).not.toThrow();
      }
    });
  });
});
