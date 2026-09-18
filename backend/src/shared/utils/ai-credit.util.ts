import {
  Company,
  SubscriptionTier,
  FREE_AI_CREDITS,
  AI_CREDITS_PER_SEAT,
  ENTERPRISE_AI_CREDITS_PER_SEAT,
} from '@modules/companies/entities/company.entity';
import { addMonthsToInstant, monthsBetweenInstants } from './region-time.util';

export function getAiCreditAllowance(company: Company): number {
  const tier = company.subscriptionTier;
  if (tier === SubscriptionTier.FREE) {
    return FREE_AI_CREDITS;
  }
  if (tier === SubscriptionTier.ENTERPRISE) {
    return Math.max(company.purchasedSeats, 1) * ENTERPRISE_AI_CREDITS_PER_SEAT;
  }
  return Math.max(company.purchasedSeats, 1) * AI_CREDITS_PER_SEAT;
}

export function getCreditPeriod(
  anchor: Date,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const base = new Date(anchor);

  if (now.getTime() < base.getTime()) {
    return { start: base, end: addMonthsToInstant(base, 1) };
  }

  let months = monthsBetweenInstants(base, now);
  if (months < 0) months = 0;

  let start = addMonthsToInstant(base, months);
  while (start.getTime() > now.getTime()) {
    months -= 1;
    start = addMonthsToInstant(base, months);
  }

  let end = addMonthsToInstant(base, months + 1);
  while (end.getTime() <= now.getTime()) {
    months += 1;
    start = addMonthsToInstant(base, months);
    end = addMonthsToInstant(base, months + 1);
  }

  return { start, end };
}
