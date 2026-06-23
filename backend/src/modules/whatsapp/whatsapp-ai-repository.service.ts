import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { Company } from '../companies/entities/company.entity';
import { Listing, ListingStatus, ListingType } from '../properties/entities/listing.entity';
import { Unit, UnitStatus } from '../properties/entities/unit.entity';
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
  listings: Listing[];
  cachedAt: number;
}

interface PromptCache {
  prompt: string | null;
  cachedAt: number;
  ttl: number;
}

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
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    @InjectRepository(WhatsappSettings)
    private readonly settingsRepo: Repository<WhatsappSettings>,
  ) {}

  async getCompanyAndListings(companyId: string): Promise<{ company: Company | null; listings: Listing[] }> {
    const cached = this.contextCache.get(companyId);
    if (cached && Date.now() - cached.cachedAt < this.CONTEXT_TTL_MS) {
      return { company: cached.company, listings: cached.listings };
    }
    const [company, listings] = await Promise.all([
      this.companyRepo.findOne({ where: { id: companyId } }),
      this.listingRepo.find({
        where: { companyId, status: ListingStatus.ACTIVE },
        relations: ['unit', 'unit.asset', 'unit.asset.locality', 'unit.asset.locality.city'],
        order: { featured: 'DESC', createdAt: 'DESC' },
        take: 40,
      }),
    ]);
    this.contextCache.set(companyId, { company, listings, cachedAt: Date.now() });
    return { company, listings };
  }

  async getAvailableUnits(companyId: string): Promise<Unit[]> {
    return this.unitRepo.find({
      where: { companyId, status: UnitStatus.AVAILABLE },
      relations: ['asset', 'asset.locality', 'asset.locality.city'],
      order: { createdAt: 'DESC' },
      take: 40,
    });
  }

  async searchProperties(companyId: string, filters: PropertySearchFilters): Promise<Listing[]> {
    const where: Record<string, any> = { companyId, status: ListingStatus.ACTIVE };

    if (filters.type) {
      where['type'] = ListingType[filters.type.toUpperCase() as keyof typeof ListingType] ?? filters.type;
    }
    if (filters.minPrice !== undefined && filters.maxPrice !== undefined) {
      where['price'] = Between(filters.minPrice, filters.maxPrice);
    } else if (filters.minPrice !== undefined) {
      where['price'] = MoreThanOrEqual(filters.minPrice);
    } else if (filters.maxPrice !== undefined) {
      where['price'] = LessThanOrEqual(filters.maxPrice);
    }

    const listings = await this.listingRepo.find({
      where,
      relations: ['unit', 'unit.asset', 'unit.asset.locality', 'unit.asset.locality.city'],
      order: { featured: 'DESC', createdAt: 'DESC' },
      take: 20,
    });

    if (filters.bedrooms !== undefined) {
      return listings.filter(l => l.unit?.bedrooms === filters.bedrooms);
    }
    if (filters.city) {
      const cityLower = filters.city.toLowerCase();
      return listings.filter(l => {
        const city = (l.unit?.asset?.locality as any)?.city?.name ?? '';
        return city.toLowerCase().includes(cityLower);
      });
    }
    return listings;
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
    await this.settingsRepo.upsert({ companyId, aiEnabled: value }, ['companyId']);
  }

  async loadAiEnabled(companyId: string): Promise<boolean | null> {
    const row = await this.settingsRepo.findOne({ where: { companyId }, select: { aiEnabled: true } });
    return row?.aiEnabled ?? null;
  }

  async checkLimitAndIncrement(companyId: string, limit: number): Promise<{ allowed: boolean }> {
    const row = await this.settingsRepo.findOne({ where: { companyId } });
    const now = new Date();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    const windowExpired = !row?.aiWeeklyWindowStart ||
      now.getTime() - new Date(row.aiWeeklyWindowStart).getTime() >= sevenDaysMs;

    const currentCount = windowExpired ? 0 : (row?.aiWeeklyCount ?? 0);

    if (currentCount >= limit) return { allowed: false };

    await this.settingsRepo.upsert(
      {
        companyId,
        aiWeeklyCount: currentCount + 1,
        aiWeeklyWindowStart: windowExpired ? now : (row!.aiWeeklyWindowStart ?? now),
      },
      ['companyId'],
    );

    return { allowed: true };
  }

  async getWeeklyUsage(companyId: string): Promise<{ count: number; windowStart: Date | null }> {
    const row = await this.settingsRepo.findOne({
      where: { companyId },
      select: { aiWeeklyCount: true, aiWeeklyWindowStart: true },
    });
    if (!row?.aiWeeklyWindowStart) return { count: 0, windowStart: null };

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const expired = Date.now() - new Date(row.aiWeeklyWindowStart).getTime() >= sevenDaysMs;
    if (expired) return { count: 0, windowStart: null };

    return { count: row.aiWeeklyCount, windowStart: new Date(row.aiWeeklyWindowStart) };
  }

  clearContextCache(companyId?: string): void {
    companyId ? this.contextCache.delete(companyId) : this.contextCache.clear();
  }

  clearPromptCache(companyId?: string): void {
    companyId ? this.promptCache.delete(companyId) : this.promptCache.clear();
  }
}
