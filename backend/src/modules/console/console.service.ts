import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, IsNull, Repository } from 'typeorm';
import {
  Company,
  SubscriptionTier,
  TIER_LIMITS,
} from '@modules/companies/entities/company.entity';
import { User } from '@modules/users/entities/user.entity';
import { Role } from '@shared/enums/roles.enum';
import { paginationOptions } from '@shared/utils/pagination.util';
import { BillingPrice } from '@modules/billing/entities/billing-price.entity';
import { BillingHistory } from '@modules/billing/entities/billing-history.entity';
import { BillingService } from '@modules/billing/billing.service';
import { resolveBillingCurrency } from '@modules/billing/billing-currency.util';
import { WhatsappSettings } from '@modules/whatsapp/entities/whatsapp-settings.entity';
import { WhatsappService } from '@modules/whatsapp/whatsapp.service';
import { AuditService } from '@modules/audit/audit.service';
import { AuditAction } from '@modules/audit/dto/query-audit-logs.dto';
import { MediaService } from '@modules/properties/media.service';
import {
  LockStateService,
  CompanyLockState,
  UNLOCKED,
} from '@modules/lock/lock-state.service';
import { CustomDeal } from './entities/custom-deal.entity';
import { LockLift } from './entities/lock-lift.entity';
import { ManualPayment } from './entities/manual-payment.entity';
import { PaymentRemedy } from './entities/payment-remedy.entity';
import { GrantDealDto } from './dto/deal.dto';
import { LiftLockDto } from './dto/lift-lock.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { ApplyRemedyDto } from './dto/apply-remedy.dto';

/** Operator identity stamped on every intent (assistants act with full power, ruling 13). */
export interface OperatorActor {
  userId: string;
  email: string;
}

/** Statuses that count a card subscription as genuinely paying. */
const PAYING_STATUSES = ['active', 'trialing'];

/** Overdue manual entries older than this drop off the Upcoming panel (F3 ruling). */
const OVERDUE_WINDOW_DAYS = 90;

type Rail = 'card' | 'manual' | null;

interface CompanyMrr {
  paying: boolean;
  currency: string | null;
  amountMinor: number;
  rail: Rail;
}

/**
 * Operator console v2 (S2702 ratified design). Every method is a SUPER_ADMIN
 * business intent: give a deal, record a payment, make it right, lift a lock.
 * No provider vocabulary crosses this boundary (ruling 7); card-rail money
 * mechanics live behind BillingService and the provider port.
 */
@Injectable()
export class ConsoleService {
  private readonly logger = new Logger(ConsoleService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(CustomDeal)
    private readonly dealRepo: Repository<CustomDeal>,
    @InjectRepository(LockLift)
    private readonly liftRepo: Repository<LockLift>,
    @InjectRepository(ManualPayment)
    private readonly paymentRepo: Repository<ManualPayment>,
    @InjectRepository(PaymentRemedy)
    private readonly remedyRepo: Repository<PaymentRemedy>,
    @InjectRepository(BillingPrice)
    private readonly priceRepo: Repository<BillingPrice>,
    @InjectRepository(BillingHistory)
    private readonly billingHistoryRepo: Repository<BillingHistory>,
    @InjectRepository(WhatsappSettings)
    private readonly whatsappSettingsRepo: Repository<WhatsappSettings>,
    private readonly billingService: BillingService,
    private readonly lockStateService: LockStateService,
    private readonly auditService: AuditService,
    private readonly mediaService: MediaService,
    private readonly whatsappService: WhatsappService,
  ) {}

  // -------------------------------------------------------------------------
  // E. Scoreboard (Overview)
  // -------------------------------------------------------------------------

  /**
   * The business numbers before any click. Extensible response: metric keys
   * are additive; the frontend renders whatever tiles it knows. MRR is
   * per-currency with NO FX conversion (ruling 11); manual-rail companies
   * count (ruling 11); ARR is MRR x 12, computed by the frontend.
   */
  async getOverview(): Promise<Record<string, unknown>> {
    const companies = await this.companyRepo.find();
    const mrrMap = await this.computeMrrMap(companies);

    const mrrByCurrency = new Map<
      string,
      { mrrMinor: number; companies: number }
    >();
    let payingCustomers = 0;
    for (const mrr of mrrMap.values()) {
      if (!mrr.paying || !mrr.currency) continue;
      payingCustomers++;
      const entry = mrrByCurrency.get(mrr.currency) ?? {
        mrrMinor: 0,
        companies: 0,
      };
      entry.mrrMinor += mrr.amountMinor;
      entry.companies++;
      mrrByCurrency.set(mrr.currency, entry);
    }

    const regionCounts = new Map<string, number>();
    let totalStorageBytes = 0;
    for (const company of companies) {
      const region = company.defaultRegionCode ?? 'unknown';
      regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
      totalStorageBytes += company.storageUsedBytes;
    }

    const aiRaw = await this.whatsappSettingsRepo
      .createQueryBuilder('ws')
      .select('COALESCE(SUM(ws.ai_weekly_count), 0)', 'total')
      .getRawOne<{ total: string }>();

    return {
      customers: companies.length,
      payingCustomers,
      mrr: [...mrrByCurrency.entries()]
        .map(([currency, v]) => ({ currency, ...v }))
        .sort((a, b) => b.mrrMinor - a.mrrMinor),
      regions: [...regionCounts.entries()]
        .map(([regionCode, customers]) => ({ regionCode, customers }))
        .sort((a, b) => b.customers - a.customers),
      totalStorageBytes,
      // Truthful source: the per-company AI limiter is a ROLLING WEEKLY
      // window (ai_weekly_count); no 30-day store exists in the codebase.
      aiCallsCurrentWeek: Number(aiRaw?.total ?? 0),
      whatsappsRunning: this.whatsappService.countConnectedInstances(),
      generatedAt: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Companies list + detail
  // -------------------------------------------------------------------------

  async listCompanies(
    page = 1,
    limit = 20,
    search?: string,
  ): Promise<{
    data: Record<string, unknown>[];
    total: number;
    page: number;
    limit: number;
  }> {
    const [companies, total] = await this.companyRepo.findAndCount({
      where: search ? { name: ILike(`%${search.trim()}%`) } : undefined,
      order: { createdAt: 'DESC' },
      ...paginationOptions(page, limit),
    });
    if (companies.length === 0) return { data: [], total, page, limit };

    const ids = companies.map((c) => c.id);
    const [{ states, activeDeals }, mrrMap, userRows] = await Promise.all([
      this.lockStateService.getLockStates(companies),
      this.computeMrrMap(companies),
      this.userRepo
        .createQueryBuilder('u')
        .select('u.companyId', 'companyId')
        .addSelect('COUNT(*)', 'count')
        .where('u.companyId IN (:...ids)', { ids })
        .andWhere('u.isActive = true')
        .groupBy('u.companyId')
        .getRawMany<{ companyId: string; count: string }>(),
    ]);
    const userCounts = new Map(
      userRows.map((r) => [r.companyId, parseInt(r.count, 10)]),
    );

    const data = companies.map((company) => {
      const deal = activeDeals.get(company.id) ?? null;
      const state = states.get(company.id) ?? UNLOCKED;
      const mrr = mrrMap.get(company.id) ?? null;
      const seatCap = deal
        ? deal.seatCap
        : company.billingSubscriptionId
          ? company.purchasedSeats
          : company.maxUsers;
      return {
        id: company.id,
        name: company.name,
        tier: company.subscriptionTier,
        rail: mrr?.rail ?? null,
        seatsUsed: userCounts.get(company.id) ?? 0,
        seatCap,
        mrr:
          mrr?.paying && mrr.currency
            ? { currency: mrr.currency, amountMinor: mrr.amountMinor }
            : null,
        status: this.statusLabel(state, deal),
        lockState: state,
        deal: deal ? this.dealView(deal) : null,
        marketerCode: company.marketerCode,
        createdAt: company.createdAt,
      };
    });
    return { data, total, page, limit };
  }

  async getCompanyDetail(companyId: string): Promise<Record<string, unknown>> {
    const company = await this.findCompany(companyId);
    const [billing, deal, lockState, adminUser] = await Promise.all([
      this.billingService.getSubscriptionState(companyId).catch((err) => {
        // A dead provider must not blank the whole detail page.
        this.logger.warn(
          `Billing state unavailable for company ${companyId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      }),
      this.dealRepo.findOne({ where: { companyId, endedAt: IsNull() } }),
      this.lockStateService.getLockState(companyId),
      // Login-as target (design 4): impersonation needs the admin's userId.
      this.userRepo.findOne({
        where: { companyId, role: Role.COMPANY_ADMIN, isActive: true },
        select: ['id', 'email', 'name'],
      }),
    ]);

    return {
      id: company.id,
      name: company.name,
      tier: company.subscriptionTier,
      rail: company.billingSubscriptionId
        ? 'card'
        : deal || (await this.hasManualPayments(companyId))
          ? 'manual'
          : null,
      billing,
      deal: deal ? this.dealView(deal) : null,
      lockState,
      limits: {
        maxUsers: company.maxUsers,
        maxRegions: company.maxRegions,
        maxProperties: company.maxProperties,
      },
      storageUsedBytes: company.storageUsedBytes,
      marketerCode: company.marketerCode,
      adminUser: adminUser
        ? { id: adminUser.id, email: adminUser.email, name: adminUser.name }
        : null,
      createdAt: company.createdAt,
    };
  }

  /** Operator event log for the History tab; sourced from the audit trail. */
  async getCompanyHistory(
    companyId: string,
    page = 1,
    limit = 20,
  ): Promise<unknown> {
    await this.findCompany(companyId);
    return this.auditService.findAll(companyId, { page, limit });
  }

  // -------------------------------------------------------------------------
  // A. Custom deals
  // -------------------------------------------------------------------------

  async grantDeal(
    companyId: string,
    dto: GrantDealDto,
    actor: OperatorActor,
  ): Promise<CustomDeal> {
    const company = await this.findCompany(companyId);
    const untilDate = this.resolveUntilDate(dto);
    const existing = await this.dealRepo.findOne({
      where: { companyId, endedAt: IsNull() },
    });
    if (existing) {
      throw new ConflictException(
        'This company already has an active deal. Edit it or end it first.',
      );
    }

    let deal: CustomDeal;
    try {
      deal = await this.dealRepo.save(
        this.dealRepo.create({
          companyId,
          priceAmount: dto.priceAmount,
          currency: dto.currency.toLowerCase(),
          basis: dto.basis,
          seatCap: dto.seatCap,
          untilDate,
          whyNote: dto.whyNote.trim(),
          grantedBy: actor.userId,
          grantedByEmail: actor.email,
        }),
      );
    } catch (err) {
      // A concurrent grant loses the race on UQ_custom_deals_active_company;
      // surface it as the same 409 the pre-check path returns.
      if (this.isUniqueViolation(err)) {
        throw new ConflictException(
          'This company already has an active deal. Edit it or end it first.',
        );
      }
      throw err;
    }
    await this.applyDealEntitlements(company, dto.seatCap);
    await this.audit(companyId, actor, AuditAction.CREATE, 'ConsoleDeal', {
      entityId: deal.id,
      newValue: {
        event: 'deal_granted',
        priceAmount: deal.priceAmount,
        currency: deal.currency,
        basis: deal.basis,
        seatCap: deal.seatCap,
        untilDate: deal.untilDate?.toISOString() ?? null,
        lifetime: deal.untilDate === null,
        whyNote: deal.whyNote,
      },
    });
    return deal;
  }

  async updateDeal(
    companyId: string,
    dto: GrantDealDto,
    actor: OperatorActor,
  ): Promise<CustomDeal> {
    const company = await this.findCompany(companyId);
    const untilDate = this.resolveUntilDate(dto);
    const deal = await this.dealRepo.findOne({
      where: { companyId, endedAt: IsNull() },
    });
    if (!deal) {
      throw new NotFoundException('This company has no active deal to edit.');
    }

    const oldValue = {
      priceAmount: deal.priceAmount,
      currency: deal.currency,
      basis: deal.basis,
      seatCap: deal.seatCap,
      untilDate: deal.untilDate?.toISOString() ?? null,
      whyNote: deal.whyNote,
    };
    deal.priceAmount = dto.priceAmount;
    deal.currency = dto.currency.toLowerCase();
    deal.basis = dto.basis;
    deal.seatCap = dto.seatCap;
    deal.untilDate = untilDate;
    deal.whyNote = dto.whyNote.trim();
    deal.updatedBy = actor.userId;
    deal.updatedByEmail = actor.email;
    const saved = await this.dealRepo.save(deal);

    await this.applyDealEntitlements(company, dto.seatCap);
    await this.audit(companyId, actor, AuditAction.UPDATE, 'ConsoleDeal', {
      entityId: deal.id,
      oldValue,
      newValue: {
        event: 'deal_edited',
        priceAmount: saved.priceAmount,
        currency: saved.currency,
        basis: saved.basis,
        seatCap: saved.seatCap,
        untilDate: saved.untilDate?.toISOString() ?? null,
        whyNote: saved.whyNote,
      },
    });
    return saved;
  }

  async endDeal(companyId: string, actor: OperatorActor): Promise<void> {
    await this.findCompany(companyId);
    const deal = await this.dealRepo.findOne({
      where: { companyId, endedAt: IsNull() },
    });
    if (!deal) {
      throw new NotFoundException('This company has no active deal to end.');
    }
    deal.endedAt = new Date();
    deal.endedBy = actor.userId;
    await this.dealRepo.save(deal);
    // Entitlements deliberately untouched: ending a deal is a pricing event,
    // not a capacity event; the operator adjusts Limits when needed.
    await this.audit(companyId, actor, AuditAction.UPDATE, 'ConsoleDeal', {
      entityId: deal.id,
      newValue: { event: 'deal_ended' },
    });
  }

  // -------------------------------------------------------------------------
  // B. Lift lock
  // -------------------------------------------------------------------------

  async liftLock(
    companyId: string,
    dto: LiftLockDto,
    actor: OperatorActor,
  ): Promise<LockLift> {
    await this.findCompany(companyId);
    const liftUntil = new Date(dto.liftUntil);
    if (liftUntil.getTime() <= Date.now()) {
      throw new BadRequestException('liftUntil must be in the future.');
    }
    const state = await this.lockStateService.getLockState(companyId);
    if (!state.locked && !state.lifted) {
      throw new ConflictException('This company is not locked.');
    }
    const lift = await this.liftRepo.save(
      this.liftRepo.create({
        companyId,
        liftUntil,
        grantedBy: actor.userId,
        grantedByEmail: actor.email,
      }),
    );
    await this.audit(companyId, actor, AuditAction.CREATE, 'ConsoleLockLift', {
      entityId: lift.id,
      newValue: { event: 'lock_lifted', liftUntil: liftUntil.toISOString() },
    });
    return lift;
  }

  async endLift(companyId: string, actor: OperatorActor): Promise<void> {
    await this.findCompany(companyId);
    const lift = await this.lockStateService.findActiveLift(companyId);
    if (!lift) {
      throw new NotFoundException('This company has no active lift to end.');
    }
    lift.endedAt = new Date();
    lift.endedBy = actor.userId;
    await this.liftRepo.save(lift);
    await this.audit(companyId, actor, AuditAction.UPDATE, 'ConsoleLockLift', {
      entityId: lift.id,
      newValue: { event: 'lift_ended' },
    });
  }

  // -------------------------------------------------------------------------
  // C. Manual payments
  // -------------------------------------------------------------------------

  async recordPayment(
    companyId: string,
    dto: RecordPaymentDto,
    receipt: Express.Multer.File | undefined,
    actor: OperatorActor,
  ): Promise<ManualPayment> {
    await this.findCompany(companyId);
    if (dto.coversEnd < dto.coversStart) {
      throw new BadRequestException(
        'coversEnd must not be before coversStart.',
      );
    }
    const notes = dto.notes?.trim() || null;
    // "DOCUMENT IT" (requirement 2.4): a payment with no paper trail is a
    // forgotten promise waiting to happen.
    if (!notes && !receipt) {
      throw new BadRequestException(
        'Document the payment: notes or a receipt image is required.',
      );
    }

    let receiptKey: string | null = null;
    let receiptMime: string | null = null;
    if (receipt) {
      const uploaded = await this.mediaService.uploadConsoleReceipt(
        companyId,
        receipt,
      );
      receiptKey = uploaded.s3Key;
      // Mime already magic-byte verified by the upload; persist it so the
      // stream endpoint can serve a proper Content-Type.
      receiptMime = receipt.mimetype;
    }

    const payment = await this.paymentRepo.save(
      this.paymentRepo.create({
        companyId,
        amount: dto.amount,
        currency: dto.currency.toLowerCase(),
        receivedAt: dto.receivedAt.slice(0, 10),
        coversStart: dto.coversStart.slice(0, 10),
        coversEnd: dto.coversEnd.slice(0, 10),
        notes,
        receiptKey,
        receiptMime,
        recordedBy: actor.userId,
        recordedByEmail: actor.email,
      }),
    );
    await this.audit(
      companyId,
      actor,
      AuditAction.CREATE,
      'ConsoleManualPayment',
      {
        entityId: payment.id,
        newValue: {
          event: 'manual_payment_recorded',
          amount: payment.amount,
          currency: payment.currency,
          receivedAt: payment.receivedAt,
          coversStart: payment.coversStart,
          coversEnd: payment.coversEnd,
          hasReceipt: !!receiptKey,
        },
      },
    );
    return payment;
  }

  async listPayments(
    companyId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    data: ManualPayment[];
    total: number;
    page: number;
    limit: number;
  }> {
    await this.findCompany(companyId);
    const [data, total] = await this.paymentRepo.findAndCount({
      where: { companyId },
      order: { receivedAt: 'DESC', createdAt: 'DESC' },
      ...paginationOptions(page, limit),
    });
    return { data, total, page, limit };
  }

  async getReceiptStream(paymentId: string): Promise<{
    stream: NodeJS.ReadableStream;
    fileName: string;
    contentType: string;
  }> {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (!payment.receiptKey) {
      throw new NotFoundException('This payment has no receipt image');
    }
    const stream = await this.mediaService.getDocumentStream(
      payment.receiptKey,
    );
    return {
      stream,
      fileName: payment.receiptKey.split('/').pop() ?? 'receipt',
      // Persisted at upload; extension fallback covers pre-column rows.
      contentType: payment.receiptMime ?? this.mimeFromKey(payment.receiptKey),
    };
  }

  /**
   * "Upcoming manual payments" operator surface (ruling 12): manual-rail
   * companies whose covered period ends within the lookahead window; overdue
   * ones pinned on top. Companies that moved to a live card subscription are
   * skipped, and entries more than OVERDUE_WINDOW_DAYS past their covers-end
   * drop out (a churned one-time payer must not sit as Overdue forever;
   * review ruling F3, 2026-07-19).
   */
  async getUpcomingManualPayments(days = 14): Promise<{
    days: number;
    overdueWindowDays: number;
    rows: Record<string, unknown>[];
  }> {
    // Raw SQL: TypeORM's select() cannot express DISTINCT ON.
    const latest: {
      companyId: string;
      amount: string;
      currency: string;
      coversEnd: string | Date;
    }[] = await this.paymentRepo.query(
      `SELECT DISTINCT ON (company_id)
              company_id AS "companyId",
              amount,
              currency,
              covers_end AS "coversEnd"
         FROM manual_payments
        ORDER BY company_id, covers_end DESC`,
    );
    if (latest.length === 0) {
      return { days, overdueWindowDays: OVERDUE_WINDOW_DAYS, rows: [] };
    }

    const companies = await this.companyRepo.find({
      where: { id: In(latest.map((r) => r.companyId)) },
      select: ['id', 'name', 'billingSubscriptionId', 'billingStatus'],
    });
    const companyById = new Map(companies.map((c) => [c.id, c]));

    const today = this.dateOnly(new Date());
    const horizon = this.dateOnly(
      new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    );
    const overdueFloor = this.dateOnly(
      new Date(Date.now() - OVERDUE_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    );
    const rows = latest
      .map((r) => ({
        ...r,
        coversEnd: this.dateOnly(new Date(r.coversEnd)),
        amount: Number(r.amount),
      }))
      .filter((r) => {
        const company = companyById.get(r.companyId);
        if (!company) return false;
        // Moved to the card rail: no manual due date to chase.
        if (
          company.billingSubscriptionId &&
          PAYING_STATUSES.includes(company.billingStatus ?? '')
        ) {
          return false;
        }
        // Within the lookahead, but not stale beyond the overdue window.
        return r.coversEnd <= horizon && r.coversEnd >= overdueFloor;
      })
      .map((r) => ({
        companyId: r.companyId,
        companyName: companyById.get(r.companyId)!.name,
        amount: r.amount,
        currency: r.currency,
        coversEnd: r.coversEnd,
        overdue: r.coversEnd < today,
      }))
      .sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        return a.coversEnd < b.coversEnd ? -1 : 1;
      });
    return { days, overdueWindowDays: OVERDUE_WINDOW_DAYS, rows };
  }

  // -------------------------------------------------------------------------
  // D. Make it right
  // -------------------------------------------------------------------------

  async applyRemedy(
    dto: ApplyRemedyDto,
    actor: OperatorActor,
  ): Promise<PaymentRemedy> {
    const anchor = await this.resolveRemedyAnchor(dto);
    const { companyId, paymentAmount, currency } = anchor;
    const company = await this.findCompany(companyId);

    let amount: number;
    let refundScope: 'partial' | 'full' | null = null;
    if (dto.remedy === 'refund') {
      if (!dto.scope) {
        throw new BadRequestException(
          'A refund needs a scope: partial or full.',
        );
      }
      refundScope = dto.scope;
      if (dto.scope === 'full') {
        if (dto.amount != null) {
          throw new BadRequestException(
            'A full refund takes no amount; it refunds the whole payment.',
          );
        }
        amount = paymentAmount;
      } else {
        if (dto.amount == null) {
          throw new BadRequestException('A partial refund needs an amount.');
        }
        amount = dto.amount;
      }
    } else {
      if (dto.amount == null) {
        throw new BadRequestException('A next-bill discount needs an amount.');
      }
      amount = dto.amount;
    }
    if (amount > paymentAmount) {
      throw new BadRequestException(
        'The remedy amount cannot exceed the anchored payment.',
      );
    }

    // Card rail: real money moves through the provider port. Manual rail:
    // the record IS the remedy; the operator settles outside the system.
    let providerRef: string | null = null;
    if (dto.source === 'card') {
      try {
        if (dto.remedy === 'refund') {
          const result = await this.billingService.refundCardPayment(
            anchor.invoiceId!,
            dto.scope === 'full' ? null : amount,
          );
          providerRef = result.refundId;
        } else {
          if (!company.billingCustomerId) {
            throw new BadRequestException(
              'This company has no billing customer; a next-bill discount is not possible on the card rail.',
            );
          }
          const result = await this.billingService.creditNextBill(
            company.billingCustomerId,
            amount,
            currency,
          );
          providerRef = result.creditId;
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Remedy provider call failed for company ${companyId}: ${msg}`,
        );
        throw new BadGatewayException(
          `The payment provider rejected the ${dto.remedy === 'refund' ? 'refund' : 'discount'}: ${msg}`,
        );
      }
    }

    const remedy = await this.remedyRepo.save(
      this.remedyRepo.create({
        companyId,
        kind: dto.remedy,
        refundScope,
        amount,
        currency,
        paymentSource: dto.source,
        billingHistoryId: dto.source === 'card' ? dto.paymentId : null,
        manualPaymentId: dto.source === 'manual' ? dto.paymentId : null,
        providerRef,
        status: 'initiated',
        whyNote: dto.whyNote.trim(),
        createdBy: actor.userId,
        createdByEmail: actor.email,
      }),
    );
    await this.audit(companyId, actor, AuditAction.CREATE, 'ConsoleRemedy', {
      entityId: remedy.id,
      newValue: {
        event:
          dto.remedy === 'refund' ? 'refund_initiated' : 'next_bill_discount',
        amount,
        currency,
        refundScope,
        paymentSource: dto.source,
        anchoredPaymentId: dto.paymentId,
        providerRef,
        whyNote: remedy.whyNote,
      },
    });
    return remedy;
  }

  // -------------------------------------------------------------------------
  // F. System health (price catalogue)
  // -------------------------------------------------------------------------

  /**
   * Per-row registration status with the provider's last error VERBATIM.
   * Auto-sync on read: when rows are missing their registration, run the
   * idempotent sync first (failures are persisted per-row, never thrown), so
   * the operator almost never needs the manual Fix button.
   */
  async getPriceHealth(): Promise<Record<string, unknown>> {
    let rows = await this.activePricesSorted();
    if (rows.some((r) => !r.providerPriceId)) {
      try {
        await this.billingService.syncPrices();
      } catch (err) {
        // Sync-level failure (e.g. provider auth): each pending row keeps or
        // gains its own persisted error via syncPrices; log and fall through.
        this.logger.error(
          `Auto price sync failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      rows = await this.activePricesSorted();
    }

    const items = rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      currency: row.currency,
      unitAmount: row.unitAmount,
      status: row.providerPriceId
        ? 'registered'
        : row.lastSyncError
          ? 'failed'
          : 'missing',
      lastError: row.providerPriceId ? null : row.lastSyncError,
      lastErrorAt: row.providerPriceId
        ? null
        : (row.lastSyncErrorAt?.toISOString() ?? null),
    }));
    return {
      rows: items,
      total: items.length,
      registered: items.filter((i) => i.status === 'registered').length,
      missing: items.filter((i) => i.status === 'missing').length,
      failed: items.filter((i) => i.status === 'failed').length,
      checkedAt: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // G. Marketers report
  // -------------------------------------------------------------------------

  /**
   * MRR by marketer code, numbers only (requirement 2.5). List price, no
   * coupon subtraction; expired/locked deals excluded from paying. The null
   * group aggregates un-attributed companies so the table reconciles against
   * the Overview totals (design section 9).
   */
  async getMarketersReport(): Promise<{ rows: Record<string, unknown>[] }> {
    const companies = await this.companyRepo.find();
    const mrrMap = await this.computeMrrMap(companies);

    interface Group {
      marketerCode: string | null;
      companies: number;
      paying: number;
      mrrByCurrency: Map<string, number>;
      lastSignupAt: Date | null;
      companyIds: string[];
    }
    const groups = new Map<string, Group>();
    for (const company of companies) {
      const key = company.marketerCode ?? '';
      let group = groups.get(key);
      if (!group) {
        group = {
          marketerCode: company.marketerCode ?? null,
          companies: 0,
          paying: 0,
          mrrByCurrency: new Map(),
          lastSignupAt: null,
          companyIds: [],
        };
        groups.set(key, group);
      }
      group.companies++;
      group.companyIds.push(company.id);
      if (!group.lastSignupAt || company.createdAt > group.lastSignupAt) {
        group.lastSignupAt = company.createdAt;
      }
      const mrr = mrrMap.get(company.id);
      if (mrr?.paying && mrr.currency) {
        group.paying++;
        group.mrrByCurrency.set(
          mrr.currency,
          (group.mrrByCurrency.get(mrr.currency) ?? 0) + mrr.amountMinor,
        );
      }
    }

    const rows = [...groups.values()]
      .map((g) => ({
        marketerCode: g.marketerCode,
        companies: g.companies,
        paying: g.paying,
        mrr: [...g.mrrByCurrency.entries()]
          .map(([currency, mrrMinor]) => ({ currency, mrrMinor }))
          .sort((a, b) => b.mrrMinor - a.mrrMinor),
        lastSignupAt: g.lastSignupAt?.toISOString() ?? null,
        companyIds: g.companyIds,
      }))
      .sort((a, b) => {
        // Attributed rows first (by paying desc, then companies desc); the
        // un-attributed aggregate row last.
        if ((a.marketerCode === null) !== (b.marketerCode === null)) {
          return a.marketerCode === null ? 1 : -1;
        }
        if (a.paying !== b.paying) return b.paying - a.paying;
        return b.companies - a.companies;
      });
    return { rows };
  }

  // -------------------------------------------------------------------------
  // Shared MRR read model
  // -------------------------------------------------------------------------

  /**
   * Per-company monthly revenue, both rails, no FX (ruling 11). Precedence:
   *   1. Active unexpired deal: the negotiated price IS the MRR (per-seat x
   *      cap, or flat total), in the deal currency; rail follows the live
   *      subscription if one exists.
   *   2. Expired deal without a covering payment (locked or lifted): NOT
   *      paying, unless a live card subscription exists (then list price).
   *   3. Live active/trialing subscription: list price from billing_prices
   *      (PRO: seats x seat; ENTERPRISE: base + (seats - 1) x seat), no
   *      coupon subtraction.
   *   4. No deal, no subscription, but a manual payment covering today: that
   *      payment's amount counts as the month, in its own currency.
   *   5. Otherwise: not paying.
   */
  private async computeMrrMap(
    companies: Company[],
  ): Promise<Map<string, CompanyMrr>> {
    const result = new Map<string, CompanyMrr>();
    if (companies.length === 0) return result;

    const [{ states, activeDeals }, prices, coverage] = await Promise.all([
      this.lockStateService.getLockStates(companies),
      this.priceRepo.find({ where: { active: true } }),
      this.latestCoveringPayments(companies.map((c) => c.id)),
    ]);
    const priceByKey = new Map(
      prices.map((p) => [`${p.kind}|${p.currency}`, p.unitAmount]),
    );

    for (const company of companies) {
      const deal = activeDeals.get(company.id);
      const state = states.get(company.id) ?? UNLOCKED;
      const hasLiveSub =
        !!company.billingSubscriptionId &&
        PAYING_STATUSES.includes(company.billingStatus ?? '');

      if (deal && !this.dealExpired(deal)) {
        const dealMonthly =
          deal.basis === 'per_seat'
            ? deal.priceAmount * deal.seatCap
            : deal.priceAmount;
        // Zero-cost deals count as customers, never as paying (review ruling
        // F2, 2026-07-19): a free arrangement must not inflate the Paying
        // tile or the marketers paying count.
        result.set(company.id, {
          paying: dealMonthly > 0,
          currency: dealMonthly > 0 ? deal.currency : null,
          amountMinor: dealMonthly,
          rail: hasLiveSub ? 'card' : 'manual',
        });
        continue;
      }
      if (deal && (state.locked || state.lifted) && !hasLiveSub) {
        result.set(company.id, {
          paying: false,
          currency: null,
          amountMinor: 0,
          rail: 'manual',
        });
        continue;
      }
      if (hasLiveSub) {
        const currency =
          company.billingCurrency ??
          resolveBillingCurrency(company.defaultRegionCode);
        const seat = priceByKey.get(`SEAT|${currency}`) ?? 0;
        const base = priceByKey.get(`ENTERPRISE_BASE|${currency}`) ?? 0;
        const seats = Math.max(company.purchasedSeats, 1);
        const amountMinor =
          company.subscriptionTier === SubscriptionTier.ENTERPRISE
            ? base + Math.max(seats - 1, 0) * seat
            : seats * seat;
        result.set(company.id, {
          paying: true,
          currency,
          amountMinor,
          rail: 'card',
        });
        continue;
      }
      const covering = coverage.get(company.id);
      if (covering) {
        result.set(company.id, {
          paying: true,
          currency: covering.currency,
          amountMinor: covering.amount,
          rail: 'manual',
        });
        continue;
      }
      result.set(company.id, {
        paying: false,
        currency: null,
        amountMinor: 0,
        rail: null,
      });
    }
    return result;
  }

  /** Latest manual payment per company whose covers-period reaches today. */
  private async latestCoveringPayments(
    companyIds: string[],
  ): Promise<Map<string, { amount: number; currency: string }>> {
    if (companyIds.length === 0) return new Map();
    // Raw SQL: TypeORM's select() cannot express DISTINCT ON.
    const rows: { companyId: string; amount: string; currency: string }[] =
      await this.paymentRepo.query(
        `SELECT DISTINCT ON (company_id)
                company_id AS "companyId",
                amount,
                currency
           FROM manual_payments
          WHERE company_id = ANY($1)
            AND covers_end >= CURRENT_DATE
          ORDER BY company_id, covers_end DESC`,
        [companyIds],
      );
    return new Map(
      rows.map((r) => [
        r.companyId,
        { amount: Number(r.amount), currency: r.currency },
      ]),
    );
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async findCompany(companyId: string): Promise<Company> {
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException(`Company ${companyId} not found`);
    return company;
  }

  private dealExpired(deal: CustomDeal): boolean {
    return !!deal.untilDate && deal.untilDate <= new Date();
  }

  private dealView(deal: CustomDeal): Record<string, unknown> {
    return {
      id: deal.id,
      priceAmount: deal.priceAmount,
      currency: deal.currency,
      basis: deal.basis,
      seatCap: deal.seatCap,
      untilDate: deal.untilDate?.toISOString() ?? null,
      lifetime: deal.untilDate === null,
      expired: this.dealExpired(deal),
      whyNote: deal.whyNote,
      grantedBy: deal.grantedByEmail,
      grantedAt: deal.createdAt,
      updatedBy: deal.updatedByEmail,
      updatedAt: deal.updatedAt,
    };
  }

  private statusLabel(
    state: CompanyLockState,
    deal: CustomDeal | null,
  ): string {
    if (state.locked) return 'locked';
    if (state.lifted) return 'lifted';
    if (deal && !this.dealExpired(deal)) return 'deal';
    return 'active';
  }

  /** One of untilDate / lifetime, never both (deal form rule, design 5). */
  private resolveUntilDate(dto: GrantDealDto): Date | null {
    if (dto.lifetime) {
      if (dto.untilDate) {
        throw new BadRequestException(
          'A lifetime deal takes no until-date; send one or the other.',
        );
      }
      return null;
    }
    if (!dto.untilDate) {
      throw new BadRequestException(
        'A deal needs an until-date, or mark it lifetime.',
      );
    }
    const until = new Date(dto.untilDate);
    if (until.getTime() <= Date.now()) {
      throw new BadRequestException(
        'The until-date must be in the future; a past date would lock the account immediately.',
      );
    }
    return until;
  }

  /**
   * A deal implies entitlements for a company that has no live subscription:
   * FREE rises to PRO (with PRO caps), and maxUsers pins to the deal's seat
   * cap ("each seat comes with a cost", ruling 4). A company with a live
   * subscription is untouched: the webhook stays the single writer of
   * gateway-owned columns.
   */
  private async applyDealEntitlements(
    company: Company,
    seatCap: number,
  ): Promise<void> {
    if (company.billingSubscriptionId) return;
    const patch: {
      maxUsers: number;
      subscriptionTier?: SubscriptionTier;
      maxRegions?: number;
      maxProperties?: number;
    } = { maxUsers: seatCap };
    if (company.subscriptionTier === SubscriptionTier.FREE) {
      const limits = TIER_LIMITS[SubscriptionTier.PRO];
      patch.subscriptionTier = SubscriptionTier.PRO;
      patch.maxRegions = limits.maxRegions;
      patch.maxProperties = limits.maxProperties;
    }
    await this.companyRepo.update(company.id, patch);
  }

  private async hasManualPayments(companyId: string): Promise<boolean> {
    return this.paymentRepo.exists({ where: { companyId } });
  }

  private async activePricesSorted(): Promise<BillingPrice[]> {
    return this.priceRepo.find({
      where: { active: true },
      order: { kind: 'ASC', currency: 'ASC' },
    });
  }

  private async resolveRemedyAnchor(dto: ApplyRemedyDto): Promise<{
    companyId: string;
    paymentAmount: number;
    currency: string;
    invoiceId: string | null;
  }> {
    if (dto.source === 'card') {
      const row = await this.billingHistoryRepo.findOne({
        where: { id: dto.paymentId },
      });
      if (!row) throw new NotFoundException('Card payment not found');
      if (row.type !== 'payment_succeeded') {
        throw new BadRequestException(
          'A remedy anchors to a PAID payment; this record is a failed attempt.',
        );
      }
      return {
        companyId: row.companyId,
        paymentAmount: row.amount,
        currency: row.currency,
        invoiceId: row.stripeInvoiceId,
      };
    }
    const payment = await this.paymentRepo.findOne({
      where: { id: dto.paymentId },
    });
    if (!payment) throw new NotFoundException('Manual payment not found');
    return {
      companyId: payment.companyId,
      paymentAmount: payment.amount,
      currency: payment.currency,
      invoiceId: null,
    };
  }

  private isUniqueViolation(err: unknown): boolean {
    const e = err as { code?: string; driverError?: { code?: string } };
    return e?.code === '23505' || e?.driverError?.code === '23505';
  }

  /** Extension fallback for receipts recorded before receipt_mime existed. */
  private mimeFromKey(key: string): string {
    const ext = key.toLowerCase().split('.').pop() ?? '';
    const map: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };
    return map[ext] ?? 'application/octet-stream';
  }

  private dateOnly(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  private async audit(
    companyId: string,
    actor: OperatorActor,
    action: AuditAction,
    entityType: string,
    extra: {
      entityId?: string;
      oldValue?: Record<string, unknown>;
      newValue?: Record<string, unknown>;
    },
  ): Promise<void> {
    // Console intents are audited explicitly (the global interceptor skips
    // requests without a caller companyId; a super admin has none). An audit
    // failure must never roll back the intent itself.
    try {
      await this.auditService.log({
        companyId,
        userId: actor.userId,
        action,
        entityType,
        entityId: extra.entityId,
        oldValue: extra.oldValue as Record<string, any> | undefined,
        newValue: {
          ...(extra.newValue ?? {}),
          operator: actor.email,
        } as Record<string, any>,
      });
    } catch (err) {
      this.logger.error(
        `Audit write failed for ${entityType} on company ${companyId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
