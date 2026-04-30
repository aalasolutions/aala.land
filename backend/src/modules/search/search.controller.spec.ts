import { Test, TestingModule } from '@nestjs/testing';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

describe('SearchController', () => {
  let app: INestApplication;
  let searchController: SearchController;
  let searchService: SearchService;

  const mockSearchService = {
    search: jest.fn().mockResolvedValue({
      properties: [{ type: 'city', id: '1', name: 'Dubai', subtitle: 'City' }],
      agents: [{ type: 'agent', id: 'a1', name: 'John Doe', subtitle: 'agent' }],
    }),
  };

  const mockJwtAuthGuard = {
    canActivate: jest.fn(() => true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        { provide: SearchService, useValue: mockSearchService },
      ],
    })
    .overrideGuard(JwtAuthGuard)
    .useValue(mockJwtAuthGuard)
    .compile();

    app = module.createNestApplication();
    await app.init();

    searchController = module.get<SearchController>(SearchController);
    searchService = module.get<SearchService>(SearchService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('should be defined', () => {
    expect(searchController).toBeDefined();
  });

  describe('search', () => {
    it('should return empty arrays for query less than 2 characters', async () => {
      const req: any = { user: { companyId: 'company1' } };
      const result = await searchController.search(req, 'a');
      expect(result).toEqual({ properties: [], agents: [] });
      expect(searchService.search).not.toHaveBeenCalled();
    });

    it('should return empty arrays for query greater than 100 characters', async () => {
      const longQuery = 'a'.repeat(101);
      const req: any = { user: { companyId: 'company1' } };
      const result = await searchController.search(req, longQuery);
      expect(result).toEqual({ properties: [], agents: [] });
      expect(searchService.search).not.toHaveBeenCalled();
    });

    it('should call SearchService.search with correct parameters', async () => {
      const req: any = { user: { companyId: 'company1' } };
      await searchController.search(req, 'test_query', 'dubai');
      expect(searchService.search).toHaveBeenCalledWith('test_query', 'company1', 'dubai');
    });

    it('should return search results from SearchService', async () => {
      const req: any = { user: { companyId: 'company1' } };
      const expectedResults = {
        properties: [{ type: 'city', id: '1', name: 'Dubai', subtitle: 'City' }],
        agents: [{ type: 'agent', id: 'a1', name: 'John Doe', subtitle: 'agent' }],
      };
      mockSearchService.search.mockResolvedValueOnce(expectedResults);

      const result = await searchController.search(req, 'valid_query');
      expect(result).toEqual(expectedResults);
    });

    it('should use JwtAuthGuard', async () => {
      // This is more of an integration test for the guard, but we can verify it's configured.
      // For a unit test, we've already mocked it, so its `canActivate` is called.
      // We can add a simple end-to-end test using supertest to ensure the guard is active.
      mockJwtAuthGuard.canActivate.mockReturnValue(false);
      const response = await request(app.getHttpServer()).get('/search?q=test');
      expect(response.status).toBe(401); // Unauthorized if guard returns false
    });

    it('should return 200 for authenticated request', async () => {
      const expectedResults = {
        properties: [{ type: 'city', id: '1', name: 'Dubai', subtitle: 'City' }],
        agents: [{ type: 'agent', id: 'a1', name: 'John Doe', subtitle: 'agent' }],
      };
      mockSearchService.search.mockResolvedValue(expectedResults);
      mockJwtAuthGuard.canActivate.mockReturnValue(true);

      const response = await request(app.getHttpServer())
        .get('/search?q=test')
        .set('Authorization', 'Bearer some_token'); // Mocking token presence

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: expectedResults });
    });
  });
});
