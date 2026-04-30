import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { DataSource } from 'typeorm';

describe('SearchService', () => {
  let service: SearchService;
  let dataSource: Partial<Record<keyof DataSource, jest.Mock>>;

  beforeEach(async () => {
    dataSource = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return properties and agents when results are found', async () => {
    const mockCities = [{ id: '1', name: 'Dubai' }];
    const mockLocalities = [{ id: '2', name: 'JBR', cityName: 'Dubai' }];
    const mockAssets = [{ id: '3', name: 'Marina Towers', localityId: '2', localityName: 'JBR' }];
    const mockAgents = [{ id: 'a1', name: 'John Doe', role: 'agent' }];

    dataSource.query
      .mockResolvedValueOnce(mockCities) // Cities query
      .mockResolvedValueOnce(mockLocalities) // Localities query
      .mockResolvedValueOnce(mockAssets) // Assets query
      .mockResolvedValueOnce(mockAgents); // Agents query

    const result = await service.search('test', 'company1');

    expect(result.properties).toHaveLength(3);
    expect(result.agents).toHaveLength(1);
    expect(result.properties[0]).toEqual({ type: 'city', id: '1', name: 'Dubai', subtitle: 'City' });
    expect(result.properties[1]).toEqual({ type: 'locality', id: '2', name: 'JBR', subtitle: 'Dubai' });
    expect(result.properties[2]).toEqual({ type: 'asset', id: '3', name: 'Marina Towers', subtitle: 'JBR', localityId: '2' });
    expect(result.agents[0]).toEqual({ type: 'agent', id: 'a1', name: 'John Doe', subtitle: 'agent' });
    expect(dataSource.query).toHaveBeenCalledTimes(4);
  });

  it('should return empty arrays when no results are found', async () => {
    dataSource.query.mockResolvedValue([]);

    const result = await service.search('no_results', 'company1');

    expect(result.properties).toEqual([]);
    expect(result.agents).toEqual([]);
    expect(dataSource.query).toHaveBeenCalledTimes(4);
  });

  it('should filter by companyId', async () => {
    const companyId = 'company2';
    const q = 'test';
    const term = `%${q}%`;

    dataSource.query.mockResolvedValue([]); // Mock all queries to return empty

    await service.search(q, companyId);

    // Verify companyId is passed to all queries (checking one example is sufficient)
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('company_id = $2'), expect.arrayContaining([term, companyId]));
  });

  it('should filter by regionCode when provided', async () => {
    const companyId = 'company1';
    const regionCode = 'dubai';
    const q = 'test';
    const term = `%${q}%`;

    dataSource.query.mockResolvedValue([]);

    await service.search(q, companyId, regionCode);

    // Verify regionCode is passed to relevant queries
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('region_code = $3'), expect.arrayContaining([term, companyId, regionCode]));
    // The agent query does not use regionCode, so it should not be in its parameters
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('users'), expect.arrayContaining([term, companyId]));
  });

  it('should handle different query parameters for regionCode present/absent', async () => {
    const companyId = 'company1';
    const q = 'test';
    const term = `%${q}%`;

    dataSource.query.mockResolvedValue([]);

    // Test without regionCode
    await service.search(q, companyId);
    expect(dataSource.query).toHaveBeenCalledWith(expect.not.stringContaining('region_code'), expect.arrayContaining([term, companyId]));

    // Test with regionCode
    dataSource.query.mockClear();
    await service.search(q, companyId, 'dubai');
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('region_code'), expect.arrayContaining([term, companyId, 'dubai']));
  });
});
