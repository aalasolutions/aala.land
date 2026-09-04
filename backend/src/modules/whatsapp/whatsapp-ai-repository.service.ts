import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  ILike,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThan,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import { acquireCompanyLock } from '@shared/utils/company-lock.util';
import {
  Company,
  AI_CONVERSATION_WINDOW_MS,
} from '../companies/entities/company.entity';
import { Unit, UnitStatus } from '../properties/entities/unit.entity';
import { PropertyType } from '../properties/entities/property-type.enum';
import { BillingHistory } from '../billing/entities/billing-history.entity';
import { User } from '../users/entities/user.entity';
import { WhatsappSettings } from './entities/whatsapp-settings.entity';
import { WhatsappAiConversation } from './entities/whatsapp-ai-conversation.entity';
import { WhatsappChat } from './entities/whatsapp-chat.entity';
import { AiCreditUsage } from './entities/ai-credit-usage.entity';
import { AiCreditAgentUsage } from './wa-types';

interface PropertySearchFilters {
  bedrooms?: number;
  minPrice?: number;
  maxPrice?: number;
  city?: string;
  type?: string;
}

interface ContextCache {
  units: Unit[];
  cachedAt: number;
}

interface PromptCache {
  prompt: string | null;
  cachedAt: number;
  ttl: number;
}

interface AnchorCache {
  anchor: Date;
  cachedAt: number;
}

interface CompanyCache {
  company: Company | null;
  cachedAt: number;
}

// NOTE: Single-instance only — caches below are process-local.
// On multi-instance deploys, prompt edits will be stale on other replicas until TTL expires.
@Injectable()
export class WhatsappAiRepositoryService
  implements OnModuleInit, OnModuleDestroy
{
  private contextCache = new Map<string, ContextCache>();
  private promptCache = new Map<string, PromptCache>();
  private anchorCache = new Map<string, AnchorCache>();
  private companyCache = new Map<string, CompanyCache>();
  private readonly CONTEXT_TTL_MS = 5 * 60 * 1000;
  private readonly PROMPT_TTL_MS = 2 * 60 * 1000;
  private readonly PROMPT_NULL_TTL_MS = 30 * 1000;
  private readonly ANCHOR_TTL_MS = 5 * 60 * 1000;
  private readonly COMPANY_TTL_MS = 5 * 60 * 1000;
  private readonly SWEEP_INTERVAL_MS = 5 * 60 * 1000;
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    @InjectRepository(WhatsappSettings)
    private readonly settingsRepo: Repository<WhatsappSettings>,
    @InjectRepository(WhatsappAiConversation)
    private readonly conversationRepo: Repository<WhatsappAiConversation>,
    @InjectRepository(AiCreditUsage)
    private readonly usageRepo: Repository<AiCreditUsage>,
    @InjectRepository(BillingHistory)
    private readonly billingHistoryRepo: Repository<BillingHistory>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  onModuleInit(): void {
    this.sweepInterval = setInterval(
      () => this.sweepExpired(),
      this.SWEEP_INTERVAL_MS,
    );
  }

  onModuleDestroy(): void {
    if (this.sweepInterval) clearInterval(this.sweepInterval);
  }

  // TTL alone is only enforced on re-read, so a company that goes quiet would keep its
  // Company row and up to 40 hydrated Unit graphs pinned for the process lifetime.
  private sweepExpired(): void {
    const now = Date.now();
    const drop = <V extends { cachedAt: number }>(
      map: Map<string, V>,
      ttl: number,
    ): void => {
      for (const [key, entry] of map.entries()) {
        if (now - entry.cachedAt >= ttl) map.delete(key);
      }
    };
    drop(this.contextCache, this.CONTEXT_TTL_MS);
    drop(this.anchorCache, this.ANCHOR_TTL_MS);
    drop(this.companyCache, this.COMPANY_TTL_MS);
    for (const [key, entry] of this.promptCache.entries()) {
      if (now - entry.cachedAt >= entry.ttl) this.promptCache.delete(key);
    }
  }

  async getCompany(companyId: string): Promise<Company | null> {
    const cached = this.companyCache.get(companyId);
    if (cached && Date.now() - cached.cachedAt < this.COMPANY_TTL_MS) {
      return cached.company;
    }
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
    });
    this.companyCache.set(companyId, { company, cachedAt: Date.now() });
    return company;
  }

  async getCompanyAndUnits(
    companyId: string,
  ): Promise<{ company: Company | null; units: Unit[] }> {
    const cached = this.contextCache.get(companyId);
    if (cached && Date.now() - cached.cachedAt < this.CONTEXT_TTL_MS) {
      return { company: await this.getCompany(companyId), units: cached.units };
    }
    // Company comes from getCompany so there is one cached copy on one TTL. Caching it
    // here too let the enforcement path and the UI path read allowances that expire apart.
    const [company, units] = await Promise.all([
      this.getCompany(companyId),
      this.unitRepo.find({
        where: { companyId, status: UnitStatus.AVAILABLE },
        relations: ['asset', 'asset.locality', 'asset.locality.city'],
        order: { createdAt: 'DESC' },
        take: 40,
      }),
    ]);
    this.contextCache.set(companyId, { units, cachedAt: Date.now() });
    return { company, units };
  }

  async searchProperties(
    companyId: string,
    filters: PropertySearchFilters,
  ): Promise<Unit[]> {
    const where: FindOptionsWhere<Unit> = {
      companyId,
      status: UnitStatus.AVAILABLE,
    };

    if (filters.type) {
      const normalized = filters.type.toUpperCase();
      if (normalized === 'RENT') where['propertyType'] = PropertyType.RENTAL;
      else if (normalized === 'SALE')
        where['propertyType'] = PropertyType.FOR_SALE;
    }
    if (filters.minPrice !== undefined && filters.maxPrice !== undefined) {
      where['price'] = Between(filters.minPrice, filters.maxPrice);
    } else if (filters.minPrice !== undefined) {
      where['price'] = MoreThanOrEqual(filters.minPrice);
    } else if (filters.maxPrice !== undefined) {
      where['price'] = LessThanOrEqual(filters.maxPrice);
    }
    if (filters.bedrooms !== undefined) {
      where['bedrooms'] = filters.bedrooms;
    }
    if (filters.city) {
      where['asset'] = {
        locality: { city: { name: ILike(`%${filters.city}%`) } },
      };
    }

    return this.unitRepo.find({
      where,
      relations: ['asset', 'asset.locality', 'asset.locality.city'],
      order: { createdAt: 'DESC' },
      take: 20,
    });
  }

  async getCompanyPrompt(companyId: string): Promise<string | null> {
    const cached = this.promptCache.get(companyId);
    if (cached && Date.now() - cached.cachedAt < cached.ttl) {
      return cached.prompt;
    }
    const settings = await this.settingsRepo.findOne({ where: { companyId } });
    const prompt = settings?.aiPrompt || null;
    const ttl = prompt ? this.PROMPT_TTL_MS : this.PROMPT_NULL_TTL_MS;
    this.promptCache.set(companyId, { prompt, cachedAt: Date.now(), ttl });
    return prompt;
  }

  async persistAiEnabled(companyId: string, value: boolean): Promise<void> {
    await this.settingsRepo.upsert({ companyId, aiEnabled: value }, [
      'companyId',
    ]);
  }

  async loadAiEnabled(companyId: string): Promise<boolean | null> {
    const row = await this.settingsRepo.findOne({
      where: { companyId },
      select: { aiEnabled: true },
    });
    return row?.aiEnabled ?? null;
  }

  async getPeriodAnchor(company: Company): Promise<Date> {
    const cached = this.anchorCache.get(company.id);
    if (cached && Date.now() - cached.cachedAt < this.ANCHOR_TTL_MS) {
      return cached.anchor;
    }
    const row = await this.billingHistoryRepo.findOne({
      where: { companyId: company.id, periodStart: Not(IsNull()) },
      order: { periodStart: 'DESC', occurredAt: 'DESC' },
      select: { periodStart: true },
    });
    const anchor = row?.periodStart ?? company.createdAt;
    this.anchorCache.set(company.id, { anchor, cachedAt: Date.now() });
    return anchor;
  }

  // Advisory lock, NOT the usage row: that row's key includes period_start, so two
  // turns either side of a boundary lock different rows and double-charge.
  async consumeConversationCredit(
    companyId: string,
    userId: string,
    chatId: string,
    allowance: number,
    period: { start: Date; end: Date },
  ): Promise<{
    allowed: boolean;
    charged: boolean;
    conversationId: string | null;
  }> {
    return this.settingsRepo.manager.transaction(async (manager) => {
      const usageRepo = manager.getRepository(AiCreditUsage);
      const conversationRepo = manager.getRepository(WhatsappAiConversation);
      const chatRepo = manager.getRepository(WhatsappChat);

      await acquireCompanyLock(manager, companyId);

      await usageRepo
        .createQueryBuilder()
        .insert()
        .into(AiCreditUsage)
        .values({
          companyId,
          periodStart: period.start,
          periodEnd: period.end,
        })
        .orIgnore()
        .execute();

      const usage = await usageRepo
        .createQueryBuilder('u')
        .setLock('pessimistic_write')
        .where('u.companyId = :companyId', { companyId })
        .andWhere('u.periodStart = :periodStart', { periodStart: period.start })
        .getOne();

      if (!usage) {
        throw new Error(
          `ai_credit_usage row missing after upsert for company ${companyId}`,
        );
      }

      const now = new Date();
      const openWindow = await conversationRepo
        .createQueryBuilder('c')
        .where('c.companyId = :companyId', { companyId })
        .andWhere('c.userId = :userId', { userId })
        .andWhere('c.chatId = :chatId', { chatId })
        .andWhere('c.expiresAt > :now', { now })
        .orderBy('c.startedAt', 'DESC')
        .getOne();

      if (openWindow) {
        return { allowed: true, charged: false, conversationId: openWindow.id };
      }

      if (usage.creditsUsed >= allowance) {
        return { allowed: false, charged: false, conversationId: null };
      }

      // Same identity as the chat row (company+user+chat), read here so a new window
      // records which connected number it belongs to without the caller passing it in.
      const chat = await chatRepo.findOne({
        where: { companyId, userId, chatId },
        select: { phoneNumberId: true },
      });

      const conversation = await conversationRepo.save(
        conversationRepo.create({
          companyId,
          userId,
          chatId,
          phoneNumberId: chat?.phoneNumberId ?? null,
          leadId: null,
          startedAt: now,
          expiresAt: new Date(now.getTime() + AI_CONVERSATION_WINDOW_MS),
          messagesCount: 0,
          periodStart: period.start,
        }),
      );

      await usageRepo.increment(
        { companyId, periodStart: period.start },
        'creditsUsed',
        1,
      );

      return { allowed: true, charged: true, conversationId: conversation.id };
    });
  }

  // Counts an AI reply the lead actually received. Kept out of
  // consumeConversationCredit so turns that die at the LLM never inflate the number.
  async recordTurnDelivered(
    companyId: string,
    conversationId: string,
  ): Promise<void> {
    await this.conversationRepo.increment(
      { id: conversationId, companyId },
      'messagesCount',
      1,
    );
  }

  async getCreditUsage(
    companyId: string,
    periodStart: Date,
  ): Promise<{ used: number; openWindows: number }> {
    const [usage, openWindows] = await Promise.all([
      this.usageRepo.findOne({
        where: { companyId, periodStart },
        select: { creditsUsed: true },
      }),
      // Period-scoped so `used` and `openWindows` describe the same set. A window
      // opened late in the previous period stays open into this one but was charged there.
      this.conversationRepo.count({
        where: { companyId, periodStart, expiresAt: MoreThan(new Date()) },
      }),
    ]);
    return { used: usage?.creditsUsed ?? 0, openWindows };
  }

  async getAgentCreditBreakdown(
    companyId: string,
    periodStart: Date,
  ): Promise<AiCreditAgentUsage[]> {
    const rows = await this.conversationRepo
      .createQueryBuilder('c')
      .select('c.userId', 'userId')
      .addSelect('COUNT(*)', 'credits')
      .addSelect('COALESCE(SUM(c.messagesCount), 0)', 'aiTurns')
      .addSelect('COUNT(DISTINCT c.chatId)', 'leads')
      .where('c.companyId = :companyId', { companyId })
      .andWhere('c.periodStart = :periodStart', { periodStart })
      .groupBy('c.userId')
      .getRawMany<{
        userId: string;
        credits: string;
        aiTurns: string;
        leads: string;
      }>();

    if (rows.length === 0) return [];

    const users = await this.userRepo.find({
      where: { id: In(rows.map((r) => r.userId)), companyId },
      select: { id: true, name: true, email: true },
    });
    const nameById = new Map(
      users.map((u) => [u.id, u.name?.trim() || u.email]),
    );

    return rows
      .map((r) => ({
        userId: r.userId,
        name: nameById.get(r.userId) ?? 'Removed user',
        credits: Number(r.credits),
        aiTurns: Number(r.aiTurns),
        leads: Number(r.leads),
      }))
      .sort((a, b) => b.credits - a.credits);
  }

  async claimExhaustedNotification(
    companyId: string,
    periodStart: Date,
  ): Promise<boolean> {
    const result = await this.usageRepo
      .createQueryBuilder()
      .update()
      .set({ exhaustedNotifiedAt: () => 'now()' })
      .where('company_id = :companyId', { companyId })
      .andWhere('period_start = :periodStart', { periodStart })
      .andWhere('exhausted_notified_at IS NULL')
      .execute();
    return (result.affected ?? 0) > 0;
  }

  clearContextCache(companyId?: string): void {
    if (companyId) {
      this.contextCache.delete(companyId);
      this.anchorCache.delete(companyId);
      this.companyCache.delete(companyId);
    } else {
      this.contextCache.clear();
      this.anchorCache.clear();
      this.companyCache.clear();
    }
  }

  clearPromptCache(companyId?: string): void {
    companyId ? this.promptCache.delete(companyId) : this.promptCache.clear();
  }
}
