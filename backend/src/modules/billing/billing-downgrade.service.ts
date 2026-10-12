import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { withCompanyLock } from '@shared/utils/company-lock.util';
import { errorMessage } from '@shared/utils/error.util';
import { Company } from '../companies/entities/company.entity';
import { User } from '../users/entities/user.entity';
import {
  PaymentRemedy,
  RemedyStatus,
} from '../console/entities/payment-remedy.entity';
import {
  BillingHistory,
  BillingRefundStatus,
} from './entities/billing-history.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/dto/query-audit-logs.dto';
import {
  BILLING_PROVIDER,
  BillingProvider,
  PeriodPayments,
  RefundState,
  SubscriptionRef,
} from './provider/billing-provider.interface';
import { RefundUpdatedEvent } from './events/billing-events';
import { BillingNotices } from './events/billing-notices';
import { BillingHistoryService } from './billing-history.service';
import { liveRefundTotals } from './live-refunds.util';
import {
  allocateCancelRefund,
  computeCancelRefund,
  RefundablePayment,
} from './cancel-refund.util';

export const DOWNGRADE_DELAY_MS = 48 * 60 * 60 * 1000;

/** The provider refuses card refunds on transactions older than this. */
export const REFUND_WINDOW_MS = 120 * 24 * 60 * 60 * 1000;

export const MAX_PROVIDER_ATTEMPTS = 5;

/** A due request waits this long for an unrecorded renewal payment. */
export const RENEWAL_WAIT_MS = 6 * 60 * 60 * 1000;

export interface DowngradeRequest {
  downgradeRequestedAt: string | null;
  downgradeEffectiveAt: string | null;
}

export function downgradeEffectiveAt(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + DOWNGRADE_DELAY_MS);
}

const CANCEL_REFUND_NOTE = 'Refund of unused days after downgrade to Free';

export const DROP_REASONS = {
  teamGrew:
    'Your company has more than one active user again, and the Free plan allows one.',
  subscriptionChanged:
    'Your subscription changed after the request, so the request no longer applies.',
  cancelFailed: 'We could not end the plan with our payment provider.',
} as const;

const NO_REQUEST = {
  downgradeRequestedAt: null,
  downgradeRequestedBy: null,
  downgradeSubscriptionId: null,
  downgradeAttempts: 0,
} as const;

const SUPERSEDED_NOTE =
  'Superseded: a renewal came before the cancel succeeded; never sent.';

const SETTLE_FROM: Record<Exclude<RefundState, 'pending'>, RemedyStatus[]> = {
  approved: ['queued', 'initiated', 'failed'],
  rejected: ['queued', 'initiated'],
  reversed: ['queued', 'initiated', 'approved'],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function remedyStatusOf(state: RefundState): RemedyStatus {
  return state === 'pending' ? 'initiated' : state;
}

/** The customer-facing history knows no reversal: money taken back reads as rejected. */
function historyStatusOf(state: RefundState): BillingRefundStatus {
  return state === 'reversed' ? 'rejected' : state;
}

type AfterLock = () => Promise<void>;

interface RefundPlan {
  rows: PaymentRemedy[];
  record: Record<string, unknown> | null;
}

interface PeriodState {
  paid: boolean;
  source: 'records' | 'provider';
  providerPayments: PeriodPayments['cardPayments'];
}

@Injectable()
export class BillingDowngradeService {
  private readonly logger = new Logger(BillingDowngradeService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(PaymentRemedy)
    private readonly remedyRepo: Repository<PaymentRemedy>,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
    private readonly history: BillingHistoryService,
    private readonly notices: BillingNotices,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  /** Records the request once; a repeat returns the pending one unchanged. */
  async request(
    companyId: string,
    subscriptionId: string,
    userId: string,
  ): Promise<DowngradeRequest> {
    const { requestedAt, created } = await withCompanyLock(
      this.dataSource,
      companyId,
      async (manager) => {
        const company = await manager.findOne(Company, {
          where: { id: companyId },
        });
        if (!company) {
          throw new NotFoundException(`Company ${companyId} not found`);
        }
        if (company.downgradeRequestedAt) {
          return { requestedAt: company.downgradeRequestedAt, created: false };
        }
        if (await this.hasQueuedRefunds(manager, companyId)) {
          throw new ConflictException(
            'A previous downgrade refund is still being processed. Try again later.',
          );
        }
        const now = new Date();
        await manager.update(Company, companyId, {
          downgradeRequestedAt: now,
          downgradeRequestedBy: userId,
          downgradeSubscriptionId: subscriptionId,
          downgradeAttempts: 0,
        });
        return { requestedAt: now, created: true };
      },
    );
    const effectiveAt = downgradeEffectiveAt(requestedAt);
    if (created) {
      await this.notices.emit('DowngradeRequested', { companyId, effectiveAt });
    }
    return {
      downgradeRequestedAt: requestedAt.toISOString(),
      downgradeEffectiveAt: effectiveAt.toISOString(),
    };
  }

  /** Clears a provider-scheduled cancel so the delayed path owns the subscription. */
  async releaseScheduledCancel(ref: SubscriptionRef): Promise<void> {
    const schedule = await this.provider.getCancellationState(ref);
    if (schedule.cancelAtPeriodEnd) await this.provider.resume(ref);
  }

  /** True when a pending request was withdrawn; 409 once execution has started. */
  async withdraw(companyId: string): Promise<boolean> {
    return withCompanyLock(this.dataSource, companyId, async (manager) => {
      const company = await manager.findOne(Company, {
        where: { id: companyId },
      });
      if (!company?.downgradeRequestedAt) return false;
      if (await this.hasQueuedRefunds(manager, companyId)) {
        throw new ConflictException(
          'The downgrade is already being carried out and can no longer be withdrawn.',
        );
      }
      await manager.update(Company, companyId, { ...NO_REQUEST });
      return true;
    });
  }

  /** One company failing never stops the rest. */
  async executeDue(now: Date): Promise<void> {
    const cutoff = new Date(now.getTime() - DOWNGRADE_DELAY_MS);
    const rows: { id: string }[] = await this.companyRepo.query(
      `
      SELECT id FROM companies WHERE downgrade_requested_at <= $1
      UNION
      SELECT company_id AS id FROM payment_remedies
      WHERE cause = 'cancel' AND status = 'queued'
      `,
      [cutoff],
    );
    for (const { id } of rows) {
      try {
        await this.executeFor(id, now);
      } catch (err) {
        this.logger.error(
          `Downgrade execution failed for company ${id}: ${errorMessage(err)}`,
        );
      }
    }
  }

  /** Checkpoints commit outside the lock transaction, so a crash never loses one. */
  async executeFor(companyId: string, now: Date): Promise<void> {
    const cutoff = new Date(now.getTime() - DOWNGRADE_DELAY_MS);
    const after: AfterLock[] = [];
    await withCompanyLock(this.dataSource, companyId, async (manager) => {
      const company = await manager.findOne(Company, {
        where: { id: companyId },
      });
      if (!company) return;
      let queued = await this.queuedRefunds(manager, companyId);
      const due =
        !!company.downgradeRequestedAt &&
        company.downgradeRequestedAt <= cutoff;
      if (!due) {
        // Rows queued with no request left belong to a cancel that already happened.
        if (!company.downgradeRequestedAt) {
          await this.sendRefunds(companyId, queued, after);
        }
        return;
      }
      const subscriptionId = company.downgradeSubscriptionId;
      const customerId = company.billingCustomerId;
      if (!subscriptionId || !customerId) {
        await this.dropRequest(
          company,
          'it names no subscription',
          null,
          after,
        );
        return;
      }
      const ref = { subscriptionId, customerId };
      let plan: Record<string, unknown> | null = null;
      try {
        const planned =
          queued.length === 0
            ? await this.planRefund(manager, company, now, after)
            : await this.replanIfRenewed(
                manager,
                company,
                ref,
                queued,
                now,
                after,
              );
        if (planned === null) return;
        queued = planned.rows;
        plan = planned.record;
      } catch (err) {
        await this.stepFailed(company, 'planning', queued, err, after, null);
        return;
      }
      // Order: refund planned, then cancel, then refund; a failed cancel refunds nothing.
      try {
        await this.provider.cancelImmediately(ref);
      } catch (err) {
        const proceed = await this.stepFailed(
          company,
          'cancel',
          queued,
          err,
          after,
          ref,
        );
        if (!proceed) return;
      }
      await this.companyRepo.update(companyId, { ...NO_REQUEST });
      await this.writeAudit(companyId, 'downgrade_executed', {
        amount: queued.reduce((sum, r) => sum + r.amount, 0),
        currency: queued[0]?.currency ?? null,
        subscriptionId,
        periodPaid: plan?.periodPaid ?? null,
        periodPaidSource: plan?.periodPaidSource ?? null,
        refunds: queued.map((r) => r.id),
      });
      await this.sendRefunds(companyId, queued, after);
    });
    for (const notify of after) await notify();
  }

  async applyRefundUpdate(event: RefundUpdatedEvent): Promise<void> {
    if (event.state === 'pending') return;
    let remedy = await this.remedyRepo.findOne({
      where: { companyId: event.companyId, providerRef: event.refundId },
    });
    // The event can beat the job recording the refund id; the reference names the row.
    if (!remedy && event.reference && UUID.test(event.reference)) {
      const byReference = await this.remedyRepo.findOne({
        where: { id: event.reference, companyId: event.companyId },
      });
      if (byReference && !byReference.providerRef) remedy = byReference;
    }
    if (!remedy) {
      this.logger.log(
        `Refund ${event.refundId} for company ${event.companyId} has no remedy row; ignored`,
      );
      return;
    }
    const settled = remedy;
    const settleFrom = SETTLE_FROM[event.state];
    // All writes commit together, so a retry after a failure redoes the history row.
    const applied = await withCompanyLock(
      this.dataSource,
      event.companyId,
      async (manager) => {
        const result = await manager.getRepository(PaymentRemedy).update(
          {
            id: settled.id,
            companyId: event.companyId,
            status: In(settleFrom),
          },
          { status: remedyStatusOf(event.state), providerRef: event.refundId },
        );
        if (!result.affected) return false;
        if (settled.cause !== 'cancel') return true;
        await this.history.recordRefund(
          {
            companyId: event.companyId,
            refundId: event.refundId,
            amount: settled.amount,
            currency: settled.currency,
            refundStatus: historyStatusOf(event.state),
            occurredAt: event.occurredAt,
          },
          manager,
        );
        await this.history.setRefundStatus(
          event.companyId,
          event.refundId,
          historyStatusOf(event.state),
          manager,
        );
        return true;
      },
    );
    if (!applied) return;
    if (event.state !== 'approved') {
      await this.writeAudit(event.companyId, 'refund_failed', {
        outcome: event.state,
        remedyId: remedy.id,
        refundId: event.refundId,
        amount: remedy.amount,
        currency: remedy.currency,
        reason: `The payment provider reported the refund as ${event.state}.`,
      });
    }
    if (remedy.cause !== 'cancel') return;
    await this.notices.emit('RefundSettled', {
      companyId: event.companyId,
      amount: remedy.amount,
      currency: remedy.currency,
      state: event.state,
    });
  }

  /** Null when dropped or waiting; else the queued rows and plan record. */
  private async planRefund(
    manager: EntityManager,
    company: Company,
    now: Date,
    after: AfterLock[],
  ): Promise<RefundPlan | null> {
    const subscriptionId = company.downgradeSubscriptionId;
    const customerId = company.billingCustomerId;
    if (
      !subscriptionId ||
      !customerId ||
      company.billingSubscriptionId !== subscriptionId
    ) {
      return this.dropRequest(
        company,
        'its subscription has ended or changed',
        company.billingSubscriptionId ? DROP_REASONS.subscriptionChanged : null,
        after,
      );
    }
    const activeUsers = await manager.count(User, {
      where: { companyId: company.id, isActive: true },
    });
    // Team grew past one user since the request: keep the plan.
    if (activeUsers > 1) {
      return this.dropRequest(
        company,
        `the company has ${activeUsers} active users again`,
        DROP_REASONS.teamGrew,
        after,
      );
    }
    await this.releaseScheduledCancel({ subscriptionId, customerId });
    const basis = await this.provider.getRefundBasis({
      subscriptionId,
      customerId,
    });
    if (!basis) {
      return this.dropRequest(
        company,
        'the provider already ended it',
        null,
        after,
      );
    }
    const period = await this.currentPeriodPaid(
      manager,
      company,
      { subscriptionId, customerId },
      basis.periodStart,
      now,
    );
    if (period === null) return null;
    const periodPaid = period.paid;
    const payments = await this.refundablePayments(
      manager,
      company.id,
      basis.startedAt,
      now,
      period.providerPayments,
    );
    const breakdown = computeCancelRefund({
      periodStart: basis.periodStart,
      periodEnd: basis.periodEnd,
      executedAt: now,
      periodPaid,
      heldLines: basis.heldLines,
      pendingNextBill: basis.pendingNextBill,
      creditBalance: basis.creditBalance,
      cardRefundable: payments.reduce((sum, p) => sum + p.refundable, 0),
    });
    // creditReturned is paid out once: planned here, never again.
    const record = {
      ...breakdown,
      subscriptionId,
      pendingNextBillKnown: basis.pendingNextBillKnown,
      periodPaidSource: period.source,
      creditReturned: Math.min(breakdown.creditBalance, breakdown.amount),
    };
    this.logger.log(
      `Downgrade refund for company ${company.id}: ${JSON.stringify(record)}`,
    );
    const parts = allocateCancelRefund(breakdown.amount, payments);
    if (parts.length === 0) return { rows: [], record };
    const rows = await this.remedyRepo.save(
      parts.map((part) =>
        this.remedyRepo.create({
          companyId: company.id,
          kind: 'refund',
          refundScope: 'partial',
          amount: part.amount,
          currency: part.payment.currency,
          paymentSource: 'card',
          billingHistoryId: part.payment.billingHistoryId,
          providerInvoiceId: part.payment.providerInvoiceId,
          manualPaymentId: null,
          providerRef: null,
          status: 'queued',
          cause: 'cancel',
          whyNote: CANCEL_REFUND_NOTE,
          breakdown: record,
          attempts: 0,
          lastError: null,
          createdBy: null,
          createdByEmail: null,
        }),
      ),
    );
    return { rows, record };
  }

  /** Whether the period was paid, from our rows else the provider; null waits. */
  private async currentPeriodPaid(
    manager: EntityManager,
    company: Company,
    ref: SubscriptionRef,
    periodStart: Date,
    now: Date,
  ): Promise<PeriodState | null> {
    const rows = await manager.find(BillingHistory, {
      where: {
        companyId: company.id,
        type: In([
          'payment_succeeded',
          'settled_without_charge',
          'payment_failed',
        ]),
        periodStart: MoreThanOrEqual(periodStart),
      },
      select: ['id', 'type'],
    });
    const fromRecords = (paid: boolean): PeriodState => ({
      paid,
      source: 'records',
      providerPayments: [],
    });
    if (rows.some((r) => r.type !== 'payment_failed')) return fromRecords(true);
    const period = periodStart.toISOString();
    if (rows.length > 0 || company.billingStatus === 'past_due') {
      this.logger.warn(
        `Downgrade of company ${company.id}: the period from ${period} is unpaid, its unused share is not refunded`,
      );
      return fromRecords(false);
    }
    const deadline =
      (company.downgradeRequestedAt ?? now).getTime() +
      DOWNGRADE_DELAY_MS +
      RENEWAL_WAIT_MS;
    if (now.getTime() < deadline) {
      this.logger.warn(
        `Downgrade of company ${company.id} waits: the payment for the period from ${period} is not recorded yet`,
      );
      return null;
    }
    // Our payment row may be late; ask the provider.
    const provider = await this.provider.getPeriodPayments(ref, periodStart);
    const paid = provider.paid && !provider.failed;
    this.logger.warn(
      `Downgrade of company ${company.id}: no recorded payment for the period from ${period}; the provider shows it ${paid ? 'paid' : 'unpaid'}`,
    );
    return {
      paid,
      source: 'provider',
      providerPayments: paid ? provider.cardPayments : [],
    };
  }

  /** Queued rows planned for an earlier period are discarded and planned again. */
  private async replanIfRenewed(
    manager: EntityManager,
    company: Company,
    ref: SubscriptionRef,
    queued: PaymentRemedy[],
    now: Date,
    after: AfterLock[],
  ): Promise<RefundPlan | null> {
    const current = await this.provider.getRefundBasis(ref);
    const plannedStart = queued[0].breakdown?.periodStart;
    if (
      !current ||
      typeof plannedStart !== 'string' ||
      current.periodStart.toISOString() === plannedStart
    ) {
      return { rows: queued, record: queued[0].breakdown };
    }
    this.logger.warn(
      `Downgrade of company ${company.id}: a renewal came before the cancel, refund planned again`,
    );
    for (const remedy of queued) {
      await this.remedyRepo.update(
        { id: remedy.id, companyId: company.id, status: 'queued' },
        { status: 'failed', lastError: SUPERSEDED_NOTE },
      );
    }
    return this.planRefund(manager, company, now, after);
  }

  /** Card payments inside the refund window, newest first, less refunds made. */
  private async refundablePayments(
    manager: EntityManager,
    companyId: string,
    startedAt: Date,
    now: Date,
    providerPayments: PeriodPayments['cardPayments'],
  ): Promise<RefundablePayment[]> {
    const windowStart = new Date(now.getTime() - REFUND_WINDOW_MS);
    // One subscription per company, so payments since its start are its own.
    const rows = await manager.find(BillingHistory, {
      where: {
        companyId,
        type: 'payment_succeeded',
        periodStart: MoreThanOrEqual(startedAt),
        occurredAt: MoreThanOrEqual(windowStart),
      },
      order: { occurredAt: 'DESC' },
    });
    const known = new Set(rows.map((r) => r.providerInvoiceId));
    const payments = [
      ...rows.map((row) => ({
        billingHistoryId: row.id as string | null,
        providerInvoiceId: row.providerInvoiceId,
        currency: row.currency,
        amount: row.amount,
        occurredAt: row.occurredAt,
      })),
      // Paid at the provider, history row not arrived yet.
      ...providerPayments
        .filter((p) => !known.has(p.invoiceId) && p.occurredAt >= windowStart)
        .map((p) => ({
          billingHistoryId: null,
          providerInvoiceId: p.invoiceId,
          currency: p.currency,
          amount: p.amount,
          occurredAt: p.occurredAt,
        })),
    ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const refunded = await liveRefundTotals(manager, companyId, payments);
    return payments.map((p) => ({
      billingHistoryId: p.billingHistoryId,
      providerInvoiceId: p.providerInvoiceId,
      currency: p.currency,
      refundable: Math.max(
        p.amount - (refunded.get(p.providerInvoiceId) ?? 0),
        0,
      ),
    }));
  }

  /** True when execution may go on: the provider ended the subscription anyway. */
  private async stepFailed(
    company: Company,
    step: 'planning' | 'cancel',
    queued: PaymentRemedy[],
    err: unknown,
    after: AfterLock[],
    ref: SubscriptionRef | null,
  ): Promise<boolean> {
    const attempts = company.downgradeAttempts + 1;
    const error = errorMessage(err);
    if (attempts < MAX_PROVIDER_ATTEMPTS) {
      await this.companyRepo.update(company.id, {
        downgradeAttempts: attempts,
      });
      this.logger.warn(
        `Downgrade ${step} attempt ${attempts} for company ${company.id} failed: ${error}`,
      );
      return false;
    }
    if (ref && (await this.providerEnded(ref))) return true;
    this.logger.error(
      `Downgrade of company ${company.id} released after ${attempts} failed attempts (${step}): ${error}`,
    );
    for (const remedy of queued) {
      await this.remedyRepo.update(
        { id: remedy.id, companyId: company.id, status: 'queued' },
        { status: 'failed', attempts, lastError: error },
      );
    }
    await this.writeAudit(company.id, 'downgrade_released', {
      step,
      error,
      attempts,
      releasedRefunds: queued.map((r) => r.id),
    });
    await this.dropRequest(
      company,
      `the ${step} kept failing`,
      DROP_REASONS.cancelFailed,
      after,
    );
    return false;
  }

  private async providerEnded(ref: SubscriptionRef): Promise<boolean> {
    try {
      return (await this.provider.getRefundBasis(ref)) === null;
    } catch {
      return false;
    }
  }

  private async sendRefunds(
    companyId: string,
    queued: PaymentRemedy[],
    after: AfterLock[],
  ): Promise<void> {
    let requested = 0;
    let currency = '';
    for (const remedy of queued) {
      try {
        const invoice = await this.remedyInvoiceId(remedy);
        const { refundId, state } = await this.provider.refundInvoicePayment(
          invoice,
          remedy.amount,
          remedy.id,
        );
        const refundState = state ?? 'pending';
        // History first: a crash before the remedy update repeats an idempotent insert.
        await this.history.recordRefund({
          companyId,
          refundId,
          amount: remedy.amount,
          currency: remedy.currency,
          refundStatus: historyStatusOf(refundState),
          occurredAt: new Date(),
        });
        const moved = await this.remedyRepo.update(
          { id: remedy.id, companyId, status: 'queued' },
          {
            providerRef: refundId,
            status: remedyStatusOf(refundState),
            lastError: null,
          },
        );
        requested += remedy.amount;
        currency = remedy.currency;
        // A webhook that already moved the row has sent its own notice.
        if (refundState !== 'pending' && moved.affected) {
          after.push(() =>
            this.notices.emit('RefundSettled', {
              companyId,
              amount: remedy.amount,
              currency: remedy.currency,
              state: refundState,
            }),
          );
        }
      } catch (err) {
        await this.refundFailed(remedy, err, after);
      }
    }
    if (requested > 0) {
      after.unshift(() =>
        this.notices.emit('RefundRequested', {
          companyId,
          amount: requested,
          currency,
        }),
      );
    }
  }

  private async refundFailed(
    remedy: PaymentRemedy,
    err: unknown,
    after: AfterLock[],
  ): Promise<void> {
    const attempts = remedy.attempts + 1;
    const error = errorMessage(err);
    const failed = attempts >= MAX_PROVIDER_ATTEMPTS;
    await this.remedyRepo.update(
      { id: remedy.id, companyId: remedy.companyId, status: 'queued' },
      failed
        ? { status: 'failed', attempts, lastError: error }
        : { attempts, lastError: error },
    );
    this.logger.error(
      `Refund ${remedy.id} of ${remedy.amount} ${remedy.currency} for company ${remedy.companyId} ` +
        `failed (attempt ${attempts}${failed ? ', given up' : ''}): ${error}`,
    );
    if (failed) {
      after.push(() =>
        this.notices.emit('RefundFailed', {
          companyId: remedy.companyId,
          amount: remedy.amount,
          currency: remedy.currency,
        }),
      );
      await this.writeAudit(remedy.companyId, 'refund_failed', {
        outcome: 'failed',
        remedyId: remedy.id,
        amount: remedy.amount,
        currency: remedy.currency,
        anchoredPaymentId: remedy.billingHistoryId,
        attempts,
        error,
      });
    }
  }

  /** Same entity type as console remedies, so it shows in the History tab. */
  private async writeAudit(
    companyId: string,
    event: string,
    detail: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.log({
        companyId,
        action: AuditAction.UPDATE,
        entityType: 'ConsoleRemedy',
        newValue: { event, ...detail, operator: 'system' },
      });
    } catch (err) {
      this.logger.error(
        `Audit write failed for ${event} on company ${companyId}: ${errorMessage(err)}`,
      );
    }
  }

  private async remedyInvoiceId(remedy: PaymentRemedy): Promise<string> {
    if (remedy.providerInvoiceId) return remedy.providerInvoiceId;
    if (!remedy.billingHistoryId) {
      throw new Error(`Refund ${remedy.id} names no payment`);
    }
    const row = await this.dataSource.manager.findOne(BillingHistory, {
      where: { id: remedy.billingHistoryId, companyId: remedy.companyId },
      select: ['providerInvoiceId'],
    });
    if (!row) {
      throw new Error(`Payment ${remedy.billingHistoryId} not found`);
    }
    return row.providerInvoiceId;
  }

  /** Clears the request; a customer reason sends the notice that the plan continues. */
  private async dropRequest(
    company: Company,
    logReason: string,
    customerReason: string | null,
    after: AfterLock[],
  ): Promise<null> {
    this.logger.warn(
      `Downgrade request of company ${company.id} withdrawn: ${logReason}`,
    );
    await this.companyRepo.update(company.id, { ...NO_REQUEST });
    if (customerReason) {
      after.push(() =>
        this.notices.emit('DowngradeCancelled', {
          companyId: company.id,
          reason: customerReason,
        }),
      );
    }
    return null;
  }

  private queuedRefunds(
    manager: EntityManager,
    companyId: string,
  ): Promise<PaymentRemedy[]> {
    return manager.find(PaymentRemedy, {
      where: { companyId, cause: 'cancel', status: 'queued' },
      order: { createdAt: 'ASC' },
    });
  }

  private async hasQueuedRefunds(
    manager: EntityManager,
    companyId: string,
  ): Promise<boolean> {
    return (
      (await manager.count(PaymentRemedy, {
        where: { companyId, cause: 'cancel', status: 'queued' },
      })) > 0
    );
  }
}
