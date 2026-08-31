import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { DataSource } from 'typeorm';

describe('SearchService', () => {
  let service: SearchService;
  let dataSource: { query: jest.Mock } & Partial<
    Record<keyof DataSource, jest.Mock>
  >;

  beforeEach(async () => {
    dataSource = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SearchService, { provide: DataSource, useValue: dataSource }],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return properties and agents when results are found', async () => {
    const mockCities = [{ id: '1', name: 'Dubai' }];
    const mockLocalities = [{ id: '2', name: 'JBR', cityName: 'Dubai' }];
    const mockAssets = [
      { id: '3', name: 'Marina Towers', localityId: '2', localityName: 'JBR' },
    ];
    const mockAgents = [{ id: 'a1', name: 'John Doe', role: 'agent' }];

    dataSource.query
      .mockResolvedValueOnce(mockCities) // Cities query
      .mockResolvedValueOnce(mockLocalities) // Localities query
      .mockResolvedValueOnce(mockAssets) // Assets query
      .mockResolvedValueOnce(mockAgents); // Agents query

    const result = await service.search('test', 'company1');

    expect(result.properties).toHaveLength(3);
    expect(result.agents).toHaveLength(1);
    expect(result.properties[0]).toEqual({
      type: 'city',
      id: '1',
      name: 'Dubai',
      subtitle: 'City',
    });
    expect(result.properties[1]).toEqual({
      type: 'locality',
      id: '2',
      name: 'JBR',
      subtitle: 'Dubai',
    });
    expect(result.properties[2]).toEqual({
      type: 'asset',
      id: '3',
      name: 'Marina Towers',
      subtitle: 'JBR',
      localityId: '2',
    });
    expect(result.agents[0]).toEqual({
      type: 'agent',
      id: 'a1',
      name: 'John Doe',
      subtitle: 'agent',
    });
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
    const term = `${q.toLowerCase()}%`;

    dataSource.query.mockResolvedValue([]); // Mock all queries to return empty

    await service.search(q, companyId);

    // Verify companyId is passed to all queries (checking one example is sufficient)
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('company_id = $2'),
      expect.arrayContaining([term, companyId]),
    );
  });

  it('should filter by regionCode when provided', async () => {
    const companyId = 'company1';
    const regionCode = 'dubai';
    const q = 'test';
    const term = `${q.toLowerCase()}%`;

    dataSource.query.mockResolvedValue([]);

    await service.search(q, companyId, regionCode);

    // Verify regionCode is passed to relevant queries
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('region_code = ANY($3)'),
      expect.arrayContaining([term, companyId, [regionCode]]),
    );
    // The agent query does not use regionCode, so it should not be in its parameters
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('users'),
      expect.arrayContaining([term, companyId]),
    );
  });

  it('should handle different query parameters for regionCode present/absent', async () => {
    const companyId = 'company1';
    const q = 'test';
    const term = `${q.toLowerCase()}%`;

    dataSource.query.mockResolvedValue([]);

    // Test without regionCode
    await service.search(q, companyId);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.not.stringContaining('region_code'),
      expect.arrayContaining([term, companyId]),
    );

    // Test with regionCode
    dataSource.query.mockClear();
    await service.search(q, companyId, 'dubai');
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('region_code'),
      expect.arrayContaining([term, companyId, ['dubai']]),
    );
  });

  it('should exclude super_admin users from agent search results', async () => {
    const companyId = 'company1';
    const q = 'test';
    const term = `${q.toLowerCase()}%`;

    dataSource.query.mockResolvedValue([]);

    await service.search(q, companyId);

    // Verify the agents query excludes super_admin users
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining("role != 'super_admin'"),
      expect.arrayContaining([term, companyId]),
    );
  });
  describe('region scoping', () => {
    const makkahManager = { role: 'manager', regionCodes: ['makkah'] };
    const twoRegionManager = {
      role: 'manager',
      regionCodes: ['makkah', 'punjab'],
    };
    const admin = { role: 'company_admin', regionCodes: ['makkah'] };
    const unassignedManager = { role: 'manager', regionCodes: [] };

    const cityRows = [
      { id: 'city-makkah', name: 'Makkah City', regionCode: 'makkah' },
      { id: 'city-punjab', name: 'Punjab City', regionCode: 'punjab' },
    ];
    const localityRows = [
      {
        id: 'loc-makkah',
        name: 'Makkah Locality',
        cityName: 'Makkah City',
        regionCode: 'makkah',
      },
      {
        id: 'loc-punjab',
        name: 'Punjab Locality',
        cityName: 'Punjab City',
        regionCode: 'punjab',
      },
    ];
    const assetRows = [
      {
        id: 'asset-makkah',
        name: 'Makkah Tower',
        localityId: 'loc-makkah',
        localityName: 'Makkah Locality',
        regionCode: 'makkah',
      },
      {
        id: 'asset-punjab',
        name: 'Punjab Tower',
        localityId: 'loc-punjab',
        localityName: 'Punjab Locality',
        regionCode: 'punjab',
      },
    ];
    const agentRows = [{ id: 'agent-1', name: 'Agent One', role: 'agent' }];

    // Stands in for Postgres: rows survive only when the ANY() predicate the
    // service spliced in admits their region.
    function seedRegions() {
      dataSource.query.mockImplementation((sql: string, params: unknown[]) => {
        if (sql.includes('FROM users')) {
          return Promise.resolve(agentRows);
        }
        const table = sql.includes('FROM cities c')
          ? cityRows
          : sql.includes('FROM localities l')
            ? localityRows
            : assetRows;
        const match = /region_code = ANY\(\$(\d+)\)/.exec(sql);
        if (!match) {
          return Promise.resolve(table);
        }
        const codes = params[Number(match[1]) - 1] as string[];
        return Promise.resolve(
          table.filter((row) => codes.includes(row.regionCode)),
        );
      });
    }

    it('confines properties to the caller regions with no regionCode argument', async () => {
      seedRegions();

      const result = await service.search('test', 'company1', undefined, makkahManager);

      expect(result.properties.map((p: any) => p.id)).toEqual([
        'city-makkah',
        'loc-makkah',
        'asset-makkah',
      ]);
    });

    it('returns no properties from a region outside the caller assignments', async () => {
      seedRegions();

      const result = await service.search('test', 'company1', 'punjab', makkahManager);

      expect(result.properties).toEqual([]);
    });

    it('narrows to a requested region the caller is assigned to', async () => {
      seedRegions();

      const result = await service.search(
        'test',
        'company1',
        'punjab',
        twoRegionManager,
      );

      expect(result.properties.map((p: any) => p.id)).toEqual([
        'city-punjab',
        'loc-punjab',
        'asset-punjab',
      ]);
    });

    it('leaves properties unfiltered for admins', async () => {
      seedRegions();

      const result = await service.search('test', 'company1', undefined, admin);

      expect(result.properties).toHaveLength(6);
    });

    it('stays unfiltered when no caller is supplied', async () => {
      seedRegions();

      const result = await service.search('test', 'company1');

      expect(result.properties).toHaveLength(6);
    });

    it('returns no properties when the caller has no assigned region', async () => {
      seedRegions();

      const result = await service.search(
        'test',
        'company1',
        undefined,
        unassignedManager,
      );

      expect(result.properties).toEqual([]);
      // The agent lookup carries no region predicate, so it still runs.
      expect(result.agents).toHaveLength(1);
      expect(dataSource.query).toHaveBeenCalledTimes(1);
    });
  });
});
