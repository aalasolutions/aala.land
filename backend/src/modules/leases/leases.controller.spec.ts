import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  ParseEnumPipe,
  PipeTransform,
} from '@nestjs/common';
import { LeaseArchivedFilter } from './dto/lease-archived-filter.enum';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LeaseReasonDto, OptionalLeaseReasonDto } from './dto/lease-reason.dto';
import { LeasesController } from './leases.controller';
import { LeasesService } from './leases.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LeaseStatus, LeaseType } from './entities/lease.entity';

describe('LeasesController', () => {
  let controller: LeasesController;
  let service: jest.Mocked<LeasesService>;

  const companyId = 'company-uuid-1';
  const mockReq = {
    user: {
      companyId,
      userId: 'user-uuid-1',
      email: 'admin@test.com',
      role: 'company_admin',
      regionCodes: ['dubai'],
    },
  };

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
            terminate: jest.fn(),
            archive: jest.fn(),
            unarchive: jest.fn(),
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

      const dto = {
        unitId: 'unit-uuid-1',
        tenantName: 'Ahmed',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        monthlyRent: 5000,
      };
      const result = await controller.create(dto as any, mockReq);

      expect(service.create).toHaveBeenCalledWith(companyId, dto, mockReq.user);
      expect(result).toEqual(mockLease);
    });
  });

  describe('findAll', () => {
    it('returns paginated leases', async () => {
      service.findAll.mockResolvedValue(paginated as any);

      const result = await controller.findAll(mockReq, 1, 20);

      expect(service.findAll).toHaveBeenCalledWith(
        companyId,
        1,
        20,
        undefined,
        undefined,
        {
          status: undefined,
          type: undefined,
          search: undefined,
          dateFrom: undefined,
          dateTo: undefined,
          archived: undefined,
        },
        mockReq.user,
      );
    });

    it('rejects an AGENT calling the unfiltered list (no contactId)', () => {
      const agentReq = { user: { ...mockReq.user, role: 'agent' } };

      expect(() => controller.findAll(agentReq as any, 1, 20)).toThrow(
        ForbiddenException,
      );
      expect(service.findAll).not.toHaveBeenCalled();
    });

    it('allows an AGENT scoped to a contactId', async () => {
      service.findAll.mockResolvedValue(paginated as any);
      const agentReq = { user: { ...mockReq.user, role: 'agent' } };

      await controller.findAll(
        agentReq as any,
        1,
        20,
        undefined,
        'contact-uuid-1',
      );

      expect(service.findAll).toHaveBeenCalledWith(
        companyId,
        1,
        20,
        undefined,
        'contact-uuid-1',
        {
          status: undefined,
          type: undefined,
          search: undefined,
          dateFrom: undefined,
          dateTo: undefined,
          archived: undefined,
        },
        agentReq.user,
      );
    });

    it('allows an ACCOUNTANT the unfiltered list (unscoped, matches leads/units)', async () => {
      service.findAll.mockResolvedValue(paginated as any);
      const accountantReq = { user: { ...mockReq.user, role: 'accountant' } };

      await controller.findAll(accountantReq as any, 1, 20);

      expect(service.findAll).toHaveBeenCalledWith(
        companyId,
        1,
        20,
        undefined,
        undefined,
        {
          status: undefined,
          type: undefined,
          search: undefined,
          dateFrom: undefined,
          dateTo: undefined,
          archived: undefined,
        },
        accountantReq.user,
      );
    });

    it('throws BadRequestException for an invalid dateFrom', () => {
      expect(() =>
        controller.findAll(
          mockReq,
          1,
          20,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          'not-a-date',
        ),
      ).toThrow('dateFrom is not a valid date');

      expect(service.findAll).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for an invalid dateTo', () => {
      expect(() =>
        controller.findAll(
          mockReq,
          1,
          20,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          'not-a-date',
        ),
      ).toThrow('dateTo is not a valid date');

      expect(service.findAll).not.toHaveBeenCalled();
    });
  });

  describe('findByUnit', () => {
    it('returns leases for unit', async () => {
      service.findByUnit.mockResolvedValue([mockLease] as any);

      const result = await controller.findByUnit('unit-uuid-1', mockReq);

      expect(service.findByUnit).toHaveBeenCalledWith(
        'unit-uuid-1',
        companyId,
        mockReq.user,
        'include',
      );
    });

    it('passes through an explicit archived filter', async () => {
      service.findByUnit.mockResolvedValue([mockLease] as any);

      await controller.findByUnit(
        'unit-uuid-1',
        mockReq,
        'exclude' as any,
      );

      expect(service.findByUnit).toHaveBeenCalledWith(
        'unit-uuid-1',
        companyId,
        mockReq.user,
        'exclude',
      );
    });
  });

  describe('findOne', () => {
    it('returns lease by id', async () => {
      service.findOne.mockResolvedValue(mockLease as any);

      await controller.findOne('lease-uuid-1', mockReq);

      expect(service.findOne).toHaveBeenCalledWith(
        'lease-uuid-1',
        companyId,
        mockReq.user,
      );
    });
  });

  describe('update', () => {
    it('updates lease', async () => {
      service.update.mockResolvedValue({
        ...mockLease,
        status: LeaseStatus.EXPIRED,
      } as any);

      await controller.update(
        'lease-uuid-1',
        { status: LeaseStatus.EXPIRED },
        mockReq,
      );

      expect(service.update).toHaveBeenCalledWith(
        'lease-uuid-1',
        companyId,
        { status: LeaseStatus.EXPIRED },
        'user-uuid-1',
        mockReq.user,
      );
    });
  });

  describe('findAll archived param', () => {
    const call = (archived?: string) =>
      controller.findAll(
        mockReq,
        1,
        20,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        archived as any,
      );

    it('passes archived to the service filters', async () => {
      service.findAll.mockResolvedValue(paginated as any);

      await call('only');

      expect(service.findAll.mock.calls[0][5]).toMatchObject({
        archived: 'only',
      });
    });

    it('rejects an unknown archived value', async () => {
      const pipe: PipeTransform = new ParseEnumPipe(LeaseArchivedFilter, {
        optional: true,
      });
      const meta = { type: 'query', data: 'archived' } as const;

      await expect(pipe.transform('all', meta)).rejects.toThrow(
        BadRequestException,
      );
      await expect(pipe.transform(undefined, meta)).resolves.toBeUndefined();
      await expect(pipe.transform('only', meta)).resolves.toBe(
        LeaseArchivedFilter.ONLY,
      );
    });
  });

  const reason = { reason: 'Tenant left' };

  describe('remove', () => {
    it('POST :id/delete passes reason and actor', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove('lease-uuid-1', reason, mockReq);

      expect(service.remove).toHaveBeenCalledWith(
        'lease-uuid-1',
        companyId,
        reason,
        'user-uuid-1',
        mockReq.user,
      );
    });
  });

  describe('terminate, archive, unarchive', () => {
    it('terminate passes reason and actor', async () => {
      service.terminate.mockResolvedValue(mockLease as any);

      await controller.terminate('lease-uuid-1', reason, mockReq);

      expect(service.terminate).toHaveBeenCalledWith(
        'lease-uuid-1',
        companyId,
        reason,
        'user-uuid-1',
        mockReq.user,
      );
    });

    it('archive passes reason and actor', async () => {
      service.archive.mockResolvedValue(mockLease as any);

      await controller.archive('lease-uuid-1', reason, mockReq);

      expect(service.archive).toHaveBeenCalledWith(
        'lease-uuid-1',
        companyId,
        reason,
        'user-uuid-1',
        mockReq.user,
      );
    });

    it('unarchive accepts an empty body', async () => {
      service.unarchive.mockResolvedValue(mockLease as any);

      await controller.unarchive('lease-uuid-1', {}, mockReq);

      expect(service.unarchive).toHaveBeenCalledWith(
        'lease-uuid-1',
        companyId,
        {},
        'user-uuid-1',
        mockReq.user,
      );
    });
  });

  describe('reason DTOs', () => {
    const errorsFor = async (cls: any, body: object) =>
      validate(plainToInstance(cls, body) as object);

    it('LeaseReasonDto requires a non-blank reason', async () => {
      expect(await errorsFor(LeaseReasonDto, {})).not.toHaveLength(0);
      expect(
        await errorsFor(LeaseReasonDto, { reason: '   ' }),
      ).not.toHaveLength(0);
    });

    it('LeaseReasonDto caps reason at 500 characters', async () => {
      expect(
        await errorsFor(LeaseReasonDto, { reason: 'a'.repeat(501) }),
      ).not.toHaveLength(0);
      expect(
        await errorsFor(LeaseReasonDto, { reason: 'a'.repeat(500) }),
      ).toHaveLength(0);
    });

    it('LeaseReasonDto trims the reason', () => {
      const dto = plainToInstance(LeaseReasonDto, { reason: '  left  ' });
      expect(dto.reason).toBe('left');
    });

    it('OptionalLeaseReasonDto accepts no reason', async () => {
      expect(await errorsFor(OptionalLeaseReasonDto, {})).toHaveLength(0);
    });
  });
});
