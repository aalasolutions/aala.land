import { BadRequestException } from '@nestjs/common';
import {
  assertChequeClearedDate,
  assertChequeDepositDate,
  chequeTransactionCategory,
} from './cheque-transaction.util';
import { TransactionCategory } from '../financial/entities/transaction.entity';
import { ChequeType } from './entities/cheque.entity';

describe('chequeTransactionCategory', () => {
  it.each([
    [ChequeType.RENT, TransactionCategory.RENT],
    [ChequeType.SECURITY_DEPOSIT, TransactionCategory.DEPOSIT],
    [ChequeType.MAINTENANCE, TransactionCategory.MAINTENANCE],
    [ChequeType.OTHER, TransactionCategory.OTHER],
  ])('maps %s to %s', (type, category) => {
    expect(chequeTransactionCategory(type)).toBe(category);
  });

  // The map is typed Record<ChequeType, ...>, so a new type stops compiling.
  // This catches the other half: a type deleted from the map at runtime.
  it('answers for every ChequeType the enum declares', () => {
    for (const type of Object.values(ChequeType)) {
      expect(chequeTransactionCategory(type)).toBeDefined();
    }
  });

  it('never reports a maintenance cheque as rent', () => {
    expect(chequeTransactionCategory(ChequeType.MAINTENANCE)).not.toBe(
      TransactionCategory.RENT,
    );
  });
});

describe('assertChequeClearedDate', () => {
  it('accepts a clearing on the due date itself', () => {
    expect(() =>
      assertChequeClearedDate('2026-09-01', '2026-09-01', null),
    ).not.toThrow();
  });

  it('accepts a clearing after the due date', () => {
    expect(() =>
      assertChequeClearedDate('2026-09-10', '2026-09-01', null),
    ).not.toThrow();
  });

  it('refuses a clearing before the due date, naming that date', () => {
    expect(() =>
      assertChequeClearedDate('2026-08-31', '2026-09-01', null),
    ).toThrow('A cheque cannot clear before its due date of 2026-09-01.');
  });

  it('accepts a clearing on the deposit date itself', () => {
    expect(() =>
      assertChequeClearedDate('2026-09-05', '2026-09-01', '2026-09-05'),
    ).not.toThrow();
  });

  it('refuses a clearing before the deposit date, naming that date', () => {
    expect(() =>
      assertChequeClearedDate('2026-09-04', '2026-09-01', '2026-09-05'),
    ).toThrow('A cheque cannot clear before it was deposited on 2026-09-05.');
  });

  it('skips the deposit rule when there is no deposit date', () => {
    expect(() =>
      assertChequeClearedDate('2026-09-02', '2026-09-01', null),
    ).not.toThrow();
  });

  // Due date is checked first, so its message is the one a caller sees.
  it('reports the due date when both rules are broken', () => {
    expect(() =>
      assertChequeClearedDate('2026-08-01', '2026-09-01', '2026-09-05'),
    ).toThrow(/due date/);
  });

  it('throws BadRequestException, which maps to 400', () => {
    expect(() =>
      assertChequeClearedDate('2026-08-31', '2026-09-01', null),
    ).toThrow(BadRequestException);
  });
});

describe('assertChequeDepositDate', () => {
  it('accepts a deposit on the added date itself', () => {
    expect(() =>
      assertChequeDepositDate('2026-08-01', '2026-08-01', '2026-09-01'),
    ).not.toThrow();
  });

  it('accepts a deposit on the cleared date itself', () => {
    expect(() =>
      assertChequeDepositDate('2026-09-01', '2026-08-01', '2026-09-01'),
    ).not.toThrow();
  });

  it('refuses a deposit before the cheque was added, naming that date', () => {
    expect(() =>
      assertChequeDepositDate('2026-07-31', '2026-08-01', '2026-09-01'),
    ).toThrow(
      'A cheque cannot be deposited before it was added on 2026-08-01.',
    );
  });

  it('refuses a deposit after it cleared, naming that date', () => {
    expect(() =>
      assertChequeDepositDate('2026-09-02', '2026-08-01', '2026-09-01'),
    ).toThrow('A cheque cannot be deposited after it cleared on 2026-09-01.');
  });

  // Added date is checked first, so its message is the one a caller sees.
  it('reports the added date when both rules are broken', () => {
    expect(() =>
      assertChequeDepositDate('2026-07-01', '2026-08-01', '2026-06-01'),
    ).toThrow(/before it was added/);
  });

  it('throws BadRequestException, which maps to 400', () => {
    expect(() =>
      assertChequeDepositDate('2026-07-31', '2026-08-01', '2026-09-01'),
    ).toThrow(BadRequestException);
  });
});
