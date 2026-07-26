import {
  Company,
  SubscriptionTier,
  FREE_AI_CREDITS,
  AI_CREDITS_PER_SEAT,
  ENTERPRISE_AI_CREDITS_PER_SEAT,
} from '@modules/companies/entities/company.entity';

/**
 * Returns the AI credit allowance for one billing period.
 * Pure function, no I/O. Safe to call from any module that has the Company object.
 *
 * FREE tier:       50 flat, regardless of seat count.
 * PRO tier:        purchasedSeats * 200.
 * ENTERPRISE tier: purchasedSeats * 500.
 *
 * Computed live rather than snapshotted, so a mid-period seat change applies
 * immediately. Same contract as getStorageQuotaBytes.
 */
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

/**
 * Adds whole months to `base`, keeping its day-of-month and clamping to the last
 * day of a shorter target month. Always measured from `base`, so an anchor on the
 * 31st gives Feb 28 and then Mar 31 again, never Mar 28. Matches Stripe's cycle.
 */
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

/**
 * Returns the credit period containing `now`, as [start, end).
 *
 * `anchor` is the company's billing cycle start: the period_start of its most
 * recent invoice, or company.createdAt when it has never been invoiced (FREE, or
 * paid before the first webhook lands).
 *
 * The anchor is rolled forward by whole months until it covers `now`, so a late
 * renewal webhook or a long-idle free account can never strand a company in an
 * expired period.
 */
export function getCreditPeriod(
  anchor: Date,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const base = new Date(anchor);

  // Clock skew or an anchor dated in the future: the first period starts at the anchor.
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
