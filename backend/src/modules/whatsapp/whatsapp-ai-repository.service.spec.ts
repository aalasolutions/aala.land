import { WhatsappAiRepositoryService } from './whatsapp-ai-repository.service';
import { ListingStatus } from '../properties/entities/listing.entity';
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
});
