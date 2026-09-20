import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingHistory } from './entities/billing-history.entity';
import {
  PaymentSucceededEvent,
  PaymentFailedEvent,
} from './events/billing-events';
import { clampLimit, paginationOptions } from '@shared/utils/pagination.util';

type PaymentEvent = PaymentSucceededEvent | PaymentFailedEvent;

@Injectable()
export class BillingHistoryService {
  private readonly logger = new Logger(BillingHistoryService.name);

  constructor(
    @InjectRepository(BillingHistory)
    private readonly historyRepo: Repository<BillingHistory>,
  ) {}

  /** Raw SQL: TypeORM upsert() can't express the recency-guarded conditional UPDATE needed here. */
  async recordPayment(event: PaymentEvent): Promise<void> {
    if (!event.invoiceId) {
      this.logger.warn(
        `${event.name} for company ${event.companyId} has no invoiceId; skipping billing-history record`,
      );
      return;
    }

    const type =
      event.name === 'PaymentSucceeded'
        ? 'payment_succeeded'
        : 'payment_failed';
    const attemptCount =
      event.name === 'PaymentFailed' ? event.attemptCount : null;

    await this.historyRepo.query(
      `
            INSERT INTO billing_history
                (company_id, stripe_invoice_id, type, amount, currency,
                 hosted_invoice_url, invoice_pdf_url, period_start, period_end,
                 attempt_count, occurred_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (stripe_invoice_id, type) DO UPDATE SET
                company_id = EXCLUDED.company_id,
                amount = EXCLUDED.amount,
                currency = EXCLUDED.currency,
                hosted_invoice_url = EXCLUDED.hosted_invoice_url,
                invoice_pdf_url = EXCLUDED.invoice_pdf_url,
                period_start = EXCLUDED.period_start,
                period_end = EXCLUDED.period_end,
                attempt_count = EXCLUDED.attempt_count,
                occurred_at = EXCLUDED.occurred_at
            WHERE billing_history.occurred_at <= EXCLUDED.occurred_at
            `,
      [
        event.companyId,
        event.invoiceId,
        type,
        event.amount,
        event.currency,
        event.hostedInvoiceUrl,
        event.invoicePdfUrl,
        event.periodStart,
        event.periodEnd,
        attemptCount,
        event.occurredAt,
      ],
    );
  }

  /** undefined companyId means SUPER_ADMIN viewing all companies. */
  async listBillingHistory(
    companyId: string | undefined,
    page = 1,
    limit = 20,
  ): Promise<{
    data: BillingHistory[];
    total: number;
    page: number;
    limit: number;
  }> {
    // Clamp so a caller can't request the whole table or a negative OFFSET.
    const safePage = Math.max(1, Math.trunc(page) || 1);
    const safeLimit = clampLimit(limit);
    const [data, total] = await this.historyRepo.findAndCount({
      where: companyId ? { companyId } : {},
      order: { occurredAt: 'DESC' },
      ...paginationOptions(safePage, safeLimit),
    });
    return { data, total, page: safePage, limit: safeLimit };
  }
}
