import { DataSource, EntityManager } from 'typeorm';
import { connectTestDatabase } from './test-data-source';
import { Company } from '../../src/modules/companies/entities/company.entity';
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

// The double-count guard is a partial unique index and a RESTRICT foreign key.
// Neither exists in TypeScript, so only a real database can prove them.
describe('cheque clearing constraints against a real database', () => {
  let dataSource: DataSource;

  const DUBAI = 'dubai';

  beforeAll(async () => {
    dataSource = await connectTestDatabase();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  class Rollback extends Error {}

  // Every case seeds, asserts and rolls back, so the database is unchanged either way.
  async function seeded(run: (manager: EntityManager) => Promise<void>) {
    try {
      await dataSource.transaction(async (manager) => {
        await run(manager);
        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }
  }

  async function company(manager: EntityManager) {
    const suffix = Math.random().toString(36).slice(2, 10);
    return manager.getRepository(Company).save(
      manager.getRepository(Company).create({
        name: `Cheque Co ${suffix}`,
        slug: `cheque-co-${suffix}`,
        activeRegions: [DUBAI],
        defaultRegionCode: DUBAI,
      }),
    );
  }

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
