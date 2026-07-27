import { getAiCreditAllowance, getCreditPeriod } from './ai-credit.util';
import {
  Company,
  SubscriptionTier,
} from '@modules/companies/entities/company.entity';

const company = (tier: SubscriptionTier, purchasedSeats: number): Company =>
  ({ subscriptionTier: tier, purchasedSeats }) as Company;

describe('getAiCreditAllowance', () => {
  it('gives FREE a flat 50 regardless of seat count', () => {
    expect(getAiCreditAllowance(company(SubscriptionTier.FREE, 1))).toBe(50);
    expect(getAiCreditAllowance(company(SubscriptionTier.FREE, 9))).toBe(50);
  });

  it('gives PRO 200 per purchased seat', () => {
    expect(getAiCreditAllowance(company(SubscriptionTier.PRO, 1))).toBe(200);
    expect(getAiCreditAllowance(company(SubscriptionTier.PRO, 4))).toBe(800);
  });

  it('gives ENTERPRISE 500 per purchased seat', () => {
    expect(getAiCreditAllowance(company(SubscriptionTier.ENTERPRISE, 1))).toBe(
      500,
    );
    expect(getAiCreditAllowance(company(SubscriptionTier.ENTERPRISE, 3))).toBe(
      1500,
    );
  });

  it('floors seats at 1 so a zero-seat row cannot zero the allowance', () => {
    expect(getAiCreditAllowance(company(SubscriptionTier.PRO, 0))).toBe(200);
  });
});

describe('getCreditPeriod', () => {
  it('returns the anchor month when now is inside the first period', () => {
    const anchor = new Date('2026-07-09T10:00:00.000Z');
    const period = getCreditPeriod(
      anchor,
      new Date('2026-07-20T00:00:00.000Z'),
    );
    expect(period.start.toISOString()).toBe('2026-07-09T10:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-08-09T10:00:00.000Z');
  });

  it('rolls forward by whole months for a long-idle anchor', () => {
    const anchor = new Date('2026-01-09T10:00:00.000Z');
    const period = getCreditPeriod(
      anchor,
      new Date('2026-07-20T00:00:00.000Z'),
    );
    expect(period.start.toISOString()).toBe('2026-07-09T10:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-08-09T10:00:00.000Z');
  });

  it('treats the exact period end as the start of the next period', () => {
    const anchor = new Date('2026-07-09T10:00:00.000Z');
    const period = getCreditPeriod(
      anchor,
      new Date('2026-08-09T10:00:00.000Z'),
    );
    expect(period.start.toISOString()).toBe('2026-08-09T10:00:00.000Z');
  });

  it('includes the exact period start', () => {
    const anchor = new Date('2026-07-09T10:00:00.000Z');
    const period = getCreditPeriod(
      anchor,
      new Date('2026-07-09T10:00:00.000Z'),
    );
    expect(period.start.toISOString()).toBe('2026-07-09T10:00:00.000Z');
  });

  it('clamps a 31st anchor to the last day of a shorter month', () => {
    const anchor = new Date('2026-01-31T00:00:00.000Z');
    // Feb 15 still belongs to the period that opened Jan 31; it closes Feb 28.
    const period = getCreditPeriod(
      anchor,
      new Date('2026-02-15T00:00:00.000Z'),
    );
    expect(period.start.toISOString()).toBe('2026-01-31T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-02-28T00:00:00.000Z');

    const next = getCreditPeriod(anchor, new Date('2026-03-01T00:00:00.000Z'));
    expect(next.start.toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(next.end.toISOString()).toBe('2026-03-31T00:00:00.000Z');
  });

  it('returns to the 31st after a clamped month rather than staying clamped', () => {
    const anchor = new Date('2026-01-31T00:00:00.000Z');
    const period = getCreditPeriod(
      anchor,
      new Date('2026-03-31T12:00:00.000Z'),
    );
    expect(period.start.toISOString()).toBe('2026-03-31T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-04-30T00:00:00.000Z');
  });

  it('crosses a year boundary', () => {
    const anchor = new Date('2026-11-15T00:00:00.000Z');
    const period = getCreditPeriod(
      anchor,
      new Date('2027-02-01T00:00:00.000Z'),
    );
    expect(period.start.toISOString()).toBe('2027-01-15T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2027-02-15T00:00:00.000Z');
  });

  it('starts at the anchor when the anchor is in the future', () => {
    const anchor = new Date('2026-08-01T00:00:00.000Z');
    const period = getCreditPeriod(
      anchor,
      new Date('2026-07-20T00:00:00.000Z'),
    );
    expect(period.start.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('produces a period containing now at every sampled point over 400 days', () => {
    const anchor = new Date('2026-01-31T23:30:00.000Z');
    for (let day = 1; day <= 400; day += 7) {
      const now = new Date(anchor.getTime() + day * 24 * 60 * 60 * 1000);
      const { start, end } = getCreditPeriod(anchor, now);
      expect(start.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(end.getTime()).toBeGreaterThan(now.getTime());
    }
  });
});
