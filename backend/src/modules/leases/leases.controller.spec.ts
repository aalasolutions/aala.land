import { Test, TestingModule } from '@nestjs/testing';
import { LeasesController } from './leases.controller';
import { LeasesService } from './leases.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LeaseStatus, LeaseType } from './entities/lease.entity';

describe('LeasesController', () => {
  let controller: LeasesController;
  let service: jest.Mocked<LeasesService>;

  const companyId = 'company-uuid-1';
  const mockReq = { user: { companyId, userId: 'user-uuid-1' } };

  const mockLease = {
    id: 'lease-uuid-1',
    companyId,
    unitId: 'unit-uuid-1',
    tenantName: 'Ahmed Al-Rashid',
    type: LeaseType.RESIDENTIAL,
    status: LeaseStatus.ACTIVE,
    monthlyRent: 5000,
  };

  const paginated = { data: [mockLease], total: 1, page: 1, limit: 20 };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeasesController],
      providers: [
        {
          provide: LeasesService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            findByUnit: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LeasesController>(LeasesController);
    service = module.get(LeasesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('creates lease scoped to company', async () => {
      service.create.mockResolvedValue(mockLease as any);

      const dto = { unitId: 'unit-uuid-1', tenantName: 'Ahmed', startDate: '2026-01-01', endDate: '2026-12-31', monthlyRent: 5000 };
      const result = await controller.create(dto as any, mockReq);

      expect(service.create).toHaveBeenCalledWith(companyId, dto);
      expect(result).toEqual(mockLease);
    });
  });

  describe('findAll', () => {
    it('returns paginated leases', async () => {
      service.findAll.mockResolvedValue(paginated as any);

      const result = await controller.findAll(mockReq, 1, 20);

      expect(service.findAll).toHaveBeenCalledWith(companyId, 1, 20, undefined);
    });
  });

  describe('findByUnit', () => {
    it('returns leases for unit', async () => {
      service.findByUnit.mockResolvedValue([mockLease] as any);

      const result = await controller.findByUnit('unit-uuid-1', mockReq);

      expect(service.findByUnit).toHaveBeenCalledWith('unit-uuid-1', companyId);
    });
  });

  describe('findOne', () => {
    it('returns lease by id', async () => {
      service.findOne.mockResolvedValue(mockLease as any);

      await controller.findOne('lease-uuid-1', mockReq);

      expect(service.findOne).toHaveBeenCalledWith('lease-uuid-1', companyId);
    });
  });

  describe('update', () => {
    it('updates lease', async () => {
      service.update.mockResolvedValue({ ...mockLease, status: LeaseStatus.EXPIRED } as any);

      await controller.update('lease-uuid-1', { status: LeaseStatus.EXPIRED }, mockReq);

      expect(service.update).toHaveBeenCalledWith('lease-uuid-1', companyId, { status: LeaseStatus.EXPIRED });
    });
  });

  describe('remove', () => {
    it('removes lease', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove('lease-uuid-1', mockReq);

      expect(service.remove).toHaveBeenCalledWith('lease-uuid-1', companyId);
    });
  });
});
