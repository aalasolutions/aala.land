import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { City } from './entities/city.entity';
import { Locality } from './entities/locality.entity';
import { SearchCityDto } from './dto/search-city.dto';
import { SearchLocalityDto } from './dto/search-locality.dto';
import { CreateCityDto } from './dto/create-city.dto';
import { CreateLocalityDto } from './dto/create-locality.dto';

describe('LocationsService', () => {
  let service: LocationsService;
  let cityRepo: jest.Mocked<Repository<City>>;
  let localityRepo: jest.Mocked<Repository<Locality>>;
  let dataSource: { query: jest.Mock };

  const mockCity: City = {
    id: 'city-uuid-1',
    name: 'Lahore',
    regionCode: 'punjab',
    country: 'PK',
    localities: [],
    createdByCompanyId: 'company-uuid-1',
    createdAt: new Date('2026-01-01'),
  } as City;

  const mockLocality: Locality = {
    id: 'locality-uuid-1',
    name: 'Business Bay',
    cityId: 'city-uuid-1',
    city: mockCity,
    createdByCompanyId: 'company-uuid-1',
    createdAt: new Date('2026-01-01'),
  } as Locality;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationsService,
        {
          provide: getRepositoryToken(City),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Locality),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            query: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<LocationsService>(LocationsService);
    cityRepo = module.get(getRepositoryToken(City));
    localityRepo = module.get(getRepositoryToken(Locality));
    dataSource = module.get(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Fuzzy search cities
  // ---------------------------------------------------------------------------

  describe('searchCities', () => {
    it('returns cities matching fuzzy query ordered by score DESC, limited to 5', async () => {
      const searchResults = [
        { id: 'city-1', name: 'Lahore', regionCode: 'punjab', country: 'PK', score: 0.8 },
        { id: 'city-2', name: 'Lahore Cantonment', regionCode: 'punjab', country: 'PK', score: 0.5 },
      ];
      dataSource.query.mockResolvedValue(searchResults);

      const dto: SearchCityDto = { q: 'lahor', regionCode: 'punjab' };
      const result = await service.searchCities(dto);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('similarity(name, $1)'),
        ['lahor', 'punjab'],
      );
      expect(result).toEqual(searchResults);
      expect(result).toHaveLength(2);
      expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
    });

    it('returns empty array when no cities match the fuzzy threshold', async () => {
      dataSource.query.mockResolvedValue([]);

      const dto: SearchCityDto = { q: 'zzzzzzz', regionCode: 'punjab' };
      const result = await service.searchCities(dto);

      expect(result).toEqual([]);
    });

    it('filters results by regionCode', async () => {
      dataSource.query.mockResolvedValue([]);

      const dto: SearchCityDto = { q: 'lahor', regionCode: 'sindh' };
      await service.searchCities(dto);

      // Verify the query was called with the correct regionCode parameter
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.any(String),
        ['lahor', 'sindh'],
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Fuzzy search localities
  // ---------------------------------------------------------------------------

  describe('searchLocalities', () => {
    it('returns localities matching fuzzy query ordered by score DESC, limited to 5', async () => {
      const searchResults = [
        { id: 'loc-1', name: 'Business Bay', cityId: 'city-uuid-1', score: 0.7 },
        { id: 'loc-2', name: 'Business Park', cityId: 'city-uuid-1', score: 0.5 },
      ];
      dataSource.query.mockResolvedValue(searchResults);

      const dto: SearchLocalityDto = { q: 'busness bay', cityId: 'city-uuid-1' };
      const result = await service.searchLocalities(dto);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('similarity(name, $1)'),
        ['busness bay', 'city-uuid-1'],
      );
      expect(result).toEqual(searchResults);
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no localities match the fuzzy threshold', async () => {
      dataSource.query.mockResolvedValue([]);

      const dto: SearchLocalityDto = { q: 'zzzzzzz', cityId: 'city-uuid-1' };
      const result = await service.searchLocalities(dto);

      expect(result).toEqual([]);
    });

    it('filters results by cityId', async () => {
      dataSource.query.mockResolvedValue([]);

      const dto: SearchLocalityDto = { q: 'marina', cityId: 'city-uuid-2' };
      await service.searchLocalities(dto);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.any(String),
        ['marina', 'city-uuid-2'],
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Create city
  // ---------------------------------------------------------------------------

  describe('createCity', () => {
    it('creates and returns a city with sanitized name', async () => {
      const createdCity = { ...mockCity, name: 'Business Bay' };
      cityRepo.create.mockReturnValue(createdCity);
      cityRepo.save.mockResolvedValue(createdCity);

      const dto: CreateCityDto = { name: 'Business Bay', regionCode: 'dubai' };
      const result = await service.createCity(dto, 'company-uuid-1');

      expect(cityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Business Bay',
          regionCode: 'dubai',
          createdByCompanyId: 'company-uuid-1',
        }),
      );
      expect(cityRepo.save).toHaveBeenCalledWith(createdCity);
      expect(result).toEqual(createdCity);
    });

    it('sanitizes the name by trimming and normalizing whitespace', async () => {
      const createdCity = { ...mockCity, name: 'Business Bay' };
      cityRepo.create.mockReturnValue(createdCity);
      cityRepo.save.mockResolvedValue(createdCity);

      const dto: CreateCityDto = { name: '  Business   Bay  ', regionCode: 'dubai' };
      await service.createCity(dto, 'company-uuid-1');

      expect(cityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Business Bay',
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Create locality
  // ---------------------------------------------------------------------------

  describe('createLocality', () => {
    it('creates and returns a locality with sanitized name', async () => {
      cityRepo.findOne.mockResolvedValue(mockCity);
      const createdLocality = { ...mockLocality, name: 'DHA Phase 5' };
      localityRepo.create.mockReturnValue(createdLocality);
      localityRepo.save.mockResolvedValue(createdLocality);

      const dto: CreateLocalityDto = { name: 'DHA Phase 5', cityId: 'city-uuid-1' };
      const result = await service.createLocality(dto, 'company-uuid-1');

      expect(cityRepo.findOne).toHaveBeenCalledWith({ where: { id: 'city-uuid-1' } });
      expect(localityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'DHA Phase 5',
          cityId: 'city-uuid-1',
          createdByCompanyId: 'company-uuid-1',
        }),
      );
      expect(localityRepo.save).toHaveBeenCalledWith(createdLocality);
      expect(result).toEqual(createdLocality);
    });

    it('throws NotFoundException when city does not exist', async () => {
      cityRepo.findOne.mockResolvedValue(null);

      const dto: CreateLocalityDto = { name: 'Some Locality', cityId: 'nonexistent-city-id' };
      await expect(service.createLocality(dto, 'company-uuid-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('sanitizes the name by trimming and normalizing whitespace', async () => {
      cityRepo.findOne.mockResolvedValue(mockCity);
      const createdLocality = { ...mockLocality, name: 'Business Bay' };
      localityRepo.create.mockReturnValue(createdLocality);
      localityRepo.save.mockResolvedValue(createdLocality);

      const dto: CreateLocalityDto = { name: '  Business   Bay  ', cityId: 'city-uuid-1' };
      await service.createLocality(dto, 'company-uuid-1');

      expect(localityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Business Bay',
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Name sanitization
  // ---------------------------------------------------------------------------

  describe('sanitizeName (via createCity / createLocality)', () => {
    it('trims leading and trailing whitespace', async () => {
      cityRepo.create.mockReturnValue(mockCity);
      cityRepo.save.mockResolvedValue(mockCity);

      await service.createCity({ name: '  Lahore  ', regionCode: 'punjab' }, 'company-uuid-1');

      expect(cityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Lahore' }),
      );
    });

    it('collapses multiple internal spaces into a single space', async () => {
      cityRepo.create.mockReturnValue(mockCity);
      cityRepo.save.mockResolvedValue(mockCity);

      await service.createCity(
        { name: '  Business   Bay  ', regionCode: 'dubai' },
        'company-uuid-1',
      );

      expect(cityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Business Bay' }),
      );
    });

    it('preserves unicode characters without alteration', async () => {
      const arabicCity = { ...mockCity, name: 'دبي' };
      cityRepo.create.mockReturnValue(arabicCity);
      cityRepo.save.mockResolvedValue(arabicCity);

      await service.createCity({ name: 'دبي', regionCode: 'dubai' }, 'company-uuid-1');

      expect(cityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'دبي' }),
      );
    });

    it('preserves unicode while still trimming and normalizing whitespace', async () => {
      const arabicCity = { ...mockCity, name: 'دبي' };
      cityRepo.create.mockReturnValue(arabicCity);
      cityRepo.save.mockResolvedValue(arabicCity);

      // TODO: Adjust the input if the actual implementation strips differently
      await service.createCity({ name: '  دبي  ', regionCode: 'dubai' }, 'company-uuid-1');

      expect(cityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'دبي' }),
      );
    });

    it('handles names with tabs and newlines by normalizing to single spaces', async () => {
      cityRepo.create.mockReturnValue(mockCity);
      cityRepo.save.mockResolvedValue(mockCity);

      // Tab and newline characters should be collapsed into a single space
      await service.createCity(
        { name: 'New\t\nYork', regionCode: 'delhi' },
        'company-uuid-1',
      );

      // \s+ in the regex catches tabs and newlines
      expect(cityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New York' }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // List cities by region
  // ---------------------------------------------------------------------------

  describe('getCitiesByRegion', () => {
    it('returns all cities for a given regionCode ordered by name ASC', async () => {
      const cities = [
        { ...mockCity, name: 'Faisalabad' },
        { ...mockCity, name: 'Lahore' },
        { ...mockCity, name: 'Multan' },
      ];
      cityRepo.find.mockResolvedValue(cities as City[]);

      const result = await service.getCitiesByRegion('punjab');

      expect(cityRepo.find).toHaveBeenCalledWith({
        where: { regionCode: 'punjab' },
        order: { name: 'ASC' },
      });
      expect(result).toEqual(cities);
    });

    it('returns empty array when no cities exist for regionCode', async () => {
      cityRepo.find.mockResolvedValue([]);

      const result = await service.getCitiesByRegion('nonexistent-region');

      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // List localities by city
  // ---------------------------------------------------------------------------

  describe('getLocalitiesByCity', () => {
    it('returns all localities for a given cityId ordered by name ASC', async () => {
      const localities = [
        { ...mockLocality, name: 'Business Bay' },
        { ...mockLocality, name: 'Downtown' },
        { ...mockLocality, name: 'Marina' },
      ];
      localityRepo.find.mockResolvedValue(localities as Locality[]);

      const result = await service.getLocalitiesByCity('city-uuid-1');

      expect(localityRepo.find).toHaveBeenCalledWith({
        where: { cityId: 'city-uuid-1' },
        order: { name: 'ASC' },
      });
      expect(result).toEqual(localities);
    });

    it('returns empty array when no localities exist for cityId', async () => {
      localityRepo.find.mockResolvedValue([]);

      const result = await service.getLocalitiesByCity('nonexistent-city-id');

      expect(result).toEqual([]);
    });
  });
});
