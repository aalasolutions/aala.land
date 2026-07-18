import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  ILike,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { Company } from '../companies/entities/company.entity';
import { Unit, UnitStatus } from '../properties/entities/unit.entity';
import { PropertyType } from '../properties/entities/property-type.enum';
import { WhatsappSettings } from './entities/whatsapp-settings.entity';

interface PropertySearchFilters {
  bedrooms?: number;
  minPrice?: number;
  maxPrice?: number;
  city?: string;
  type?: string;
}

interface ContextCache {
  company: Company | null;
  units: Unit[];
  cachedAt: number;
}

interface PromptCache {
  prompt: string | null;
  cachedAt: number;
  ttl: number;
}

// NOTE: Single-instance only — caches below are process-local.
// On multi-instance deploys, prompt edits will be stale on other replicas until TTL expires.
@Injectable()
export class WhatsappAiRepositoryService {
  private contextCache = new Map<string, ContextCache>();
  private promptCache = new Map<string, PromptCache>();
  private readonly CONTEXT_TTL_MS = 5 * 60 * 1000;
  private readonly PROMPT_TTL_MS = 2 * 60 * 1000;
  private readonly PROMPT_NULL_TTL_MS = 30 * 1000;

  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    @InjectRepository(WhatsappSettings)
    private readonly settingsRepo: Repository<WhatsappSettings>,
  ) {}

  async getCompanyAndUnits(
    companyId: string,
  ): Promise<{ company: Company | null; units: Unit[] }> {
    const cached = this.contextCache.get(companyId);
    if (cached && Date.now() - cached.cachedAt < this.CONTEXT_TTL_MS) {
      return { company: cached.company, units: cached.units };
    }
    const [company, units] = await Promise.all([
      this.companyRepo.findOne({ where: { id: companyId } }),
      this.unitRepo.find({
        where: { companyId, status: UnitStatus.AVAILABLE },
        relations: ['asset', 'asset.locality', 'asset.locality.city'],
        order: { createdAt: 'DESC' },
        take: 40,
      }),
    ]);
    this.contextCache.set(companyId, { company, units, cachedAt: Date.now() });
    return { company, units };
  }

  async searchProperties(
    companyId: string,
    filters: PropertySearchFilters,
  ): Promise<Unit[]> {
    const where: Record<string, any> = {
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

  async checkLimitAndIncrement(
    companyId: string,
    limit: number,
  ): Promise<{ allowed: boolean }> {
    return this.settingsRepo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(WhatsappSettings);

      // Ensure a row exists before locking it — otherwise concurrent first-time
      // callers can each see no row and both upsert aiWeeklyCount=1, undercounting usage.
      await repo
        .createQueryBuilder()
        .insert()
        .into(WhatsappSettings)
        .values({ companyId })
        .orIgnore()
        .execute();

      const row = await repo
        .createQueryBuilder('ws')
        .setLock('pessimistic_write')
        .where('ws.companyId = :companyId', { companyId })
        .getOne();

      const now = new Date();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      const windowExpired =
        !row?.aiWeeklyWindowStart ||
        now.getTime() - new Date(row.aiWeeklyWindowStart).getTime() >=
          sevenDaysMs;

      const currentCount = windowExpired ? 0 : (row?.aiWeeklyCount ?? 0);

      if (currentCount >= limit) return { allowed: false };

      await repo.upsert(
        {
          companyId,
          aiWeeklyCount: currentCount + 1,
          aiWeeklyWindowStart: windowExpired
            ? now
            : (row!.aiWeeklyWindowStart ?? now),
        },
        ['companyId'],
      );

      return { allowed: true };
    });
  }

  async decrementWeeklyCount(companyId: string): Promise<void> {
    await this.settingsRepo
      .createQueryBuilder()
      .update()
      .set({ aiWeeklyCount: () => 'GREATEST(ai_weekly_count - 1, 0)' })
      .where('company_id = :companyId', { companyId })
      .execute();
  }

  async getWeeklyUsage(
    companyId: string,
  ): Promise<{ count: number; windowStart: Date | null }> {
    const row = await this.settingsRepo.findOne({
      where: { companyId },
      select: { aiWeeklyCount: true, aiWeeklyWindowStart: true },
    });
    if (!row?.aiWeeklyWindowStart) return { count: 0, windowStart: null };

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const expired =
      Date.now() - new Date(row.aiWeeklyWindowStart).getTime() >= sevenDaysMs;
    if (expired) return { count: 0, windowStart: null };

    return {
      count: row.aiWeeklyCount,
      windowStart: new Date(row.aiWeeklyWindowStart),
    };
  }

  clearContextCache(companyId?: string): void {
    companyId ? this.contextCache.delete(companyId) : this.contextCache.clear();
  }

  clearPromptCache(companyId?: string): void {
    companyId ? this.promptCache.delete(companyId) : this.promptCache.clear();
  }
}
