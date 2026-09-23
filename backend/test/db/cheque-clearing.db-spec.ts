import { DataSource, EntityManager } from 'typeorm';
import { connectTestDatabase } from './test-data-source';
import { seedCompany, seeded as sharedSeeded } from './harness';
import {
  Cheque,
  ChequeStatus,
  ChequeType,
} from '../../src/modules/cheques/entities/cheque.entity';
import {
  Transaction,
  TransactionCategory,
  TransactionStatus,
  TransactionType,
  PaymentMethod,
} from '../../src/modules/financial/entities/transaction.entity';

// A partial unique index and a RESTRICT FK; only a real database can prove them.
describe('cheque clearing constraints against a real database', () => {
  let dataSource: DataSource;

  const DUBAI = 'dubai';

  beforeAll(async () => {
    dataSource = await connectTestDatabase();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  const seeded = <T>(run: (manager: EntityManager) => Promise<T>) =>
    sharedSeeded(dataSource, run);

  const company = (manager: EntityManager) =>
    seedCompany(manager, 'Cheque Co', [DUBAI]);

  async function cheque(manager: EntityManager, companyId: string) {
    return manager.getRepository(Cheque).save(
      manager.getRepository(Cheque).create({
        companyId,
        regionCode: DUBAI,
        chequeNumber: `CHQ-${Math.random().toString(36).slice(2, 8)}`,
        bankName: 'Test Bank',
        accountHolder: 'Test Account Holder',
        amount: 5000,
        currency: 'AED',
        dueDate: '2026-09-01',
        status: ChequeStatus.DEPOSITED,
        type: ChequeType.RENT,
      }),
    );
  }

  function payment(companyId: string, chequeId: string) {
    return {
      companyId,
      chequeId,
      type: TransactionType.INCOME,
      category: TransactionCategory.RENT,
      status: TransactionStatus.COMPLETED,
      amount: 5000,
      currency: 'AED',
      paymentMethod: PaymentMethod.CHEQUE,
      regionCode: DUBAI,
      transactionDate: '2026-09-10',
    };
  }

  it('rejects a second live transaction for the same cheque', async () => {
    await seeded(async (manager) => {
      const { id: companyId } = await company(manager);
      const row = await cheque(manager, companyId);
      const transactions = manager.getRepository(Transaction);

      await transactions.insert(payment(companyId, row.id));

      await expect(
        transactions.insert(payment(companyId, row.id)),
      ).rejects.toThrow(/UQ_TRANSACTIONS_ACTIVE_CHEQUE/);
    });
  });

  it('allows a new transaction once the first one is cancelled', async () => {
    await seeded(async (manager) => {
      const { id: companyId } = await company(manager);
      const row = await cheque(manager, companyId);
      const transactions = manager.getRepository(Transaction);

      const first = await transactions.insert(payment(companyId, row.id));
      const firstId = (first.identifiers[0] as { id: string }).id;
      await transactions.update(firstId, {
        status: TransactionStatus.CANCELLED,
      });

      await transactions.insert(payment(companyId, row.id));

      const live = await transactions.count({
        where: { chequeId: row.id, status: TransactionStatus.COMPLETED },
      });
      expect(live).toBe(1);
    });
  });

  it('refuses to delete a cheque that produced money', async () => {
    await seeded(async (manager) => {
      const { id: companyId } = await company(manager);
      const row = await cheque(manager, companyId);
      await manager
        .getRepository(Transaction)
        .insert(payment(companyId, row.id));

      await expect(
        manager.getRepository(Cheque).delete(row.id),
      ).rejects.toThrow(/FK_transactions_cheque/);
    });
  });
});
