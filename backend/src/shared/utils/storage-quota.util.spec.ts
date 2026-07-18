import { getStorageQuotaBytes, reserveStorage } from './storage-quota.util';
import {
  Company,
  SubscriptionTier,
  FREE_STORAGE_BYTES,
  BYTES_PER_SEAT,
  ENTERPRISE_BYTES_PER_SEAT,
} from '@modules/companies/entities/company.entity';

const makeCompany = (overrides: Partial<Company> = {}): Company =>
  ({
    id: 'company-1',
    storageUsedBytes: 0 as any,
    purchasedSeats: 1,
    subscriptionTier: SubscriptionTier.FREE,
    ...overrides,
  }) as Company;

describe('getStorageQuotaBytes', () => {
  it('returns FREE_STORAGE_BYTES for FREE tier regardless of seat count', () => {
    const company = makeCompany({
      subscriptionTier: SubscriptionTier.FREE,
      purchasedSeats: 10,
    });
    expect(getStorageQuotaBytes(company)).toBe(FREE_STORAGE_BYTES);
  });

  it('returns purchasedSeats * BYTES_PER_SEAT for PRO tier', () => {
    const company = makeCompany({
      subscriptionTier: SubscriptionTier.PRO,
      purchasedSeats: 5,
    });
    expect(getStorageQuotaBytes(company)).toBe(5 * BYTES_PER_SEAT);
  });

  it('returns purchasedSeats * ENTERPRISE_BYTES_PER_SEAT for ENTERPRISE tier', () => {
    const company = makeCompany({
      subscriptionTier: SubscriptionTier.ENTERPRISE,
      purchasedSeats: 3,
    });
    expect(getStorageQuotaBytes(company)).toBe(3 * ENTERPRISE_BYTES_PER_SEAT);
  });

  it('treats purchasedSeats < 1 as 1 seat for PRO tier', () => {
    const company = makeCompany({
      subscriptionTier: SubscriptionTier.PRO,
      purchasedSeats: 0,
    });
    expect(getStorageQuotaBytes(company)).toBe(BYTES_PER_SEAT);
  });

  it('treats purchasedSeats < 1 as 1 seat for ENTERPRISE tier', () => {
    const company = makeCompany({
      subscriptionTier: SubscriptionTier.ENTERPRISE,
      purchasedSeats: 0,
    });
    expect(getStorageQuotaBytes(company)).toBe(ENTERPRISE_BYTES_PER_SEAT);
  });
});

describe('reserveStorage', () => {
  // The real query builder evaluates the `storage_used_bytes + :incomingBytes <= :quotaBytes`
  // WHERE clause in Postgres. The mock can't run SQL, so each test tells the mocked
  // `execute()` whether that condition would have matched (affected: 1) or not (affected: 0),
  // mirroring what the real atomic UPDATE would decide.
  const makeRepo = (company: Partial<Company> | null, affected: number) => {
    const queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected }),
    };
    return {
      findOne: jest
        .fn()
        .mockResolvedValue(company ? makeCompany(company) : null),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      __queryBuilder: queryBuilder,
    };
  };

  it('resolves and reserves when projected usage is within quota', async () => {
    const repo = makeRepo({ storageUsedBytes: 100 as any }, 1);
    await expect(
      reserveStorage(repo as any, 'company-1', 500),
    ).resolves.toBeUndefined();
    expect(repo.__queryBuilder.execute).toHaveBeenCalled();
  });

  it('throws 507 and does not reserve when projected usage exceeds quota', async () => {
    const repo = makeRepo(
      {
        storageUsedBytes: FREE_STORAGE_BYTES as any,
        subscriptionTier: SubscriptionTier.FREE,
      },
      0,
    );

    await expect(
      reserveStorage(repo as any, 'company-1', 1),
    ).rejects.toMatchObject({
      status: 507,
    });
  });

  it('throws 507 exactly at the quota boundary (used + incoming > quota)', async () => {
    const repo = makeRepo(
      {
        storageUsedBytes: (FREE_STORAGE_BYTES - 10) as any,
        subscriptionTier: SubscriptionTier.FREE,
      },
      0,
    );

    await expect(
      reserveStorage(repo as any, 'company-1', 11),
    ).rejects.toMatchObject({
      status: 507,
    });
  });

  it('resolves when used + incoming equals quota exactly', async () => {
    const repo = makeRepo(
      {
        storageUsedBytes: (FREE_STORAGE_BYTES - 10) as any,
        subscriptionTier: SubscriptionTier.FREE,
      },
      1,
    );

    await expect(
      reserveStorage(repo as any, 'company-1', 10),
    ).resolves.toBeUndefined();
  });

  it('throws NotFoundException when company is not found', async () => {
    const repo = makeRepo(null, 1);
    await expect(reserveStorage(repo as any, 'bad-id', 100)).rejects.toThrow(
      'Company not found',
    );
  });
});
