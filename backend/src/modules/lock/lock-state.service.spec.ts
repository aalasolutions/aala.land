import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Company } from '@modules/companies/entities/company.entity';
import { CustomDeal } from '@modules/console/entities/custom-deal.entity';
import { LockLift } from '@modules/console/entities/lock-lift.entity';
import { ManualPayment } from '@modules/console/entities/manual-payment.entity';
import { LockStateService } from './lock-state.service';

const DAY = 24 * 60 * 60 * 1000;

function deal(overrides: Partial<CustomDeal> = {}): CustomDeal {
  return {
    id: 'deal-1',
    companyId: 'co-1',
    priceAmount: 100000,
    currency: 'pkr',
    basis: 'per_seat',
    seatCap: 5,
    untilDate: new Date(Date.now() - DAY),
    whyNote: 'PK team',
    grantedBy: 'op-1',
    grantedByEmail: 'aamir@aala.land',
    updatedBy: null,
    updatedByEmail: null,
    endedAt: null,
    endedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CustomDeal;
}

describe('LockStateService', () => {
  let service: LockStateService;
  let companyRepo: { findOne: jest.Mock };
  let dealRepo: { findOne: jest.Mock; find: jest.Mock };
  let liftRepo: { find: jest.Mock };
  let paymentRepo: { createQueryBuilder: jest.Mock };
  let queryExists: jest.Mock;

  beforeEach(async () => {
    queryExists = jest.fn().mockResolvedValue(false);
    const qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getExists: queryExists,
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    companyRepo = { findOne: jest.fn().mockResolvedValue(null) };
    dealRepo = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    liftRepo = { find: jest.fn().mockResolvedValue([]) };
    paymentRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LockStateService,
        { provide: getRepositoryToken(Company), useValue: companyRepo },
        { provide: getRepositoryToken(CustomDeal), useValue: dealRepo },
        { provide: getRepositoryToken(LockLift), useValue: liftRepo },
        { provide: getRepositoryToken(ManualPayment), useValue: paymentRepo },
      ],
    }).compile();

    service = module.get(LockStateService);
  });

  it('is unlocked when the company has no active deal', async () => {
    dealRepo.findOne.mockResolvedValue(null);
    const state = await service.getLockState('co-1');
    expect(state).toEqual({
      locked: false,
      lifted: false,
      liftUntil: null,
      dealExpiredAt: null,
    });
    // Fast path: no further queries fired.
    expect(companyRepo.findOne).not.toHaveBeenCalled();
  });

  it('is unlocked for a lifetime deal (no until-date)', async () => {
    dealRepo.findOne.mockResolvedValue(deal({ untilDate: null }));
    const state = await service.getLockState('co-1');
    expect(state.locked).toBe(false);
  });

  it('is unlocked while the deal until-date is in the future', async () => {
    dealRepo.findOne.mockResolvedValue(
      deal({ untilDate: new Date(Date.now() + 30 * DAY) }),
    );
    const state = await service.getLockState('co-1');
    expect(state.locked).toBe(false);
  });

  it('LOCKS when the deal expired and nothing re-opened it', async () => {
    dealRepo.findOne.mockResolvedValue(deal());
    const state = await service.getLockState('co-1');
    expect(state.locked).toBe(true);
    expect(state.lifted).toBe(false);
    expect(state.dealExpiredAt).toBeTruthy();
  });

  it('stays unlocked when a live paying card subscription exists (stale deal safeguard)', async () => {
    dealRepo.findOne.mockResolvedValue(deal());
    companyRepo.findOne.mockResolvedValue({
      id: 'co-1',
      billingSubscriptionId: 'sub_1',
      billingStatus: 'active',
    });
    const state = await service.getLockState('co-1');
    expect(state.locked).toBe(false);
  });

  it('unlocks when a manual payment covers today (payment landed)', async () => {
    dealRepo.findOne.mockResolvedValue(deal());
    queryExists.mockResolvedValue(true);
    const state = await service.getLockState('co-1');
    expect(state.locked).toBe(false);
    expect(state.lifted).toBe(false);
  });

  it('reports LIFTED while an un-ended future lift exists', async () => {
    dealRepo.findOne.mockResolvedValue(deal());
    const liftUntil = new Date(Date.now() + 5 * DAY);
    liftRepo.find.mockResolvedValue([
      { id: 'lift-1', companyId: 'co-1', liftUntil, endedAt: null },
    ]);
    const state = await service.getLockState('co-1');
    expect(state.locked).toBe(false);
    expect(state.lifted).toBe(true);
    expect(state.liftUntil).toBe(liftUntil.toISOString());
  });

  it('re-locks automatically when the lift date has passed (no scheduler)', async () => {
    dealRepo.findOne.mockResolvedValue(deal());
    liftRepo.find.mockResolvedValue([
      {
        id: 'lift-1',
        companyId: 'co-1',
        liftUntil: new Date(Date.now() - DAY),
        endedAt: null,
      },
    ]);
    const state = await service.getLockState('co-1');
    expect(state.locked).toBe(true);
    expect(state.lifted).toBe(false);
  });

  describe('getLockStates (batch)', () => {
    it('evaluates each company and returns active deals for badges', async () => {
      const companies = [
        {
          id: 'co-1',
          billingSubscriptionId: null,
          billingStatus: null,
        } as unknown as Company,
        {
          id: 'co-2',
          billingSubscriptionId: null,
          billingStatus: null,
        } as unknown as Company,
      ];
      dealRepo.find.mockResolvedValue([
        deal({ id: 'd1', companyId: 'co-1' }),
        deal({
          id: 'd2',
          companyId: 'co-2',
          untilDate: new Date(Date.now() + 30 * DAY),
        }),
      ]);
      const { states, activeDeals } = await service.getLockStates(companies);
      expect(states.get('co-1')!.locked).toBe(true);
      expect(states.get('co-2')!.locked).toBe(false);
      expect(activeDeals.get('co-1')!.id).toBe('d1');
      expect(activeDeals.get('co-2')!.id).toBe('d2');
    });
  });
});
