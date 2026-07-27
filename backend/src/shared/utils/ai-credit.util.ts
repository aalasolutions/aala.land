import {
  Company,
  SubscriptionTier,
  FREE_AI_CREDITS,
  AI_CREDITS_PER_SEAT,
  ENTERPRISE_AI_CREDITS_PER_SEAT,
} from '@modules/companies/entities/company.entity';

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

function addMonthsClamped(base: Date, months: number): Date {
  const day = base.getUTCDate();
  const target = new Date(
    Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth() + months,
      1,
      base.getUTCHours(),
      base.getUTCMinutes(),
      base.getUTCSeconds(),
      base.getUTCMilliseconds(),
    ),
  );
  const lastDayOfTargetMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return target;
}

export function getCreditPeriod(
  anchor: Date,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const base = new Date(anchor);

  if (now.getTime() < base.getTime()) {
    return { start: base, end: addMonthsClamped(base, 1) };
  }

  let months =
    (now.getUTCFullYear() - base.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - base.getUTCMonth());
  if (months < 0) months = 0;

  let start = addMonthsClamped(base, months);
  while (start.getTime() > now.getTime()) {
    months -= 1;
    start = addMonthsClamped(base, months);
  }

  let end = addMonthsClamped(base, months + 1);
  while (end.getTime() <= now.getTime()) {
    months += 1;
    start = addMonthsClamped(base, months);
    end = addMonthsClamped(base, months + 1);
  }

  return { start, end };
}
