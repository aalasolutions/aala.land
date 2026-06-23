import { WhatsappAiRepositoryService } from './whatsapp-ai-repository.service';
import { ListingStatus, ListingType } from '../properties/entities/listing.entity';
import { UnitStatus } from '../properties/entities/unit.entity';

const makeRepos = () => ({
  companyRepo: { findOne: jest.fn().mockResolvedValue({ id: 'c1', name: 'Test Co', activeRegions: [] }) },
  listingRepo: { find: jest.fn().mockResolvedValue([]) },
  unitRepo: { find: jest.fn().mockResolvedValue([]) },
  settingsRepo: {
    findOne: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue(undefined),
  },
});

describe('WhatsappAiRepositoryService', () => {
  let service: WhatsappAiRepositoryService;
  let repos: ReturnType<typeof makeRepos>;

  beforeEach(() => {
    repos = makeRepos();
    service = new WhatsappAiRepositoryService(
      repos.companyRepo as any,
      repos.listingRepo as any,
      repos.unitRepo as any,
      repos.settingsRepo as any,
    );
  });

  describe('getCompanyAndListings', () => {
    it('returns company from companyRepo', async () => {
      const result = await service.getCompanyAndListings('c1');
      expect(result.company).toEqual({ id: 'c1', name: 'Test Co', activeRegions: [] });
    });

    it('queries listings with ACTIVE status for the given company', async () => {
      await service.getCompanyAndListings('c1');
      expect(repos.listingRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: { companyId: 'c1', status: ListingStatus.ACTIVE },
        take: 40,
      }));
    });

    it('returns cached result on second call without hitting DB again', async () => {
      await service.getCompanyAndListings('c1');
      await service.getCompanyAndListings('c1');
      expect(repos.companyRepo.findOne).toHaveBeenCalledTimes(1);
      expect(repos.listingRepo.find).toHaveBeenCalledTimes(1);
    });

    it('re-fetches after clearContextCache', async () => {
      await service.getCompanyAndListings('c1');
      service.clearContextCache('c1');
      await service.getCompanyAndListings('c1');
      expect(repos.companyRepo.findOne).toHaveBeenCalledTimes(2);
    });

    it('cache is scoped per companyId', async () => {
      await service.getCompanyAndListings('c1');
      await service.getCompanyAndListings('c2');
      expect(repos.companyRepo.findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAvailableUnits', () => {
    it('queries units with AVAILABLE status for the given company', async () => {
      await service.getAvailableUnits('c1');
      expect(repos.unitRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: { companyId: 'c1', status: UnitStatus.AVAILABLE },
        take: 40,
      }));
    });
  });

  describe('getCompanyPrompt', () => {
    it('returns null when no settings row exists', async () => {
      const result = await service.getCompanyPrompt('c1');
      expect(result).toBeNull();
    });

    it('returns aiPrompt string when settings row exists', async () => {
      repos.settingsRepo.findOne.mockResolvedValue({ aiPrompt: 'Custom prompt' });
      service = new WhatsappAiRepositoryService(
        repos.companyRepo as any,
        repos.listingRepo as any,
        repos.unitRepo as any,
        repos.settingsRepo as any,
      );
      const result = await service.getCompanyPrompt('c1');
      expect(result).toBe('Custom prompt');
    });

    it('returns null when aiPrompt is empty string', async () => {
      repos.settingsRepo.findOne.mockResolvedValue({ aiPrompt: '' });
      service = new WhatsappAiRepositoryService(
        repos.companyRepo as any,
        repos.listingRepo as any,
        repos.unitRepo as any,
        repos.settingsRepo as any,
      );
      const result = await service.getCompanyPrompt('c1');
      expect(result).toBeNull();
    });

    it('returns cached prompt on second call without re-fetching DB', async () => {
      repos.settingsRepo.findOne.mockResolvedValue({ aiPrompt: 'Cached' });
      service = new WhatsappAiRepositoryService(
        repos.companyRepo as any,
        repos.listingRepo as any,
        repos.unitRepo as any,
        repos.settingsRepo as any,
      );
      await service.getCompanyPrompt('c1');
      await service.getCompanyPrompt('c1');
      expect(repos.settingsRepo.findOne).toHaveBeenCalledTimes(1);
    });

    it('re-fetches after clearPromptCache', async () => {
      await service.getCompanyPrompt('c1');
      service.clearPromptCache('c1');
      await service.getCompanyPrompt('c1');
      expect(repos.settingsRepo.findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('persistAiEnabled', () => {
    it('calls upsert with correct companyId and value', async () => {
      await service.persistAiEnabled('c1', true);
      expect(repos.settingsRepo.upsert).toHaveBeenCalledWith(
        { companyId: 'c1', aiEnabled: true },
        ['companyId'],
      );
    });
  });

  describe('checkLimitAndIncrement', () => {
    it('allows and increments when no settings row exists (fresh start)', async () => {
      repos.settingsRepo.findOne.mockResolvedValue(null);
      const result = await service.checkLimitAndIncrement('c1', 10);
      expect(result.allowed).toBe(true);
      expect(repos.settingsRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 'c1', aiWeeklyCount: 1 }),
        ['companyId'],
      );
    });

    it('denies when count has reached the limit', async () => {
      repos.settingsRepo.findOne.mockResolvedValue({
        aiWeeklyCount: 10,
        aiWeeklyWindowStart: new Date(),
      });
      const result = await service.checkLimitAndIncrement('c1', 10);
      expect(result.allowed).toBe(false);
      expect(repos.settingsRepo.upsert).not.toHaveBeenCalled();
    });

    it('allows and increments when count is below limit', async () => {
      repos.settingsRepo.findOne.mockResolvedValue({
        aiWeeklyCount: 4,
        aiWeeklyWindowStart: new Date(),
      });
      const result = await service.checkLimitAndIncrement('c1', 10);
      expect(result.allowed).toBe(true);
      expect(repos.settingsRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 'c1', aiWeeklyCount: 5 }),
        ['companyId'],
      );
    });

    it('resets window and allows when 7 days have passed', async () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      repos.settingsRepo.findOne.mockResolvedValue({
        aiWeeklyCount: 10,
        aiWeeklyWindowStart: eightDaysAgo,
      });
      const result = await service.checkLimitAndIncrement('c1', 10);
      expect(result.allowed).toBe(true);
      expect(repos.settingsRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 'c1', aiWeeklyCount: 1 }),
        ['companyId'],
      );
    });
  });

  describe('getWeeklyUsage', () => {
    it('returns count 0 and windowStart null when no settings row', async () => {
      repos.settingsRepo.findOne.mockResolvedValue(null);
      const result = await service.getWeeklyUsage('c1');
      expect(result).toEqual({ count: 0, windowStart: null });
    });

    it('returns count 0 when window has expired', async () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      repos.settingsRepo.findOne.mockResolvedValue({
        aiWeeklyCount: 7,
        aiWeeklyWindowStart: eightDaysAgo,
      });
      const result = await service.getWeeklyUsage('c1');
      expect(result).toEqual({ count: 0, windowStart: null });
    });

    it('returns current count and windowStart when window is active', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      repos.settingsRepo.findOne.mockResolvedValue({
        aiWeeklyCount: 5,
        aiWeeklyWindowStart: yesterday,
      });
      const result = await service.getWeeklyUsage('c1');
      expect(result.count).toBe(5);
      expect(result.windowStart).toBeInstanceOf(Date);
    });
  });

  describe('loadAiEnabled', () => {
    it('returns null when no settings row', async () => {
      const result = await service.loadAiEnabled('c1');
      expect(result).toBeNull();
    });

    it('returns aiEnabled value when row exists', async () => {
      repos.settingsRepo.findOne.mockResolvedValue({ aiEnabled: false });
      service = new WhatsappAiRepositoryService(
        repos.companyRepo as any,
        repos.listingRepo as any,
        repos.unitRepo as any,
        repos.settingsRepo as any,
      );
      const result = await service.loadAiEnabled('c1');
      expect(result).toBe(false);
    });
  });

  describe('searchProperties', () => {
    it('queries ACTIVE listings for the company with no filters', async () => {
      await service.searchProperties('c1', {});
      expect(repos.listingRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ companyId: 'c1', status: ListingStatus.ACTIVE }),
      }));
    });

    it('includes type filter when provided in uppercase', async () => {
      await service.searchProperties('c1', { type: 'RENT' });
      expect(repos.listingRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ type: ListingType.RENT }),
      }));
    });

    it('normalizes lowercase type to enum value', async () => {
      await service.searchProperties('c1', { type: 'sale' });
      expect(repos.listingRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ type: ListingType.SALE }),
      }));
    });

    it('does not include type in where when not provided', async () => {
      await service.searchProperties('c1', {});
      const call = repos.listingRepo.find.mock.calls[0][0];
      expect(call.where).not.toHaveProperty('type');
    });

    it('returns listings from listingRepo', async () => {
      const fakeListings = [{ id: 'l1', title: 'Test', unit: { bedrooms: 2 } }];
      repos.listingRepo.find.mockResolvedValue(fakeListings);
      const result = await service.searchProperties('c1', {});
      expect(result).toEqual(fakeListings);
    });

    it('filters by bedrooms after DB query', async () => {
      repos.listingRepo.find.mockResolvedValue([
        { id: 'l1', unit: { bedrooms: 2 } },
        { id: 'l2', unit: { bedrooms: 3 } },
      ]);
      const result = await service.searchProperties('c1', { bedrooms: 2 });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'l1' });
    });

    it('filters by city (case-insensitive) after DB query', async () => {
      repos.listingRepo.find.mockResolvedValue([
        { id: 'l1', unit: { asset: { locality: { city: { name: 'Karachi' } } } } },
        { id: 'l2', unit: { asset: { locality: { city: { name: 'Lahore' } } } } },
      ]);
      const result = await service.searchProperties('c1', { city: 'karachi' });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'l1' });
    });
  });
});
