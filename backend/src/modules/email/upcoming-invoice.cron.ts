import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { errorMessage } from '@shared/utils/error.util';
import { Company } from '../companies/entities/company.entity';
import { SystemEmailService } from './system-email.service';

interface RenewalRow {
  id: string;
  period_end: Date;
  amount: number | null;
  currency: string | null;
}

// Reads renewal date from billing_history, not a webhook; dedup crosses the window once daily.
@Injectable()
export class UpcomingInvoiceCron {
  private readonly logger = new Logger(UpcomingInvoiceCron.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly email: SystemEmailService,
  ) {}

  // 09:00 UTC daily.
  @Cron('0 9 * * *', { timeZone: 'UTC' })
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
          `Renewal reminder failed for company ${row.id}: ${errorMessage(err)}`,
        );
      }
    }
  }

  // Scheduled downgrades aren't tracked on the company; an ending plan may still get a reminder.
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
