import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  Company,
  SubscriptionTier,
} from '../../modules/companies/entities/company.entity';
import { assertTier, TIER_FEATURE_MESSAGE } from './tier.util';

describe('assertTier', () => {
  const companyId = 'company-uuid-1';
  let repo: jest.Mocked<Pick<Repository<Company>, 'findOne'>>;

  beforeEach(() => {
    repo = { findOne: jest.fn() };
  });

  function withTier(tier: SubscriptionTier) {
    repo.findOne.mockResolvedValue({
      id: companyId,
      subscriptionTier: tier,
    } as Company);
  }

  it('allows a listed tier', async () => {
    withTier(SubscriptionTier.ENTERPRISE);
    await expect(
      assertTier(repo as unknown as Repository<Company>, companyId, [
        SubscriptionTier.ENTERPRISE,
      ]),
    ).resolves.toBeUndefined();
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: companyId },
      select: ['id', 'subscriptionTier'],
    });
  });

  it('refuses a tier that is not listed with the plain message', async () => {
    withTier(SubscriptionTier.PRO);
    await expect(
      assertTier(repo as unknown as Repository<Company>, companyId, [
        SubscriptionTier.ENTERPRISE,
      ]),
    ).rejects.toThrow(new ForbiddenException(TIER_FEATURE_MESSAGE));
  });

  it('refuses a missing company and keeps a custom message', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(
      assertTier(
        repo as unknown as Repository<Company>,
        companyId,
        [SubscriptionTier.PRO],
        'Custom',
      ),
    ).rejects.toThrow(new ForbiddenException('Custom'));
  });
});
