import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  Company,
  SubscriptionTier,
} from '../../modules/companies/entities/company.entity';

export const TIER_FEATURE_MESSAGE = 'This plan does not include this feature.';

// The tier is not on the JWT, so every gated call reads it from the company row.
export async function assertTier(
  companyRepository: Repository<Company>,
  companyId: string,
  allowed: readonly SubscriptionTier[],
  message: string = TIER_FEATURE_MESSAGE,
): Promise<void> {
  const company = await companyRepository.findOne({
    where: { id: companyId },
    select: ['id', 'subscriptionTier'],
  });
  if (!company || !allowed.includes(company.subscriptionTier)) {
    throw new ForbiddenException(message);
  }
}
