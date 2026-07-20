import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Company } from '@modules/companies/entities/company.entity';
import { CustomDeal } from '@modules/console/entities/custom-deal.entity';
import { LockLift } from '@modules/console/entities/lock-lift.entity';
import { ManualPayment } from '@modules/console/entities/manual-payment.entity';

/** Subscription statuses that count as genuinely paying via the card rail. */
const PAYING_STATUSES = ['active', 'trialing'];

export interface CompanyLockState {
  /** Writes blocked; reads and export stay (ratified lock scope, ruling 9). */
  locked: boolean;
  /** A super admin lifted the lock; writes work until liftUntil. */
  lifted: boolean;
  liftUntil: string | null;
  /** The expired deal's until-date (context for banners and the lock card). */
  dealExpiredAt: string | null;
}

export const UNLOCKED: CompanyLockState = {
  locked: false,
  lifted: false,
  liftUntil: null,
  dealExpiredAt: null,
};

/**
 * READ-TIME lock evaluation (no scheduler, owner preference). A company is
 * write-locked when its custom deal expired (until-date passed) and nothing
 * re-opened it:
 *   1. a live paying card subscription (a genuinely paying company is never
 *      locked by a stale deal record),
 *   2. a manual payment whose covers-period reaches today ("unless a deal or
 *      payment lands", design 8.1),
 *   3. an unexpired, un-ended lock lift (grace, auto re-lock at lift_until).
 * Ending a deal early (ended_at set) removes the deal entirely and never
 * locks; only EXPIRY locks (ruling 9).
 */
@Injectable()
export class LockStateService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(CustomDeal)
    private readonly dealRepo: Repository<CustomDeal>,
    @InjectRepository(LockLift)
    private readonly liftRepo: Repository<LockLift>,
    @InjectRepository(ManualPayment)
    private readonly paymentRepo: Repository<ManualPayment>,
  ) {}

  /** Lock state for one company. Fast path (no active deal) is one indexed query. */
  async getLockState(companyId: string): Promise<CompanyLockState> {
    const deal = await this.dealRepo.findOne({
      where: { companyId, endedAt: IsNull() },
    });
    if (!this.isExpired(deal)) return UNLOCKED;

    const company = await this.companyRepo.findOne({
      where: { id: companyId },
      select: ['id', 'billingSubscriptionId', 'billingStatus'],
    });
    if (company && this.isPayingByCard(company)) return UNLOCKED;

    if (await this.hasCoveringManualPayment(companyId)) return UNLOCKED;

    const lift = await this.findActiveLift(companyId);
    const dealExpiredAt = deal.untilDate!.toISOString();
    if (lift) {
      return {
        locked: false,
        lifted: true,
        liftUntil: lift.liftUntil.toISOString(),
        dealExpiredAt,
      };
    }
    return { locked: true, lifted: false, liftUntil: null, dealExpiredAt };
  }

  /**
   * Batch evaluation for the console companies list. Also returns each
   * company's active deal so the list can render badges without re-querying.
   */
  async getLockStates(companies: Company[]): Promise<{
    states: Map<string, CompanyLockState>;
    activeDeals: Map<string, CustomDeal>;
  }> {
    const states = new Map<string, CompanyLockState>();
    const activeDeals = new Map<string, CustomDeal>();
    if (companies.length === 0) return { states, activeDeals };

    const ids = companies.map((c) => c.id);
    const deals = await this.dealRepo.find({
      where: { companyId: In(ids), endedAt: IsNull() },
    });
    for (const deal of deals) activeDeals.set(deal.companyId, deal);

    const expired = deals.filter((d) => this.isExpired(d));
    const companyById = new Map(companies.map((c) => [c.id, c]));
    // Companies that still need the payment/lift checks after the card-rail shortcut.
    const pending = expired.filter((d) => {
      const company = companyById.get(d.companyId);
      return !(company && this.isPayingByCard(company));
    });

    let coveredIds = new Set<string>();
    const liftByCompany = new Map<string, LockLift>();
    if (pending.length > 0) {
      const pendingIds = pending.map((d) => d.companyId);
      const covered = await this.paymentRepo
        .createQueryBuilder('mp')
        .select('DISTINCT mp.company_id', 'companyId')
        .where('mp.company_id IN (:...ids)', { ids: pendingIds })
        .andWhere('mp.covers_end >= CURRENT_DATE')
        .getRawMany<{ companyId: string }>();
      coveredIds = new Set(covered.map((r) => r.companyId));

      const lifts = await this.liftRepo.find({
        where: { companyId: In(pendingIds), endedAt: IsNull() },
        order: { liftUntil: 'DESC' },
      });
      const now = new Date();
      for (const lift of lifts) {
        if (lift.liftUntil > now && !liftByCompany.has(lift.companyId)) {
          liftByCompany.set(lift.companyId, lift);
        }
      }
    }

    for (const company of companies) {
      const deal = activeDeals.get(company.id);
      if (
        !deal ||
        !this.isExpired(deal) ||
        this.isPayingByCard(company) ||
        coveredIds.has(company.id)
      ) {
        states.set(company.id, UNLOCKED);
        continue;
      }
      const lift = liftByCompany.get(company.id);
      const dealExpiredAt = deal.untilDate!.toISOString();
      states.set(
        company.id,
        lift
          ? {
              locked: false,
              lifted: true,
              liftUntil: lift.liftUntil.toISOString(),
              dealExpiredAt,
            }
          : { locked: true, lifted: false, liftUntil: null, dealExpiredAt },
      );
    }
    return { states, activeDeals };
  }

  /** The current (un-ended, unexpired) lift for a company, or null. */
  async findActiveLift(companyId: string): Promise<LockLift | null> {
    const lifts = await this.liftRepo.find({
      where: { companyId, endedAt: IsNull() },
      order: { liftUntil: 'DESC' },
      take: 1,
    });
    const lift = lifts[0] ?? null;
    return lift && lift.liftUntil > new Date() ? lift : null;
  }

  private isExpired(deal: CustomDeal | null | undefined): deal is CustomDeal {
    return !!deal?.untilDate && deal.untilDate <= new Date();
  }

  private isPayingByCard(
    company: Pick<Company, 'billingSubscriptionId' | 'billingStatus'>,
  ): boolean {
    return (
      !!company.billingSubscriptionId &&
      PAYING_STATUSES.includes(company.billingStatus ?? '')
    );
  }

  private async hasCoveringManualPayment(companyId: string): Promise<boolean> {
    const covered = await this.paymentRepo
      .createQueryBuilder('mp')
      .where('mp.company_id = :companyId', { companyId })
      .andWhere('mp.covers_end >= CURRENT_DATE')
      .getExists();
    return covered;
  }
}
