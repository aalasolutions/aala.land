import { SubscriptionTier } from '../../modules/companies/entities/company.entity';

// Import narrows to [ENTERPRISE] before launch; controllers and specs read this map, nothing else hardcodes a tier.
export const TRANSFER_TIERS: Record<
  'import' | 'export',
  readonly SubscriptionTier[]
> = {
  import: [SubscriptionTier.PRO, SubscriptionTier.ENTERPRISE],
  export: [SubscriptionTier.PRO, SubscriptionTier.ENTERPRISE],
};
