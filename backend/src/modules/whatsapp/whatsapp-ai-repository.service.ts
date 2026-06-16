import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../companies/entities/company.entity';
import { Listing, ListingStatus } from '../properties/entities/listing.entity';
import { Unit, UnitStatus } from '../properties/entities/unit.entity';
import { WhatsappSettings } from './entities/whatsapp-settings.entity';

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

  clearContextCache(companyId?: string): void {
    companyId ? this.contextCache.delete(companyId) : this.contextCache.clear();
  }

  clearPromptCache(companyId?: string): void {
    companyId ? this.promptCache.delete(companyId) : this.promptCache.clear();
  }
}
