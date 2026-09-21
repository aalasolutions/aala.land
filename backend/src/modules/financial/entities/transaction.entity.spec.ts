import { getMetadataArgsStorage } from 'typeorm';
import { Transaction } from './transaction.entity';

// Pins the date model: one date for when the money arrived, one for when it is expected.
describe('Transaction date columns', () => {
  const columnNames = (): string[] =>
    getMetadataArgsStorage()
      .columns.filter((column) => column.target === Transaction)
      .map((column) => column.options.name ?? column.propertyName);

  it('carries exactly four date columns', () => {
    const dates = columnNames().filter((name) => /_at$|_date$/.test(name));

    expect(dates.sort()).toEqual([
      'created_at',
      'due_date',
      'transaction_date',
      'updated_at',
    ]);
  });

  it('has no second column for the day the money arrived', () => {
    expect(columnNames()).not.toContain('paid_at');
    expect(columnNames()).not.toContain('business_date');
  });

  it('allows an empty transaction_date, since a pending row has no arrival yet', () => {
    const column = getMetadataArgsStorage().columns.find(
      (entry) =>
        entry.target === Transaction &&
        entry.options.name === 'transaction_date',
    );

    expect(column?.options.nullable).toBe(true);
  });
});
