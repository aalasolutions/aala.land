import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Company } from '../companies/entities/company.entity';
import { SystemEmailService } from './system-email.service';

interface RenewalRow {
  id: string;
  period_end: Date;
  amount: number | null;
  currency: string | null;
}

/**
 * Daily reminder for subscriptions renewing soon. Reads the renewal date from
 * our own billing_history (the latest paid invoice's period_end) instead of a
 * Stripe invoice.upcoming webhook, so it needs no new normalized billing event
 * and never touches the frozen billing contract.
 *
 * Dedup without a marker column: the query only matches renewals that are
 * between 2 and 3 days away. Because the cron runs once a day, each subscription
 * falls inside that 24h band on exactly one run, so it is reminded once (about
 * 2-3 days before renewal). period_end alone is enough. NOTE: this assumes a
 * single scheduler instance (prod runs one backend container); a horizontally
 * scaled deployment would need a distributed lock to avoid duplicate sends.
 */
@Injectable()
export class UpcomingInvoiceCron {
  private readonly logger = new Logger(UpcomingInvoiceCron.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly email: SystemEmailService,
  ) {}

  // 09:00 server time daily.
  @Cron('0 9 * * *')
  async run(): Promise<void> {
    const candidates = await this.findRenewingSoon();
    if (candidates.length === 0) return;
    this.logger.log(
      `Upcoming-invoice reminders: ${candidates.length} candidate(s)`,
    );

    for (const row of candidates) {
      try {
        await this.email.sendUpcomingInvoiceToCompany(
          row.id,
          row.period_end,
          row.amount,
          row.currency,
        );
      } catch (err) {
        this.logger.error(
          `Renewal reminder failed for company ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /**
   * Active subscribers whose latest paid invoice period ends 2-3 days out.
   * Scheduled downgrades (cancel_at_period_end) are not tracked on the company,
   * so a company ending its plan this period may still get one reminder; that is
   * an accepted limitation until cancel state is persisted.
   */
  private async findRenewingSoon(): Promise<RenewalRow[]> {
    return this.companyRepo.query(
      `
      SELECT c.id, bh.period_end, bh.amount, bh.currency
      FROM companies c
      JOIN LATERAL (
        SELECT period_end, amount, currency
        FROM billing_history
        WHERE company_id = c.id
          AND type = 'payment_succeeded'
          AND period_end IS NOT NULL
        ORDER BY occurred_at DESC
        LIMIT 1
      ) bh ON true
      WHERE c.billing_subscription_id IS NOT NULL
        AND c.billing_status = 'active'
        AND c.subscription_tier <> 'FREE'
        AND bh.period_end >= now() + interval '2 days'
        AND bh.period_end <  now() + interval '3 days'
      `,
    );
  }
}
