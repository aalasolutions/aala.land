import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { RecordHistoryService } from '../record-history/record-history.service';
import { RecordHistoryAction } from '../record-history/entities/record-history.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { UsersService } from '../users/users.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { ChequesService } from './cheques.service';
import { Cheque, ChequeStatus, ChequeType } from './entities/cheque.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Lease } from '../leases/entities/lease.entity';
import { Company } from '../companies/entities/company.entity';
import {
  addDays,
  regionToday,
  regionTodaySql,
} from '../../shared/utils/region-time.util';
import {
  Transaction,
  TransactionCategory,
  TransactionStatus,
  TransactionType,
  PaymentMethod,
} from '../financial/entities/transaction.entity';

describe('ChequesService', () => {
  let service: ChequesService;
  let repo: jest.Mocked<Repository<Cheque>>;
  let unitRepo: jest.Mocked<Repository<Unit>>;
  let leaseRepo: jest.Mocked<Repository<Lease>>;
  let companyRepo: jest.Mocked<Repository<Company>>;
  let module: TestingModule;
  let manager: {
    getRepository: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };
  let txRepo: { insert: jest.Mock; update: jest.Mock };
  let recordHistory: { record: jest.Mock; resolveActorName: jest.Mock };
  let updateBuilder: {
    update: jest.Mock;
    set: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    execute: jest.Mock;
  };

  const companyId = 'company-uuid-1';

  // How the unit > asset > locality > city chain resolves each unit.
  const unitRegions: Record<string, string> = {
    'unit-makkah': 'makkah',
    'unit-punjab': 'punjab',
  };

  // Builds a chainable QueryBuilder mock whose execute() resolves to { affected }.
  const makeUpdateBuilder = (affected: number) => {
    const builder: any = {};
    builder.update = jest.fn().mockReturnValue(builder);
    builder.set = jest.fn().mockReturnValue(builder);
    builder.where = jest.fn().mockReturnValue(builder);
    builder.andWhere = jest.fn().mockReturnValue(builder);
    builder.execute = jest.fn().mockResolvedValue({ affected });
    return builder;
  };

  // Stands in for Postgres on the unit region lookup: resolves the region of
  // whichever unit the service asked about.
  const makeUnitRegionBuilder = () => {
    const builder: any = {};
    let unitId: string | undefined;
    builder.innerJoin = jest.fn().mockReturnValue(builder);
    builder.select = jest.fn().mockReturnValue(builder);
    builder.where = jest.fn((_sql: string, params: { unitId: string }) => {
      unitId = params.unitId;
      return builder;
    });
    builder.andWhere = jest.fn().mockReturnValue(builder);
    builder.getRawOne = jest.fn(() =>
      Promise.resolve(
        unitId && unitRegions[unitId]
          ? { regionCode: unitRegions[unitId] }
          : undefined,
      ),
    );
    return builder;
  };

  const mockCheque: Partial<Cheque> = {
    id: 'cheque-uuid-1',
    companyId,
    leaseId: 'lease-uuid-1',
    chequeNumber: 'CHQ001',
    bankName: 'Emirates NBD',
    accountHolder: 'Ahmed Al-Rashid',
    amount: 15000,
    currency: 'AED',
    dueDate: '2026-03-01',
    status: ChequeStatus.PENDING,
    type: ChequeType.RENT,
    ocrProcessed: false,
    ocrData: null,
    version: 1,
  };

  beforeEach(async () => {
    txRepo = {
      insert: jest.fn().mockResolvedValue({ identifiers: [{ id: 'tx-1' }] }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === Transaction ? txRepo : repo,
      ),
      // Locked reads find live rows unless a test says otherwise.
      findOne: jest.fn((entity: unknown, opts: any) =>
        Promise.resolve(
          entity === Lease
            ? { id: opts?.where?.id, unitId: 'unit-live', deletedAt: null }
            : { id: opts?.where?.id, deletedAt: null },
        ),
      ),
      remove: jest.fn(),
    };
    recordHistory = {
      record: jest.fn().mockResolvedValue(undefined),
      resolveActorName: jest.fn().mockResolvedValue('Actor Name'),
    };
    module = await Test.createTestingModule({
      providers: [
        ChequesService,
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)),
          },
        },
        { provide: RecordHistoryService, useValue: recordHistory },
        {
          provide: getRepositoryToken(Cheque),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            findAndCount: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Unit),
          useValue: {
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Lease),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Company),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findAdmins: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: NotificationsGateway,
          useValue: {
            broadcastToCompany: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ChequesService>(ChequesService);
    repo = module.get(getRepositoryToken(Cheque));
    unitRepo = module.get(getRepositoryToken(Unit));
    leaseRepo = module.get(getRepositoryToken(Lease));
    companyRepo = module.get(getRepositoryToken(Company));

    companyRepo.findOne.mockResolvedValue({
      defaultRegionCode: 'dubai',
      activeRegions: ['dubai', 'makkah', 'punjab'],
    } as Company);
    unitRepo.createQueryBuilder.mockImplementation(
      () => makeUnitRegionBuilder() as never,
    );

    // Default: conditional UPDATE affects one row (the happy path).
    updateBuilder = makeUpdateBuilder(1);
    repo.createQueryBuilder.mockReturnValue(updateBuilder as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates and returns a cheque', async () => {
      repo.create.mockReturnValue(mockCheque as Cheque);
      repo.save.mockResolvedValue(mockCheque as Cheque);

      const dto = {
        chequeNumber: 'CHQ001',
        bankName: 'Emirates NBD',
        accountHolder: 'Ahmed',
        amount: 15000,
        dueDate: '2026-03-01',
      };
      const result = await service.create(companyId, dto as any);

      expect(repo.create).toHaveBeenCalledWith({
        ...dto,
        companyId,
        regionCode: 'dubai',
        currency: 'AED',
      });
      expect(result).toEqual(mockCheque);
    });
  });

  describe('findAll', () => {
    it('returns paginated cheques sorted by due date', async () => {
      repo.findAndCount.mockResolvedValue([[mockCheque as Cheque], 1]);

      const result = await service.findAll(companyId, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { companyId },
        relations: { unit: true },
        skip: 0,
        take: 20,
        order: { dueDate: 'ASC' },
      });
      expect(result.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('returns cheque when found', async () => {
      repo.findOne.mockResolvedValue(mockCheque as Cheque);

      const result = await service.findOne('cheque-uuid-1', companyId);
      expect(result).toEqual(mockCheque);
    });

    it('throws NotFoundException when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('bad-id', companyId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException for wrong company', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.findOne('cheque-uuid-1', 'other-company'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates cheque status to DEPOSITED via a guarded conditional UPDATE', async () => {
      const updated = {
        ...mockCheque,
        status: ChequeStatus.DEPOSITED,
      } as Cheque;
      // First findOne = pre-check read, second findOne = re-read after the UPDATE.
      repo.findOne
        .mockResolvedValueOnce({ ...mockCheque } as Cheque)
        .mockResolvedValueOnce(updated);

      const result = await service.update('cheque-uuid-1', companyId, {
        status: ChequeStatus.DEPOSITED,
      });

      expect(result.status).toBe(ChequeStatus.DEPOSITED);
      // Mutation went through the conditional UPDATE, not repo.save.
      expect(updateBuilder.execute).toHaveBeenCalledTimes(1);
      expect(repo.save).not.toHaveBeenCalled();
      // Guarded on the previously-read status so concurrent transitions serialize.
      expect(updateBuilder.andWhere).toHaveBeenCalledWith(
        'status = :oldStatus',
        {
          oldStatus: ChequeStatus.PENDING,
        },
      );
      // Optimistic-lock version guard: compare-and-set on the read version.
      expect(updateBuilder.andWhere).toHaveBeenCalledWith(
        'version = :expectedVersion',
        {
          expectedVersion: 1,
        },
      );
      // SET bumps the version so a stale-version writer loses.
      const setArg = updateBuilder.set.mock.calls[0][0];
      expect(typeof setArg.version).toBe('function');
      expect(setArg.version()).toBe('version + 1');
    });

    it('rejects a status change when a concurrent edit already bumped the version (affected === 0)', async () => {
      repo.findOne.mockResolvedValueOnce({ ...mockCheque } as Cheque);
      updateBuilder = makeUpdateBuilder(0);
      repo.createQueryBuilder.mockReturnValue(updateBuilder as any);

      await expect(
        service.update('cheque-uuid-1', companyId, {
          status: ChequeStatus.DEPOSITED,
        }),
      ).rejects.toThrow(BadRequestException);

      // No re-read, no notifications after a lost race.
      expect(repo.findOne).toHaveBeenCalledTimes(1);
    });

    it('rejects a NON-status edit when a concurrent edit already bumped the version (lost-update closed)', async () => {
      // A concurrent amount/notes edit committed first (version moved 1 -> 2),
      // so this edit's version = 1 guard matches no rows: affected === 0.
      repo.findOne.mockResolvedValueOnce({ ...mockCheque } as Cheque);
      updateBuilder = makeUpdateBuilder(0);
      repo.createQueryBuilder.mockReturnValue(updateBuilder as any);

      await expect(
        service.update('cheque-uuid-1', companyId, { amount: 20000 } as any),
      ).rejects.toThrow(BadRequestException);

      // Non-status edits are NOT status changes, so the status/terminal guards
      // are absent; only the version guard is applied.
      expect(updateBuilder.andWhere).toHaveBeenCalledWith(
        'version = :expectedVersion',
        {
          expectedVersion: 1,
        },
      );
      expect(updateBuilder.andWhere).not.toHaveBeenCalledWith(
        'status = :oldStatus',
        expect.anything(),
      );
      // repo.save is never used; the lost-update branch is gone.
      expect(repo.save).not.toHaveBeenCalled();
      // No re-read after a lost race.
      expect(repo.findOne).toHaveBeenCalledTimes(1);
    });

    it('broadcasts chequeUpdated event on every update', async () => {
      const updated = {
        ...mockCheque,
        status: ChequeStatus.DEPOSITED,
      } as Cheque;
      repo.findOne
        .mockResolvedValueOnce({ ...mockCheque } as Cheque)
        .mockResolvedValueOnce(updated);
      const gateway = module.get(NotificationsGateway) as any;

      await service.update(
        'cheque-uuid-1',
        companyId,
        { status: ChequeStatus.DEPOSITED },
        'user-1',
      );

      expect(gateway.broadcastToCompany).toHaveBeenCalledWith(
        companyId,
        'chequeUpdated',
        expect.objectContaining({
          id: 'cheque-uuid-1',
          status: ChequeStatus.DEPOSITED,
          updatedBy: 'user-1',
        }),
      );
    });

    it('broadcasts chequeUpdated event even when status does not change', async () => {
      const gateway = module.get(NotificationsGateway) as any;
      const updated = { ...mockCheque, bankName: 'New Bank' } as Cheque;
      // Pre-check read, then re-read after the guarded conditional UPDATE.
      repo.findOne
        .mockResolvedValueOnce({ ...mockCheque } as Cheque)
        .mockResolvedValueOnce(updated);

      await service.update('cheque-uuid-1', companyId, {
        bankName: 'New Bank',
      } as any);

      // Non-status edit also goes through the version-guarded UPDATE, not save.
      expect(updateBuilder.execute).toHaveBeenCalledTimes(1);
      expect(repo.save).not.toHaveBeenCalled();
      expect(gateway.broadcastToCompany).toHaveBeenCalledWith(
        companyId,
        'chequeUpdated',
        expect.objectContaining({
          id: 'cheque-uuid-1',
          status: ChequeStatus.PENDING,
        }),
      );
    });

    it('creates CHEQUE_DEPOSITED notification for admins when status changes to DEPOSITED', async () => {
      const adminUser = {
        id: 'admin-1',
        name: 'Admin One',
        email: 'admin@test.com',
      };
      const updated = {
        ...mockCheque,
        status: ChequeStatus.DEPOSITED,
        depositDate: '2026-09-16',
      } as Cheque;
      repo.findOne
        .mockResolvedValueOnce({ ...mockCheque } as Cheque)
        .mockResolvedValueOnce(updated);
      (module.get(UsersService).findAdmins as jest.Mock).mockResolvedValue([
        adminUser,
      ]);
      const notificationsService = module.get(NotificationsService) as any;

      await service.update(
        'cheque-uuid-1',
        companyId,
        { status: ChequeStatus.DEPOSITED },
        'user-1',
      );

      expect(notificationsService.create).toHaveBeenCalledWith(
        companyId,
        expect.objectContaining({
          userId: 'admin-1',
          title: 'Cheque Deposited',
          message: expect.stringContaining('has been marked as DEPOSITED'),
          type: NotificationType.CHEQUE_DEPOSITED,
          entityType: 'cheque',
          entityId: 'cheque-uuid-1',
        }),
      );
    });

    it('skips admin notification if admin is the same user who performed the update', async () => {
      const updated = {
        ...mockCheque,
        status: ChequeStatus.DEPOSITED,
        depositDate: '2026-09-16',
      } as Cheque;
      repo.findOne
        .mockResolvedValueOnce({ ...mockCheque } as Cheque)
        .mockResolvedValueOnce(updated);
      (module.get(UsersService).findAdmins as jest.Mock).mockResolvedValue([
        { id: 'user-1', name: 'Admin User', email: 'admin@test.com' },
      ]);
      const notificationsService = module.get(NotificationsService) as any;

      await service.update(
        'cheque-uuid-1',
        companyId,
        { status: ChequeStatus.DEPOSITED },
        'user-1',
      );

      expect(notificationsService.create).not.toHaveBeenCalled();
    });

    it('refuses CLEARED and notifies nobody, because clearing must write money', async () => {
      repo.findOne.mockResolvedValue({ ...mockCheque } as Cheque);
      const notificationsService = module.get(NotificationsService) as any;

      await expect(
        service.update(
          'cheque-uuid-1',
          companyId,
          { status: ChequeStatus.CLEARED },
          'user-1',
        ),
      ).rejects.toThrow(/clear endpoint/);
      expect(notificationsService.create).not.toHaveBeenCalled();
    });

    it('creates SYSTEM notification when status changes to CANCELLED', async () => {
      const adminUser = {
        id: 'admin-3',
        name: 'Admin Three',
        email: 'admin3@test.com',
      };
      const updated = {
        ...mockCheque,
        status: ChequeStatus.CANCELLED,
      } as Cheque;
      repo.findOne
        .mockResolvedValueOnce({ ...mockCheque } as Cheque)
        .mockResolvedValueOnce(updated);
      (module.get(UsersService).findAdmins as jest.Mock).mockResolvedValue([
        adminUser,
      ]);
      const notificationsService = module.get(NotificationsService) as any;

      await service.update(
        'cheque-uuid-1',
        companyId,
        { status: ChequeStatus.CANCELLED, reason: 'Replaced by transfer' },
        'user-1',
      );

      expect(notificationsService.create).toHaveBeenCalledWith(
        companyId,
        expect.objectContaining({
          title: 'Cheque Cancelled',
          message: expect.stringContaining('has been CANCELLED'),
          type: NotificationType.SYSTEM,
        }),
      );
    });

    it('creates CHEQUE_BOUNCED notification when status changes to BOUNCED', async () => {
      const adminUser = {
        id: 'admin-4',
        name: 'Admin Four',
        email: 'admin4@test.com',
      };
      const updated = { ...mockCheque, status: ChequeStatus.BOUNCED } as Cheque;
      repo.findOne
        .mockResolvedValueOnce({ ...mockCheque } as Cheque)
        .mockResolvedValueOnce(updated);
      (module.get(UsersService).findAdmins as jest.Mock).mockResolvedValue([
        adminUser,
      ]);
      const notificationsService = module.get(NotificationsService) as any;

      await service.update(
        'cheque-uuid-1',
        companyId,
        { status: ChequeStatus.BOUNCED },
        'user-1',
      );

      expect(notificationsService.create).toHaveBeenCalledWith(
        companyId,
        expect.objectContaining({
          title: 'Cheque Bounced',
          message: expect.stringContaining('has been marked as BOUNCED'),
          type: NotificationType.CHEQUE_BOUNCED,
        }),
      );
    });

    describe('depositDate stamping', () => {
      // 21:00Z is already the next calendar day in Dubai (UTC+4).
      const instant = new Date('2026-09-16T21:00:00Z').getTime();

      beforeEach(() => {
        jest.useFakeTimers({
          now: instant,
          doNotFake: [
            'hrtime',
            'nextTick',
            'performance',
            'queueMicrotask',
            'setImmediate',
            'clearImmediate',
            'setInterval',
            'clearInterval',
            'setTimeout',
            'clearTimeout',
          ],
        });
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('stamps the region calendar day when status is DEPOSITED and depositDate is null', async () => {
        const chequeNoDepositDate = {
          ...mockCheque,
          regionCode: 'dubai',
          depositDate: null,
        } as Cheque;
        const persisted = {
          ...mockCheque,
          regionCode: 'dubai',
          status: ChequeStatus.DEPOSITED,
          depositDate: '2026-09-17',
        } as Cheque;
        repo.findOne
          .mockResolvedValueOnce(chequeNoDepositDate)
          .mockResolvedValueOnce(persisted);

        const result = await service.update('cheque-uuid-1', companyId, {
          status: ChequeStatus.DEPOSITED,
        });

        // depositDate is stamped in the conditional UPDATE's SET clause.
        const setArg = updateBuilder.set.mock.calls[0][0];
        expect(setArg.depositDate).toBe('2026-09-17');
        expect(setArg.status).toBe(ChequeStatus.DEPOSITED);
        // Returned entity is the fresh re-read.
        expect(result.depositDate).toBe('2026-09-17');
      });

      it('falls back to the UTC calendar day when the cheque has no region', async () => {
        const chequeNoRegion = {
          ...mockCheque,
          regionCode: null,
          depositDate: null,
        } as unknown as Cheque;
        repo.findOne
          .mockResolvedValueOnce(chequeNoRegion)
          .mockResolvedValueOnce({ ...chequeNoRegion } as Cheque);

        await service.update('cheque-uuid-1', companyId, {
          status: ChequeStatus.DEPOSITED,
        });

        const setArg = updateBuilder.set.mock.calls[0][0];
        expect(setArg.depositDate).toBe('2026-09-16');
      });

      it('keeps an existing depositDate', async () => {
        const chequeWithDate = {
          ...mockCheque,
          regionCode: 'dubai',
          depositDate: '2026-09-01',
        } as Cheque;
        repo.findOne
          .mockResolvedValueOnce(chequeWithDate)
          .mockResolvedValueOnce({ ...chequeWithDate } as Cheque);

        await service.update('cheque-uuid-1', companyId, {
          status: ChequeStatus.DEPOSITED,
        });

        const setArg = updateBuilder.set.mock.calls[0][0];
        expect(setArg.depositDate).toBe('2026-09-01');
      });
    });

    it('does not allow changing status of a terminal cheque (CLEARED)', async () => {
      const clearedCheque = {
        ...mockCheque,
        status: ChequeStatus.CLEARED,
      } as Cheque;
      repo.findOne.mockResolvedValue(clearedCheque);

      await expect(
        service.update('cheque-uuid-1', companyId, {
          status: ChequeStatus.PENDING,
        } as any),
      ).rejects.toThrow(BadRequestException);

      expect(repo.save).not.toHaveBeenCalled();
    });

    it('does not allow changing status of a terminal cheque (CANCELLED)', async () => {
      const cancelledCheque = {
        ...mockCheque,
        status: ChequeStatus.CANCELLED,
      } as Cheque;
      repo.findOne.mockResolvedValue(cancelledCheque);

      await expect(
        service.update('cheque-uuid-1', companyId, {
          status: ChequeStatus.DEPOSITED,
        } as any),
      ).rejects.toThrow(BadRequestException);

      expect(repo.save).not.toHaveBeenCalled();
    });

    it('does not allow changing status of a terminal cheque (REPLACED)', async () => {
      const replacedCheque = {
        ...mockCheque,
        status: ChequeStatus.REPLACED,
      } as Cheque;
      repo.findOne.mockResolvedValue(replacedCheque);

      await expect(
        service.update('cheque-uuid-1', companyId, {
          status: ChequeStatus.PENDING,
        } as any),
      ).rejects.toThrow(BadRequestException);

      expect(repo.save).not.toHaveBeenCalled();
    });

    it('does not create notifications when status does not change', async () => {
      const notificationsService = module.get(NotificationsService) as any;
      const updated = { ...mockCheque, bankName: 'New Bank Name' } as Cheque;
      repo.findOne
        .mockResolvedValueOnce({ ...mockCheque } as Cheque)
        .mockResolvedValueOnce(updated);
      (module.get(UsersService).findAdmins as jest.Mock).mockResolvedValue([
        { id: 'admin-x', name: 'Admin X', email: 'adminx@test.com' },
      ]);

      await service.update('cheque-uuid-1', companyId, {
        bankName: 'New Bank Name',
      } as any);

      expect(notificationsService.create).not.toHaveBeenCalled();
    });

    it('logs error but continues when notification creation fails', async () => {
      const adminUser = {
        id: 'admin-5',
        name: 'Admin Five',
        email: 'admin5@test.com',
      };
      const updated = {
        ...mockCheque,
        status: ChequeStatus.DEPOSITED,
        depositDate: '2026-09-16',
      } as Cheque;
      repo.findOne
        .mockResolvedValueOnce({ ...mockCheque } as Cheque)
        .mockResolvedValueOnce(updated);
      (module.get(UsersService).findAdmins as jest.Mock).mockResolvedValue([
        adminUser,
      ]);
      const notificationsService = module.get(NotificationsService) as any;
      notificationsService.create.mockRejectedValue(
        new Error('Notification service unavailable'),
      );
      const loggerErrorSpy = jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation();

      const result = await service.update(
        'cheque-uuid-1',
        companyId,
        { status: ChequeStatus.DEPOSITED },
        'user-1',
      );

      expect(result.status).toBe(ChequeStatus.DEPOSITED);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create cheque status notification'),
      );

      loggerErrorSpy.mockRestore();
    });
  });

  describe('record history', () => {
    const primeUpdate = (next: Partial<Cheque>) => {
      repo.findOne
        .mockResolvedValueOnce({ ...mockCheque } as Cheque)
        .mockResolvedValueOnce({ ...mockCheque, ...next } as Cheque);
    };

    it('rejects cancelling without a reason before writing', async () => {
      repo.findOne.mockResolvedValue({ ...mockCheque } as Cheque);

      await expect(
        service.update(
          'cheque-uuid-1',
          companyId,
          { status: ChequeStatus.CANCELLED },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update(
          'cheque-uuid-1',
          companyId,
          { status: ChequeStatus.CANCELLED, reason: '   ' },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(updateBuilder.execute).not.toHaveBeenCalled();
      expect(recordHistory.record).not.toHaveBeenCalled();
    });

    it('records CANCEL with the reason in the update transaction', async () => {
      primeUpdate({ status: ChequeStatus.CANCELLED });

      await service.update(
        'cheque-uuid-1',
        companyId,
        { status: ChequeStatus.CANCELLED, reason: 'Tenant paid by transfer' },
        'user-1',
      );

      expect(manager.getRepository).toHaveBeenCalledWith(Cheque);
      expect(recordHistory.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          companyId,
          action: RecordHistoryAction.CANCEL,
          entityType: 'Cheque',
          entityId: 'cheque-uuid-1',
          entityTitle: 'Cheque CHQ001',
          contextTitle: 'Ahmed Al-Rashid',
          reason: 'Tenant paid by transfer',
          actorId: 'user-1',
          actorName: 'Actor Name',
          metadata: {
            from: ChequeStatus.PENDING,
            to: ChequeStatus.CANCELLED,
          },
        }),
      );
    });

    it('records REPLACE when the cheque is replaced', async () => {
      primeUpdate({ status: ChequeStatus.REPLACED });

      await service.update(
        'cheque-uuid-1',
        companyId,
        { status: ChequeStatus.REPLACED },
        'user-1',
      );

      expect(recordHistory.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: RecordHistoryAction.REPLACE,
          reason: null,
        }),
      );
    });

    it('records STATUS_CHANGE with from and to for other statuses', async () => {
      primeUpdate({ status: ChequeStatus.DEPOSITED });

      await service.update(
        'cheque-uuid-1',
        companyId,
        { status: ChequeStatus.DEPOSITED },
        'user-1',
      );

      expect(recordHistory.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: RecordHistoryAction.STATUS_CHANGE,
          metadata: {
            from: ChequeStatus.PENDING,
            to: ChequeStatus.DEPOSITED,
          },
        }),
      );
    });

    it('records nothing for an edit that keeps the status', async () => {
      primeUpdate({ bankName: 'New Bank' });

      await service.update(
        'cheque-uuid-1',
        companyId,
        { bankName: 'New Bank' },
        'user-1',
      );

      expect(updateBuilder.execute).toHaveBeenCalledTimes(1);
      expect(recordHistory.record).not.toHaveBeenCalled();
    });

    it('records nothing when the guarded UPDATE loses the race', async () => {
      repo.findOne.mockResolvedValueOnce({ ...mockCheque } as Cheque);
      updateBuilder = makeUpdateBuilder(0);
      repo.createQueryBuilder.mockReturnValue(updateBuilder as any);

      await expect(
        service.update(
          'cheque-uuid-1',
          companyId,
          { status: ChequeStatus.DEPOSITED },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(recordHistory.record).not.toHaveBeenCalled();
    });

    it('records BOUNCE with the bounce reason', async () => {
      primeUpdate({ status: ChequeStatus.BOUNCED });

      await service.bounce(
        'cheque-uuid-1',
        companyId,
        { bounceReason: 'Insufficient funds' },
        'user-1',
      );

      expect(recordHistory.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: RecordHistoryAction.BOUNCE,
          entityTitle: 'Cheque CHQ001',
          reason: 'Insufficient funds',
          actorId: 'user-1',
        }),
      );
    });
  });

  describe('archived unit', () => {
    const archivedUnit = { id: 'unit-archived', deletedAt: new Date() } as Unit;

    it('refuses creating a cheque on an archived unit', async () => {
      unitRepo.findOne.mockResolvedValue(archivedUnit);

      await expect(
        service.create(
          companyId,
          { chequeNumber: 'CHQ009', unitId: 'unit-archived' } as any,
          'user-1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('refuses moving a cheque onto an archived unit', async () => {
      repo.findOne.mockResolvedValue({
        ...mockCheque,
        unitId: 'unit-live',
      } as Cheque);
      unitRepo.findOne.mockResolvedValue(archivedUnit);

      await expect(
        service.update(
          'cheque-uuid-1',
          companyId,
          { unitId: 'unit-archived' },
          'user-1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(updateBuilder.execute).not.toHaveBeenCalled();
    });

    const lockedMessage =
      'This unit is archived. Its records can no longer be edited.';

    it('refuses editing a cheque already on an archived unit', async () => {
      repo.findOne.mockResolvedValue({
        ...mockCheque,
        unitId: 'unit-archived',
      } as Cheque);
      unitRepo.findOne.mockResolvedValue(archivedUnit);
      manager.findOne.mockImplementation((entity: unknown) =>
        Promise.resolve(
          entity === Unit
            ? archivedUnit
            : { id: 'lease-uuid-1', unitId: 'unit-archived', deletedAt: null },
        ),
      );

      await expect(
        service.update(
          'cheque-uuid-1',
          companyId,
          { unitId: 'unit-archived', notes: 'Checked' },
          'user-1',
        ),
      ).rejects.toThrow(lockedMessage);
      expect(manager.findOne).toHaveBeenCalledWith(Unit, {
        where: { id: 'unit-archived', companyId },
        select: { id: true, deletedAt: true },
        lock: { mode: 'pessimistic_read' },
      });
      expect(updateBuilder.execute).not.toHaveBeenCalled();
    });

    it('refuses editing a cheque whose lease is archived', async () => {
      repo.findOne.mockResolvedValue({ ...mockCheque } as Cheque);
      manager.findOne.mockImplementation((entity: unknown) =>
        Promise.resolve(
          entity === Lease
            ? { id: 'lease-uuid-1', unitId: 'unit-live', deletedAt: new Date() }
            : null,
        ),
      );

      await expect(
        service.update('cheque-uuid-1', companyId, { notes: 'Checked' }),
      ).rejects.toThrow(
        'This lease is archived. Its records can no longer be edited.',
      );
      expect(updateBuilder.execute).not.toHaveBeenCalled();
    });

    it('refuses editing a cheque whose lease sits on an archived unit', async () => {
      repo.findOne.mockResolvedValue({ ...mockCheque } as Cheque);
      manager.findOne.mockImplementation((entity: unknown) =>
        Promise.resolve(
          entity === Lease
            ? { id: 'lease-uuid-1', unitId: 'unit-archived', deletedAt: null }
            : archivedUnit,
        ),
      );

      await expect(
        service.update('cheque-uuid-1', companyId, { notes: 'Checked' }),
      ).rejects.toThrow(lockedMessage);
      expect(updateBuilder.execute).not.toHaveBeenCalled();
    });

    it('refuses bouncing a cheque on an archived unit', async () => {
      repo.findOne.mockResolvedValue({
        ...mockCheque,
        unitId: 'unit-archived',
      } as Cheque);
      manager.findOne.mockImplementation((entity: unknown) =>
        Promise.resolve(
          entity === Unit
            ? archivedUnit
            : { id: 'lease-uuid-1', unitId: 'unit-archived', deletedAt: null },
        ),
      );

      await expect(
        service.bounce('cheque-uuid-1', companyId, {}),
      ).rejects.toThrow(lockedMessage);
      expect(updateBuilder.execute).not.toHaveBeenCalled();
      expect(recordHistory.record).not.toHaveBeenCalled();
    });

    it('refuses bouncing a cheque whose lease is archived', async () => {
      repo.findOne.mockResolvedValue({ ...mockCheque } as Cheque);
      manager.findOne.mockImplementation((entity: unknown) =>
        Promise.resolve(
          entity === Lease
            ? { id: 'lease-uuid-1', unitId: 'unit-live', deletedAt: new Date() }
            : null,
        ),
      );

      await expect(
        service.bounce('cheque-uuid-1', companyId, {}),
      ).rejects.toThrow(ConflictException);
      expect(updateBuilder.execute).not.toHaveBeenCalled();
    });

    const shareLock = (id: string) => ({
      where: { id, companyId },
      select: { id: true, deletedAt: true },
      lock: { mode: 'pessimistic_read' },
    });

    it('refuses create when the unit is archived after the first read', async () => {
      unitRepo.findOne.mockResolvedValue({
        id: 'unit-late',
        deletedAt: null,
      } as Unit);
      repo.create.mockReturnValue(mockCheque as Cheque);
      manager.findOne.mockImplementation((entity: unknown) =>
        Promise.resolve(
          entity === Unit ? { id: 'unit-late', deletedAt: new Date() } : null,
        ),
      );

      await expect(
        service.create(companyId, {
          chequeNumber: 'CHQ011',
          unitId: 'unit-late',
        } as any),
      ).rejects.toThrow(lockedMessage);
      expect(manager.findOne).toHaveBeenCalledWith(
        Unit,
        shareLock('unit-late'),
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('refuses create when the lease unit is archived after the first read', async () => {
      leaseRepo.findOne.mockResolvedValue({
        id: 'lease-uuid-1',
        unitId: 'unit-late',
        deletedAt: null,
      } as Lease);
      unitRepo.findOne.mockResolvedValue({
        id: 'unit-late',
        deletedAt: null,
      } as Unit);
      repo.create.mockReturnValue(mockCheque as Cheque);
      manager.findOne.mockImplementation((entity: unknown) =>
        Promise.resolve(
          entity === Lease
            ? { id: 'lease-uuid-1', unitId: 'unit-late', deletedAt: null }
            : { id: 'unit-late', deletedAt: new Date() },
        ),
      );

      await expect(
        service.create(companyId, {
          chequeNumber: 'CHQ012',
          leaseId: 'lease-uuid-1',
        } as any),
      ).rejects.toThrow(lockedMessage);
      expect(manager.findOne).toHaveBeenCalledWith(Lease, {
        where: { id: 'lease-uuid-1', companyId },
        select: { id: true, unitId: true, deletedAt: true },
        lock: { mode: 'pessimistic_read' },
      });
      expect(manager.findOne).toHaveBeenCalledWith(
        Unit,
        shareLock('unit-late'),
      );
      expect(
        manager.findOne.mock.calls.findIndex(([e]) => e === Lease),
      ).toBeLessThan(manager.findOne.mock.calls.findIndex(([e]) => e === Unit));
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('refuses create when the unit is deleted while waiting for the lock', async () => {
      unitRepo.findOne.mockResolvedValue({
        id: 'unit-gone',
        deletedAt: null,
      } as Unit);
      repo.create.mockReturnValue(mockCheque as Cheque);
      manager.findOne.mockResolvedValue(null);

      await expect(
        service.create(companyId, {
          chequeNumber: 'CHQ013',
          unitId: 'unit-gone',
        } as any),
      ).rejects.toThrow(new NotFoundException('Unit not found'));
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('refuses create when the lease is deleted while waiting for the lock', async () => {
      leaseRepo.findOne.mockResolvedValue({
        id: 'lease-gone',
        unitId: 'unit-live',
        deletedAt: null,
      } as Lease);
      unitRepo.findOne.mockResolvedValue({
        id: 'unit-live',
        deletedAt: null,
      } as Unit);
      repo.create.mockReturnValue(mockCheque as Cheque);
      manager.findOne.mockResolvedValue(null);

      await expect(
        service.create(companyId, {
          chequeNumber: 'CHQ014',
          leaseId: 'lease-gone',
        } as any),
      ).rejects.toThrow(new NotFoundException('Lease not found'));
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('refuses moving a cheque onto a unit archived after the first read', async () => {
      repo.findOne.mockResolvedValue({
        ...mockCheque,
        unitId: 'unit-live',
      } as Cheque);
      unitRepo.findOne.mockResolvedValue({
        id: 'unit-late',
        deletedAt: null,
      } as Unit);
      manager.findOne.mockImplementation((entity: unknown, opts: any) =>
        Promise.resolve(
          entity === Lease
            ? { id: 'lease-uuid-1', unitId: 'unit-live', deletedAt: null }
            : {
                id: opts.where.id,
                deletedAt: opts.where.id === 'unit-late' ? new Date() : null,
              },
        ),
      );

      await expect(
        service.update(
          'cheque-uuid-1',
          companyId,
          { unitId: 'unit-late' },
          'user-1',
        ),
      ).rejects.toThrow('This unit is archived.');
      expect(manager.findOne).toHaveBeenCalledWith(
        Unit,
        shareLock('unit-late'),
      );
      expect(updateBuilder.execute).not.toHaveBeenCalled();
    });

    describe('create with a lease', () => {
      const dto = { chequeNumber: 'CHQ010', leaseId: 'lease-uuid-1' } as any;

      it('404s a lease of another company', async () => {
        leaseRepo.findOne.mockResolvedValue(null);

        await expect(service.create(companyId, dto)).rejects.toThrow(
          NotFoundException,
        );
        expect(leaseRepo.findOne).toHaveBeenCalledWith({
          where: { id: 'lease-uuid-1', companyId },
          select: { id: true, unitId: true, deletedAt: true },
        });
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('refuses an archived lease', async () => {
        leaseRepo.findOne.mockResolvedValue({
          id: 'lease-uuid-1',
          unitId: 'unit-live',
          deletedAt: new Date(),
        } as Lease);

        await expect(service.create(companyId, dto)).rejects.toThrow(
          ConflictException,
        );
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('refuses a lease on an archived unit', async () => {
        leaseRepo.findOne.mockResolvedValue({
          id: 'lease-uuid-1',
          unitId: 'unit-archived',
          deletedAt: null,
        } as Lease);
        unitRepo.findOne.mockResolvedValue(archivedUnit);

        await expect(service.create(companyId, dto)).rejects.toThrow(
          'This unit is archived.',
        );
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('creates against a live lease', async () => {
        leaseRepo.findOne.mockResolvedValue({
          id: 'lease-uuid-1',
          unitId: 'unit-live',
          deletedAt: null,
        } as Lease);
        unitRepo.findOne.mockResolvedValue({
          id: 'unit-live',
          deletedAt: null,
        } as Unit);
        repo.create.mockReturnValue(mockCheque as Cheque);
        repo.save.mockResolvedValue(mockCheque as Cheque);

        await expect(service.create(companyId, dto)).resolves.toEqual(
          mockCheque,
        );
      });
    });
  });

  describe('processOcr', () => {
    it('processes OCR when API key not configured returns stub data', async () => {
      const originalEnv = process.env;
      delete process.env.OCR_API_KEY;

      repo.findOne.mockResolvedValue({ ...mockCheque } as Cheque);
      repo.save.mockImplementation(async (c) => c as Cheque);

      const result = await service.processOcr(
        'cheque-uuid-1',
        companyId,
        'https://example.com/cheque.jpg',
      );

      expect(result.ocrImageUrl).toBe('https://example.com/cheque.jpg');
      expect(result.ocrProcessed).toBe(true);
      expect(result.ocrData).toEqual({
        raw: null,
        confidence: 0,
        provider: 'none',
      });

      process.env = originalEnv;
    });

    it('marks ocrProcessed false when OCR API throws', async () => {
      process.env.OCR_API_KEY = 'test-key';

      repo.findOne.mockResolvedValue({ ...mockCheque } as Cheque);
      repo.save.mockImplementation(async (c) => c as Cheque);

      jest
        .spyOn(service as any, 'runOcrExtraction')
        .mockRejectedValue(new Error('OCR error'));

      const result = await service.processOcr(
        'cheque-uuid-1',
        companyId,
        'https://example.com/cheque.jpg',
      );

      expect(result.ocrProcessed).toBe(false);

      delete process.env.OCR_API_KEY;
    });
  });

  describe('bounce', () => {
    it('increments bounceCount atomically in the database and sets status to BOUNCED', async () => {
      const preCheck = {
        ...mockCheque,
        bounceCount: 0,
        bounceReason: null,
        lastBounceDate: null,
      } as unknown as Cheque;
      const persisted = {
        ...mockCheque,
        bounceCount: 1,
        bounceReason: 'Insufficient funds',
        lastBounceDate: new Date(),
        status: ChequeStatus.BOUNCED,
      } as unknown as Cheque;
      // First findOne = existence check, second = re-read after the atomic UPDATE.
      repo.findOne
        .mockResolvedValueOnce(preCheck)
        .mockResolvedValueOnce(persisted);

      const result = await service.bounce('cheque-uuid-1', companyId, {
        bounceReason: 'Insufficient funds',
      });

      // Increment is a raw SQL expression, not a JS read-modify-write.
      const setArg = updateBuilder.set.mock.calls[0][0];
      expect(typeof setArg.bounceCount).toBe('function');
      expect(setArg.bounceCount()).toBe('bounce_count + 1');
      expect(setArg.bounceReason).toBe('Insufficient funds');
      expect(setArg.lastBounceDate).toBeInstanceOf(Date);
      expect(setArg.status).toBe(ChequeStatus.BOUNCED);
      // Bounce bumps the optimistic-lock version so a concurrent stale update()
      // cannot revert this BOUNCED row.
      expect(typeof setArg.version).toBe('function');
      expect(setArg.version()).toBe('version + 1');

      // repo.save is never used for the mutation.
      expect(repo.save).not.toHaveBeenCalled();

      // Returned value is the fresh re-read.
      expect(result.bounceCount).toBe(1);
      expect(result.status).toBe(ChequeStatus.BOUNCED);
    });

    it('scopes the atomic UPDATE by id and companyId', async () => {
      repo.findOne
        .mockResolvedValueOnce({ ...mockCheque } as Cheque)
        .mockResolvedValueOnce({
          ...mockCheque,
          status: ChequeStatus.BOUNCED,
        } as Cheque);

      await service.bounce('cheque-uuid-1', companyId, {
        bounceReason: 'Account closed',
      });

      expect(updateBuilder.where).toHaveBeenCalledWith('id = :id', {
        id: 'cheque-uuid-1',
      });
      expect(updateBuilder.andWhere).toHaveBeenCalledWith(
        'company_id = :companyId',
        { companyId },
      );
    });

    it('sets bounceReason to null when not provided', async () => {
      repo.findOne
        .mockResolvedValueOnce({ ...mockCheque } as Cheque)
        .mockResolvedValueOnce({
          ...mockCheque,
          bounceReason: null,
          status: ChequeStatus.BOUNCED,
        } as Cheque);

      const result = await service.bounce('cheque-uuid-1', companyId, {});

      const setArg = updateBuilder.set.mock.calls[0][0];
      expect(setArg.bounceReason).toBeNull();
      expect(result.status).toBe(ChequeStatus.BOUNCED);
    });

    it('throws NotFoundException for wrong company (findOne pre-check)', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.bounce('cheque-uuid-1', 'other-company', {}),
      ).rejects.toThrow(NotFoundException);
      expect(updateBuilder.execute).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the atomic UPDATE affects no rows (deleted mid-flight)', async () => {
      repo.findOne.mockResolvedValueOnce({ ...mockCheque } as Cheque);
      updateBuilder = makeUpdateBuilder(0);
      repo.createQueryBuilder.mockReturnValue(updateBuilder as any);
      // The row really is gone, so the failure-path re-read finds nothing.
      manager.findOne = jest.fn((entity: unknown, opts: any) =>
        Promise.resolve(
          entity === Cheque
            ? null
            : { id: opts?.where?.id, unitId: null, deletedAt: null },
        ),
      );

      await expect(
        service.bounce('cheque-uuid-1', companyId, {}),
      ).rejects.toThrow(NotFoundException);
      // Still no re-read through the repository; the check rides the transaction.
      expect(repo.findOne).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when the cheque went terminal mid-flight', async () => {
      repo.findOne.mockResolvedValueOnce({ ...mockCheque } as Cheque);
      updateBuilder = makeUpdateBuilder(0);
      repo.createQueryBuilder.mockReturnValue(updateBuilder as any);
      manager.findOne = jest.fn((entity: unknown, opts: any) =>
        Promise.resolve(
          entity === Cheque
            ? { id: 'cheque-uuid-1', status: ChequeStatus.CLEARED }
            : { id: opts?.where?.id, unitId: null, deletedAt: null },
        ),
      );

      await expect(
        service.bounce('cheque-uuid-1', companyId, {}),
      ).rejects.toThrow(/became CLEARED/);
    });

    it('refuses to bounce a cleared cheque, so its income row cannot outlive it', async () => {
      repo.findOne.mockResolvedValue({
        ...mockCheque,
        status: ChequeStatus.CLEARED,
      } as Cheque);

      await expect(
        service.bounce('cheque-uuid-1', companyId, {}),
      ).rejects.toThrow(ConflictException);
      expect(updateBuilder.execute).not.toHaveBeenCalled();
    });

    it('refuses to bounce a cancelled or replaced cheque', async () => {
      for (const status of [ChequeStatus.CANCELLED, ChequeStatus.REPLACED]) {
        repo.findOne.mockResolvedValue({ ...mockCheque, status } as Cheque);
        await expect(
          service.bounce('cheque-uuid-1', companyId, {}),
        ).rejects.toThrow(ConflictException);
      }
      expect(updateBuilder.execute).not.toHaveBeenCalled();
    });

    it('still bounces a cheque that already bounced once', async () => {
      repo.findOne.mockResolvedValue({
        ...mockCheque,
        status: ChequeStatus.BOUNCED,
        bounceCount: 1,
      } as Cheque);

      await service.bounce('cheque-uuid-1', companyId, {});

      expect(updateBuilder.execute).toHaveBeenCalled();
    });
  });

  describe('getCollectionSchedule', () => {
    const today = regionTodaySql('cheque.region_code');
    const weekEnd = `(${today} + (7 - EXTRACT(DOW FROM ${today}))::int)`;
    const nextWeekEnd = `(${weekEnd} + 7)`;
    const monthEnd = `((date_trunc('month', ${today}) + interval '1 month - 1 day')::date)`;
    const bucketConditions = [
      `cheque.due_date < ${today}`,
      `cheque.due_date BETWEEN ${today} AND ${weekEnd}`,
      `cheque.due_date > ${weekEnd} AND cheque.due_date <= ${nextWeekEnd}`,
      `cheque.due_date > ${nextWeekEnd} AND cheque.due_date <= ${monthEnd}`,
    ];

    // One builder per bucket, resolved in call order.
    function seedBuckets(results: Cheque[][]) {
      const builders: any[] = [];
      repo.createQueryBuilder.mockImplementation((() => {
        const rows = results[builders.length] ?? [];
        const qb: any = {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue(rows),
        };
        builders.push(qb);
        return qb;
      }) as any);
      return builders;
    }

    it('returns cheques grouped by due date schedule', async () => {
      const overdueCheque = { ...mockCheque, id: 'overdue-1' } as Cheque;
      const thisWeekCheque = { ...mockCheque, id: 'week-1' } as Cheque;
      const nextWeekCheque = { ...mockCheque, id: 'next-week-1' } as Cheque;
      const monthCheque = { ...mockCheque, id: 'month-1' } as Cheque;

      const builders = seedBuckets([
        [overdueCheque],
        [thisWeekCheque],
        [nextWeekCheque],
        [monthCheque],
      ]);

      const result = await service.getCollectionSchedule(companyId);

      expect(result.overdue).toEqual([overdueCheque]);
      expect(result.thisWeek).toEqual([thisWeekCheque]);
      expect(result.nextWeek).toEqual([nextWeekCheque]);
      expect(result.thisMonth).toEqual([monthCheque]);
      expect(repo.createQueryBuilder).toHaveBeenCalledTimes(4);
      expect(repo.createQueryBuilder).toHaveBeenCalledWith('cheque');
      expect(repo.find).not.toHaveBeenCalled();
      expect(builders).toHaveLength(4);
    });

    it('uses non-overlapping region-day buckets in the row region zone', async () => {
      const builders = seedBuckets([]);

      await service.getCollectionSchedule(companyId);

      expect(today).toContain("WHEN cheque.region_code IN ('dubai'");
      expect(today).toContain('now() AT TIME ZONE');
      const conditions = builders.map((qb) => qb.andWhere.mock.calls[1][0]);
      expect(conditions).toEqual(bucketConditions);
    });

    it('returns empty arrays when no pending cheques', async () => {
      seedBuckets([]);

      const result = await service.getCollectionSchedule(companyId);

      expect(result.overdue).toEqual([]);
      expect(result.thisWeek).toEqual([]);
      expect(result.nextWeek).toEqual([]);
      expect(result.thisMonth).toEqual([]);
    });

    it('filters by company and PENDING status only, ordered and capped', async () => {
      const builders = seedBuckets([]);

      await service.getCollectionSchedule(companyId);

      for (const qb of builders) {
        expect(qb.where).toHaveBeenCalledWith(
          'cheque.company_id = :companyId',
          {
            companyId,
          },
        );
        expect(qb.andWhere).toHaveBeenCalledWith('cheque.status = :status', {
          status: ChequeStatus.PENDING,
        });
        expect(qb.orderBy).toHaveBeenCalledWith('cheque.due_date', 'ASC');
        expect(qb.take).toHaveBeenCalledWith(100);
        expect(qb.andWhere).not.toHaveBeenCalledWith(
          'cheque.region_code IN (:...scopedCodes)',
          expect.anything(),
        );
      }
    });
  });

  describe('remove', () => {
    const lockRow = (overrides: Partial<Cheque> = {}) => {
      const row = {
        ...mockCheque,
        regionCode: 'dubai',
        ...overrides,
      } as Cheque;
      repo.findOne.mockResolvedValue(row);
      manager.findOne.mockImplementation((entity: unknown) =>
        Promise.resolve(
          entity === Cheque ? row : { id: 'unit-1', unitNumber: 'A-1204' },
        ),
      );
      return row;
    };

    it('locks the row, records DELETE, then removes it', async () => {
      const row = lockRow();

      await service.remove(
        'cheque-uuid-1',
        companyId,
        'Entered twice',
        'user-1',
      );

      expect(manager.findOne).toHaveBeenCalledWith(Cheque, {
        where: { id: 'cheque-uuid-1', companyId },
        lock: { mode: 'pessimistic_write' },
      });
      expect(recordHistory.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          companyId,
          action: RecordHistoryAction.DELETE,
          entityType: 'Cheque',
          entityTitle: 'Cheque CHQ001',
          reason: 'Entered twice',
          actorId: 'user-1',
          regionCode: 'dubai',
        }),
      );
      expect(manager.remove).toHaveBeenCalledWith(row);
      expect(recordHistory.record.mock.invocationCallOrder[0]).toBeLessThan(
        manager.remove.mock.invocationCallOrder[0],
      );
    });

    it.each([
      ChequeStatus.PENDING,
      ChequeStatus.DEPOSITED,
      ChequeStatus.BOUNCED,
      ChequeStatus.CANCELLED,
      ChequeStatus.REPLACED,
    ])('allows deleting a %s cheque', async (status: ChequeStatus) => {
      lockRow({ status });

      await service.remove('cheque-uuid-1', companyId, 'Wrong entry', 'user-1');

      expect(manager.remove).toHaveBeenCalled();
    });

    it('refuses a CLEARED cheque with 409 and writes nothing', async () => {
      lockRow({ status: ChequeStatus.CLEARED });

      await expect(
        service.remove('cheque-uuid-1', companyId, 'Wrong entry', 'user-1'),
      ).rejects.toThrow(
        new ConflictException('Cleared cheques cannot be deleted.'),
      );
      expect(recordHistory.record).not.toHaveBeenCalled();
      expect(manager.remove).not.toHaveBeenCalled();
    });

    it('uses the unit number as context when there is no drawer name', async () => {
      lockRow({ accountHolder: '', unitId: 'unit-1' });

      await service.remove('cheque-uuid-1', companyId, 'Wrong entry', 'user-1');

      expect(recordHistory.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ contextTitle: 'Unit A-1204' }),
      );
    });

    it('throws NotFoundException for a cheque from another company', async () => {
      // Locked read itself enforces companyId, so it returns null here.
      manager.findOne.mockImplementation((entity: unknown, opts: any) =>
        Promise.resolve(
          entity === Cheque && opts?.where?.companyId === 'other-company'
            ? null
            : undefined,
        ),
      );

      await expect(
        service.remove('cheque-uuid-1', 'other-company', 'x', 'user-1'),
      ).rejects.toThrow(NotFoundException);
      expect(manager.remove).not.toHaveBeenCalled();
    });
  });
  describe('region scoping', () => {
    const makkahManager = { role: 'manager', regionCodes: ['makkah'] };
    const twoRegionManager = {
      role: 'manager',
      regionCodes: ['makkah', 'punjab'],
    };
    const admin = { role: 'company_admin', regionCodes: ['makkah'] };

    // Stands in for Postgres on the by-id read: the seeded cheque resolves only
    // when the region predicate the service built admits its region_code.
    function seedCheque(regionCode: string, unitId: string | null = null) {
      const row = { ...mockCheque, regionCode, unitId } as Cheque;
      repo.findOne.mockImplementation((opts: any) => {
        const codes = opts?.where?.regionCode?.value as string[] | undefined;
        if (codes && !codes.includes(regionCode)) {
          return Promise.resolve(null);
        }
        return Promise.resolve(row);
      });
      return row;
    }

    it('denies findOne on a cheque outside the caller assigned regions', async () => {
      seedCheque('punjab', 'unit-punjab');

      await expect(
        service.findOne('cheque-uuid-1', companyId, makkahManager),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows a by-id read in any region the caller is assigned to', async () => {
      seedCheque('punjab', 'unit-punjab');

      const result = await service.findOne(
        'cheque-uuid-1',
        companyId,
        twoRegionManager,
      );

      expect(result.id).toBe('cheque-uuid-1');
    });

    it('reads a cheque with no unit from the caller own region', async () => {
      seedCheque('makkah');

      const result = await service.findOne(
        'cheque-uuid-1',
        companyId,
        makkahManager,
      );

      expect(result.unitId).toBeNull();
      expect(result.regionCode).toBe('makkah');
    });

    it('denies a cheque with no unit from another region', async () => {
      seedCheque('punjab');

      await expect(
        service.findOne('cheque-uuid-1', companyId, makkahManager),
      ).rejects.toThrow(NotFoundException);
    });

    it('reads the region off the cheque own column, not its unit', async () => {
      seedCheque('punjab', 'unit-punjab');

      await expect(
        service.findOne('cheque-uuid-1', companyId, makkahManager),
      ).rejects.toThrow(NotFoundException);

      const where = (repo.findOne.mock.calls[0]![0] as any).where;
      expect(where.regionCode.value).toEqual(['makkah']);
      expect(where.unitId).toBeUndefined();
    });

    it('denies update on a cheque outside the caller assigned regions', async () => {
      seedCheque('punjab', 'unit-punjab');
      repo.createQueryBuilder.mockReturnValue(makeUpdateBuilder(1) as any);

      await expect(
        service.update(
          'cheque-uuid-1',
          companyId,
          { status: ChequeStatus.DEPOSITED },
          'user-uuid-1',
          makkahManager,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('denies bounce on a cheque outside the caller assigned regions', async () => {
      seedCheque('punjab', 'unit-punjab');
      repo.createQueryBuilder.mockReturnValue(makeUpdateBuilder(1) as any);

      await expect(
        service.bounce(
          'cheque-uuid-1',
          companyId,
          { bounceReason: 'Insufficient funds' },
          'user-uuid-1',
          makkahManager,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('denies processOcr on a cheque outside the caller assigned regions', async () => {
      seedCheque('punjab', 'unit-punjab');

      await expect(
        service.processOcr(
          'cheque-uuid-1',
          companyId,
          'https://example.com/cheque.jpg',
          makkahManager,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('denies remove on a cheque outside the caller assigned regions', async () => {
      const row = seedCheque('punjab', 'unit-punjab');
      // remove() locks via manager.findOne, so the region filter is asserted there.
      manager.findOne.mockImplementation((entity: unknown, opts: any) => {
        if (entity !== Cheque) {
          return Promise.resolve({ id: opts?.where?.id, deletedAt: null });
        }
        const codes = opts?.where?.regionCode?.value as string[] | undefined;
        if (codes && !codes.includes('punjab')) {
          return Promise.resolve(null);
        }
        return Promise.resolve(row);
      });

      await expect(
        service.remove(
          'cheque-uuid-1',
          companyId,
          'Wrong entry',
          'user-uuid-1',
          makkahManager,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(manager.remove).not.toHaveBeenCalled();
    });

    it('denies every by-id read when the caller has no assigned region', async () => {
      seedCheque('makkah', 'unit-makkah');

      await expect(
        service.findOne('cheque-uuid-1', companyId, {
          role: 'manager',
          regionCodes: [],
        }),
      ).rejects.toThrow(NotFoundException);
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('leaves admins unconfined by their own assignments', async () => {
      seedCheque('punjab', 'unit-punjab');

      const result = await service.findOne('cheque-uuid-1', companyId, admin);

      expect(result.id).toBe('cheque-uuid-1');
    });

    it('stays unscoped when no caller is supplied', async () => {
      seedCheque('punjab', 'unit-punjab');

      const result = await service.findOne('cheque-uuid-1', companyId);

      expect(result.id).toBe('cheque-uuid-1');
    });

    // Stands in for Postgres on the unit lookup: the unit resolves only when
    // the region predicate the service built admits its region.
    function seedUnitLookup() {
      unitRepo.findOne.mockImplementation((opts: any) => {
        const id = opts?.where?.id as string;
        const codes = opts?.where?.asset?.locality?.city?.regionCode?.value as
          | string[]
          | undefined;
        const region = unitRegions[id];
        if (!region || (codes && !codes.includes(region))) {
          return Promise.resolve(null);
        }
        return Promise.resolve({ id } as Unit);
      });
    }

    // Stands in for Postgres on the list reads: the seeded cheques survive only
    // when the region predicate the service built admits their region_code.
    function seedCheques(
      seeds: Array<{ id: string; regionCode: string; unitId: string | null }>,
    ) {
      const rows = seeds.map((seed) => ({ ...mockCheque, ...seed }) as Cheque);
      const matching = (where: any) => {
        const codes = where?.regionCode?.value as string[] | undefined;
        return codes
          ? rows.filter((row) => codes.includes(row.regionCode))
          : rows;
      };
      repo.findAndCount.mockImplementation((opts: any) => {
        const matched = matching(opts?.where);
        return Promise.resolve([matched, matched.length]);
      });
      repo.find.mockImplementation((opts: any) =>
        Promise.resolve(matching(opts?.where)),
      );
      return rows;
    }

    // Stands in for Postgres on the schedule reads: every bucket admits the
    // seeded cheques whose region_code the scoped IN clause allows.
    function seedScheduleCheques(
      seeds: Array<{ id: string; regionCode: string; unitId: string | null }>,
    ) {
      const rows = seeds.map((seed) => ({ ...mockCheque, ...seed }) as Cheque);
      const builders: any[] = [];
      repo.createQueryBuilder.mockImplementation((() => {
        let codes: string[] | undefined;
        const qb: any = {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn((_sql: string, params?: any) => {
            if (params?.scopedCodes) codes = params.scopedCodes;
            return qb;
          }),
          orderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest.fn(() =>
            Promise.resolve(
              codes
                ? rows.filter((row) => codes!.includes(row.regionCode))
                : rows,
            ),
          ),
        };
        builders.push(qb);
        return qb;
      }) as any);
      return builders;
    }

    // A cheque with no unit is the case the column exists for: under the unit
    // chain filter it matched no region at all.
    const listSeeds = [
      { id: 'cheque-makkah', regionCode: 'makkah', unitId: 'unit-makkah' },
      { id: 'cheque-makkah-no-unit', regionCode: 'makkah', unitId: null },
      { id: 'cheque-punjab', regionCode: 'punjab', unitId: 'unit-punjab' },
    ];

    it('confines the list to the caller assigned regions with no region requested', async () => {
      seedCheques(listSeeds);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        makkahManager,
      );

      expect(result.data.map((c) => c.id)).toEqual([
        'cheque-makkah',
        'cheque-makkah-no-unit',
      ]);
      expect(result.total).toBe(2);
    });

    it('lists a cheque with no unit to a caller in that region', async () => {
      seedCheques(listSeeds);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        makkahManager,
      );

      const unitless = result.data.find((c) => c.unitId === null);
      expect(unitless?.id).toBe('cheque-makkah-no-unit');
    });

    it('hides a cheque with no unit from a caller in another region', async () => {
      seedCheques([
        { id: 'cheque-punjab-no-unit', regionCode: 'punjab', unitId: null },
      ]);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        makkahManager,
      );

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('filters the list on the cheque own region column', async () => {
      seedCheques(listSeeds);

      await service.findAll(companyId, 1, 20, undefined, makkahManager);

      const where = (repo.findAndCount.mock.calls[0]![0] as any).where;
      expect(where.regionCode.value).toEqual(['makkah']);
      expect(where.unitId).toBeUndefined();
    });

    it('lists no cheques from a region outside the caller assignments', async () => {
      seedCheques(listSeeds);

      const result = await service.findAll(
        companyId,
        1,
        20,
        'punjab',
        makkahManager,
      );

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('leaves the list unfiltered for admins', async () => {
      seedCheques(listSeeds);

      const result = await service.findAll(companyId, 1, 20, undefined, admin);

      expect(result.data.map((c) => c.id)).toEqual([
        'cheque-makkah',
        'cheque-makkah-no-unit',
        'cheque-punjab',
      ]);
    });

    it('lists nothing when the caller has no assigned region', async () => {
      seedCheques(listSeeds);

      const result = await service.findAll(companyId, 1, 20, undefined, {
        role: 'manager',
        regionCodes: [],
      });

      expect(result.data).toEqual([]);
      expect(repo.findAndCount).not.toHaveBeenCalled();
    });

    it('confines the collection schedule to the caller assigned regions', async () => {
      const builders = seedScheduleCheques(listSeeds);

      const result = await service.getCollectionSchedule(
        companyId,
        makkahManager,
      );

      expect(result.overdue.map((c) => c.id)).toEqual([
        'cheque-makkah',
        'cheque-makkah-no-unit',
      ]);
      expect(result.thisWeek.map((c) => c.id)).toEqual([
        'cheque-makkah',
        'cheque-makkah-no-unit',
      ]);
      expect(builders).toHaveLength(4);
      for (const qb of builders) {
        expect(qb.andWhere).toHaveBeenCalledWith(
          'cheque.region_code IN (:...scopedCodes)',
          { scopedCodes: ['makkah'] },
        );
      }
    });

    it('leaves the collection schedule unfiltered for admins', async () => {
      const builders = seedScheduleCheques(listSeeds);

      const result = await service.getCollectionSchedule(companyId, admin);

      expect(result.overdue.map((c) => c.id)).toEqual([
        'cheque-makkah',
        'cheque-makkah-no-unit',
        'cheque-punjab',
      ]);
      for (const qb of builders) {
        expect(qb.andWhere).not.toHaveBeenCalledWith(
          'cheque.region_code IN (:...scopedCodes)',
          expect.anything(),
        );
      }
    });

    it('returns an empty collection schedule when the caller has no assigned region', async () => {
      seedScheduleCheques(listSeeds);

      const result = await service.getCollectionSchedule(companyId, {
        role: 'manager',
        regionCodes: [],
      });

      expect(result).toEqual({
        overdue: [],
        thisWeek: [],
        nextWeek: [],
        thisMonth: [],
      });
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    describe('unit binding', () => {
      // Writes the row the service built, so the stamped region is observable.
      function seedPassthroughWrites() {
        (repo.create as jest.Mock).mockImplementation(
          (input: Partial<Cheque>) => input as Cheque,
        );
        (repo.save as jest.Mock).mockImplementation((row: Cheque) =>
          Promise.resolve(row),
        );
      }

      it('denies an admin binding a unit from another company', async () => {
        seedPassthroughWrites();
        unitRepo.findOne.mockImplementation((opts: any) =>
          Promise.resolve(
            opts?.where?.companyId === companyId
              ? ({ id: opts.where.id } as Unit)
              : null,
          ),
        );

        await expect(
          service.create(
            'another-company-uuid',
            { chequeNumber: 'CHQ003', unitId: 'unit-makkah' } as any,
            'user-uuid-1',
            admin,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('denies create when the unit is outside the caller regions', async () => {
        seedUnitLookup();

        await expect(
          service.create(
            companyId,
            { chequeNumber: 'CHQ002', unitId: 'unit-punjab' } as any,
            'user-uuid-1',
            makkahManager,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('creates a cheque on a unit inside the caller regions', async () => {
        seedUnitLookup();
        seedPassthroughWrites();

        const result = await service.create(
          companyId,
          { chequeNumber: 'CHQ002', unitId: 'unit-punjab' } as any,
          'user-uuid-1',
          twoRegionManager,
        );

        expect(result.unitId).toBe('unit-punjab');
        expect(result.regionCode).toBe('punjab');
      });

      it('stamps a cheque with no unit with the region the caller supplied', async () => {
        seedPassthroughWrites();

        const result = await service.create(
          companyId,
          { chequeNumber: 'CHQ003', regionCode: 'makkah' } as any,
          'user-uuid-1',
          makkahManager,
        );

        expect(result.regionCode).toBe('makkah');
        expect(companyRepo.findOne).not.toHaveBeenCalled();
      });

      it('rejects a supplied region the caller is not assigned to', async () => {
        seedPassthroughWrites();

        await expect(
          service.create(
            companyId,
            { chequeNumber: 'CHQ004', regionCode: 'punjab' } as any,
            'user-uuid-1',
            makkahManager,
          ),
        ).rejects.toThrow(BadRequestException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('falls back to the company default with no unit and no region', async () => {
        seedPassthroughWrites();

        const result = await service.create(
          companyId,
          { chequeNumber: 'CHQ005' } as any,
          'user-uuid-1',
          admin,
        );

        expect(result.regionCode).toBe('dubai');
      });

      it('denies moving a cheque onto a unit outside the caller regions', async () => {
        seedCheque('makkah', 'unit-makkah');
        seedUnitLookup();

        await expect(
          service.update(
            'cheque-uuid-1',
            companyId,
            { unitId: 'unit-punjab' },
            'user-uuid-1',
            makkahManager,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(repo.createQueryBuilder).not.toHaveBeenCalled();
      });

      it('moves a cheque onto a unit inside the caller regions', async () => {
        seedCheque('makkah', 'unit-makkah');
        seedUnitLookup();

        const result = await service.update(
          'cheque-uuid-1',
          companyId,
          { unitId: 'unit-punjab' },
          'user-uuid-1',
          twoRegionManager,
        );

        expect(result.unitId).toBe('unit-punjab');
      });

      it('moves the region with the unit', async () => {
        seedCheque('makkah', 'unit-makkah');
        seedUnitLookup();

        await service.update(
          'cheque-uuid-1',
          companyId,
          { unitId: 'unit-punjab' },
          'user-uuid-1',
          twoRegionManager,
        );

        expect(updateBuilder.set).toHaveBeenCalledWith(
          expect.objectContaining({ regionCode: 'punjab' }),
        );
      });
    });
  });

  describe('clear', () => {
    const region = 'dubai';
    const today = regionToday(region);

    // amount is @Column({ type: 'decimal' }) with no transformer, so the driver hands
    // back a STRING even though the entity declares number. The fixture uses the real
    // runtime shape; asserting 15000 would assert a value Postgres never returns.
    const PG_AMOUNT = '15000.00' as unknown as number;

    const clearable = (overrides: Partial<Cheque> = {}): Cheque =>
      ({
        ...mockCheque,
        amount: PG_AMOUNT,
        // The added date is the floor for a deposit date typed at clearing time.
        createdAt: new Date('2026-08-01T06:00:00Z'),
        status: ChequeStatus.DEPOSITED,
        depositDate: null,
        clearedDate: null,
        unitId: null,
        regionCode: region,
        ...overrides,
      }) as Cheque;

    // The locked re-read inside the db transaction returns this row.
    const lockReturns = (cheque: Cheque) => {
      manager.findOne = jest.fn((entity: unknown, opts: any) => {
        if (entity === Lease) {
          return Promise.resolve({
            id: opts?.where?.id,
            unitId: null,
            deletedAt: null,
          });
        }
        if (entity === Cheque) {
          return Promise.resolve(cheque);
        }
        return Promise.resolve({ id: opts?.where?.id, deletedAt: null });
      });
    };

    it('writes one completed income transaction dated the day it cleared', async () => {
      const cheque = clearable();
      repo.findOne.mockResolvedValue(cheque);
      lockReturns(cheque);

      await service.clear('cheque-uuid-1', companyId, { clearedDate: today });

      expect(txRepo.insert).toHaveBeenCalledTimes(1);
      expect(txRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId,
          chequeId: 'cheque-uuid-1',
          type: TransactionType.INCOME,
          category: TransactionCategory.RENT,
          status: TransactionStatus.COMPLETED,
          amount: PG_AMOUNT,
          paymentMethod: PaymentMethod.CHEQUE,
          transactionDate: today,
          dueDate: cheque.dueDate,
          regionCode: region,
        }),
      );
      expect(cheque.status).toBe(ChequeStatus.CLEARED);
      expect(cheque.clearedDate).toBe(today);
      expect(repo.save).toHaveBeenCalledWith(cheque);
    });

    it('maps a security deposit cheque to the deposit category', async () => {
      const cheque = clearable({ type: ChequeType.SECURITY_DEPOSIT });
      repo.findOne.mockResolvedValue(cheque);
      lockReturns(cheque);

      await service.clear('cheque-uuid-1', companyId, { clearedDate: today });

      expect(txRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ category: TransactionCategory.DEPOSIT }),
      );
    });

    it('records the status change in history', async () => {
      const cheque = clearable();
      repo.findOne.mockResolvedValue(cheque);
      lockReturns(cheque);

      await service.clear(
        'cheque-uuid-1',
        companyId,
        { clearedDate: today },
        'user-1',
      );

      expect(recordHistory.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: RecordHistoryAction.STATUS_CHANGE,
          entityType: 'Cheque',
          entityId: 'cheque-uuid-1',
          actorId: 'user-1',
          metadata: expect.objectContaining({
            to: ChequeStatus.CLEARED,
            clearedDate: today,
          }),
        }),
      );
    });

    it('refuses a cleared date more than 30 days back', async () => {
      const cheque = clearable();
      repo.findOne.mockResolvedValue(cheque);
      lockReturns(cheque);

      await expect(
        service.clear('cheque-uuid-1', companyId, {
          clearedDate: addDays(today, -31),
        }),
      ).rejects.toThrow(BadRequestException);
      expect(txRepo.insert).not.toHaveBeenCalled();
    });

    it('refuses a cleared date in the future', async () => {
      const cheque = clearable();
      repo.findOne.mockResolvedValue(cheque);
      lockReturns(cheque);

      await expect(
        service.clear('cheque-uuid-1', companyId, {
          clearedDate: addDays(today, 1),
        }),
      ).rejects.toThrow(BadRequestException);
      expect(txRepo.insert).not.toHaveBeenCalled();
    });

    it('refuses to clear before the due date', async () => {
      const cheque = clearable({ dueDate: addDays(today, 5) });
      repo.findOne.mockResolvedValue(cheque);
      lockReturns(cheque);

      await expect(
        service.clear('cheque-uuid-1', companyId, { clearedDate: today }),
      ).rejects.toThrow(/cannot clear before its due date/);
      expect(txRepo.insert).not.toHaveBeenCalled();
    });

    it('refuses to clear before it was deposited', async () => {
      const cheque = clearable({ depositDate: today });
      repo.findOne.mockResolvedValue(cheque);
      lockReturns(cheque);

      await expect(
        service.clear('cheque-uuid-1', companyId, {
          clearedDate: addDays(today, -1),
        }),
      ).rejects.toThrow(/cannot clear before it was deposited/);
      expect(txRepo.insert).not.toHaveBeenCalled();
    });

    it('refuses a cheque that is already cleared', async () => {
      const cheque = clearable({
        status: ChequeStatus.CLEARED,
        clearedDate: today,
      });
      repo.findOne.mockResolvedValue(cheque);
      lockReturns(cheque);

      await expect(
        service.clear('cheque-uuid-1', companyId, { clearedDate: today }),
      ).rejects.toThrow(ConflictException);
      expect(txRepo.insert).not.toHaveBeenCalled();
    });

    it('refuses a bounced cheque, so a bounce never becomes income', async () => {
      const cheque = clearable({ status: ChequeStatus.BOUNCED });
      repo.findOne.mockResolvedValue(cheque);
      lockReturns(cheque);

      await expect(
        service.clear('cheque-uuid-1', companyId, { clearedDate: today }),
      ).rejects.toThrow(BadRequestException);
      expect(txRepo.insert).not.toHaveBeenCalled();
    });

    it('refuses a cancelled cheque', async () => {
      const cheque = clearable({ status: ChequeStatus.CANCELLED });
      repo.findOne.mockResolvedValue(cheque);
      lockReturns(cheque);

      await expect(
        service.clear('cheque-uuid-1', companyId, { clearedDate: today }),
      ).rejects.toThrow(BadRequestException);
      expect(txRepo.insert).not.toHaveBeenCalled();
    });

    it('re-checks the locked row, so a concurrent clear cannot write twice', async () => {
      const seen = clearable();
      const lockedAlreadyCleared = clearable({
        status: ChequeStatus.CLEARED,
        clearedDate: today,
      });
      repo.findOne.mockResolvedValue(seen);
      lockReturns(lockedAlreadyCleared);

      await expect(
        service.clear('cheque-uuid-1', companyId, { clearedDate: today }),
      ).rejects.toThrow(ConflictException);
      expect(txRepo.insert).not.toHaveBeenCalled();
    });

    describe('deposit date supplied while clearing', () => {
      const pending = (overrides: Partial<Cheque> = {}) =>
        clearable({
          status: ChequeStatus.PENDING,
          depositDate: null,
          ...overrides,
        });

      it('writes a deposit date typed on a cheque that had none', async () => {
        const cheque = pending();
        repo.findOne.mockResolvedValue(cheque);
        lockReturns(cheque);

        await service.clear('cheque-uuid-1', companyId, {
          clearedDate: today,
          depositDate: '2026-08-05',
        });

        expect(cheque.depositDate).toBe('2026-08-05');
        expect(cheque.status).toBe(ChequeStatus.CLEARED);
      });

      it('leaves the deposit date null when none is supplied', async () => {
        const cheque = pending();
        repo.findOne.mockResolvedValue(cheque);
        lockReturns(cheque);

        await service.clear('cheque-uuid-1', companyId, {
          clearedDate: today,
        });

        expect(cheque.depositDate).toBeNull();
        expect(cheque.status).toBe(ChequeStatus.CLEARED);
      });

      it('refuses a deposit date before the day the cheque was added', async () => {
        const cheque = pending();
        repo.findOne.mockResolvedValue(cheque);
        lockReturns(cheque);

        await expect(
          service.clear('cheque-uuid-1', companyId, {
            clearedDate: today,
            depositDate: '2026-07-31',
          }),
        ).rejects.toThrow(/cannot be deposited before it was added/);
        expect(txRepo.insert).not.toHaveBeenCalled();
      });

      it('refuses a deposit date after the cleared date', async () => {
        const cheque = pending();
        repo.findOne.mockResolvedValue(cheque);
        lockReturns(cheque);

        await expect(
          service.clear('cheque-uuid-1', companyId, {
            clearedDate: addDays(today, -2),
            depositDate: addDays(today, -1),
          }),
        ).rejects.toThrow(/cannot be deposited after it cleared/);
        expect(txRepo.insert).not.toHaveBeenCalled();
      });

      it('refuses to move the deposit date of an already deposited cheque', async () => {
        const cheque = clearable({ depositDate: '2026-08-10' });
        repo.findOne.mockResolvedValue(cheque);
        lockReturns(cheque);

        await expect(
          service.clear('cheque-uuid-1', companyId, {
            clearedDate: today,
            depositDate: '2026-08-05',
          }),
        ).rejects.toThrow(/already has a deposit date/);
        expect(txRepo.insert).not.toHaveBeenCalled();
      });

      it('accepts the deposit date it already holds, echoed back', async () => {
        const cheque = clearable({ depositDate: '2026-08-10' });
        repo.findOne.mockResolvedValue(cheque);
        lockReturns(cheque);

        await service.clear('cheque-uuid-1', companyId, {
          clearedDate: today,
          depositDate: '2026-08-10',
        });

        expect(cheque.depositDate).toBe('2026-08-10');
        expect(txRepo.insert).toHaveBeenCalledTimes(1);
      });
    });

    describe('unclear', () => {
      it('cancels the transaction and returns a deposited cheque to DEPOSITED', async () => {
        const cheque = clearable({
          status: ChequeStatus.CLEARED,
          clearedDate: today,
          depositDate: today,
        });
        repo.findOne.mockResolvedValue(cheque);
        lockReturns(cheque);

        await service.unclear('cheque-uuid-1', companyId, {
          reason: 'Bank reversed the credit',
        });

        expect(txRepo.update).toHaveBeenCalledWith(
          {
            chequeId: 'cheque-uuid-1',
            companyId,
            status: expect.anything(),
          },
          { status: TransactionStatus.CANCELLED },
        );
        expect(cheque.status).toBe(ChequeStatus.DEPOSITED);
        expect(cheque.clearedDate).toBeNull();
      });

      it('returns a never-deposited cheque to PENDING', async () => {
        const cheque = clearable({
          status: ChequeStatus.CLEARED,
          clearedDate: today,
          depositDate: null,
        });
        repo.findOne.mockResolvedValue(cheque);
        lockReturns(cheque);

        await service.unclear('cheque-uuid-1', companyId, { reason: 'Typo' });

        expect(cheque.status).toBe(ChequeStatus.PENDING);
      });

      it('records the reason in history', async () => {
        const cheque = clearable({
          status: ChequeStatus.CLEARED,
          clearedDate: today,
        });
        repo.findOne.mockResolvedValue(cheque);
        lockReturns(cheque);

        await service.unclear(
          'cheque-uuid-1',
          companyId,
          { reason: 'Bank reversed the credit' },
          'user-1',
        );

        expect(recordHistory.record).toHaveBeenCalledWith(
          manager,
          expect.objectContaining({
            action: RecordHistoryAction.STATUS_CHANGE,
            reason: 'Bank reversed the credit',
            actorId: 'user-1',
            metadata: expect.objectContaining({ from: ChequeStatus.CLEARED }),
          }),
        );
      });

      it('records that nothing was cancelled when no transaction was linked', async () => {
        const cheque = clearable({
          status: ChequeStatus.CLEARED,
          clearedDate: today,
        });
        repo.findOne.mockResolvedValue(cheque);
        lockReturns(cheque);
        txRepo.update.mockResolvedValue({ affected: 0 });
        (module.get(UsersService).findAdmins as jest.Mock).mockResolvedValue([
          { id: 'admin-9', name: 'Admin Nine', email: 'admin9@test.com' },
        ]);
        const notificationsService = module.get(NotificationsService) as any;

        await service.unclear('cheque-uuid-1', companyId, { reason: 'Legacy' });

        expect(recordHistory.record).toHaveBeenCalledWith(
          manager,
          expect.objectContaining({
            metadata: expect.objectContaining({ cancelledTransactions: 0 }),
          }),
        );
        expect(notificationsService.create).toHaveBeenCalledWith(
          companyId,
          expect.objectContaining({
            message: expect.stringContaining('no recorded payment to cancel'),
          }),
        );
      });

      it('says the payment was cancelled when a row was actually reversed', async () => {
        const cheque = clearable({
          status: ChequeStatus.CLEARED,
          clearedDate: today,
        });
        repo.findOne.mockResolvedValue(cheque);
        lockReturns(cheque);
        (module.get(UsersService).findAdmins as jest.Mock).mockResolvedValue([
          { id: 'admin-9', name: 'Admin Nine', email: 'admin9@test.com' },
        ]);
        const notificationsService = module.get(NotificationsService) as any;

        await service.unclear('cheque-uuid-1', companyId, { reason: 'Error' });

        expect(notificationsService.create).toHaveBeenCalledWith(
          companyId,
          expect.objectContaining({
            message: expect.stringContaining('its payment was cancelled'),
          }),
        );
      });

      it('refuses a cheque that was never cleared', async () => {
        const cheque = clearable();
        repo.findOne.mockResolvedValue(cheque);
        lockReturns(cheque);

        await expect(
          service.unclear('cheque-uuid-1', companyId, { reason: 'Mistake' }),
        ).rejects.toThrow(BadRequestException);
        expect(txRepo.update).not.toHaveBeenCalled();
      });
    });

    describe('update guards around a cleared cheque', () => {
      it('refuses to set CLEARED through the generic update', async () => {
        const cheque = clearable({ status: ChequeStatus.PENDING });
        repo.findOne.mockResolvedValue(cheque);

        await expect(
          service.update('cheque-uuid-1', companyId, {
            status: ChequeStatus.CLEARED,
          }),
        ).rejects.toThrow(/clear endpoint/);
      });

      it('refuses an amount change on a cleared cheque', async () => {
        const cheque = clearable({
          status: ChequeStatus.CLEARED,
          clearedDate: today,
        });
        repo.findOne.mockResolvedValue(cheque);

        await expect(
          service.update('cheque-uuid-1', companyId, { amount: 999 }),
        ).rejects.toThrow(ConflictException);
      });

      it('refuses a unit change on a cleared cheque, which would move its money row', async () => {
        const cheque = clearable({
          status: ChequeStatus.CLEARED,
          clearedDate: today,
          unitId: 'unit-makkah',
        });
        repo.findOne.mockResolvedValue(cheque);
        // The region precheck runs first, so the target unit has to be real.
        unitRepo.findOne.mockResolvedValue({
          id: 'unit-punjab',
          deletedAt: null,
        } as Unit);

        await expect(
          service.update('cheque-uuid-1', companyId, { unitId: 'unit-punjab' }),
        ).rejects.toThrow(ConflictException);
      });

      it('refuses a cheque number change on a cleared cheque', async () => {
        const cheque = clearable({
          status: ChequeStatus.CLEARED,
          clearedDate: today,
        });
        repo.findOne.mockResolvedValue(cheque);

        await expect(
          service.update('cheque-uuid-1', companyId, {
            chequeNumber: 'CHQ999',
          }),
        ).rejects.toThrow(ConflictException);
      });

      it('refuses a deposit date change on a cleared cheque', async () => {
        const cheque = clearable({
          status: ChequeStatus.CLEARED,
          clearedDate: today,
          depositDate: '2026-08-10',
        });
        repo.findOne.mockResolvedValue(cheque);

        await expect(
          service.update('cheque-uuid-1', companyId, {
            depositDate: '2026-08-12',
          }),
        ).rejects.toThrow(ConflictException);
      });

      it('refuses a due date change on a cleared cheque', async () => {
        const cheque = clearable({
          status: ChequeStatus.CLEARED,
          clearedDate: today,
        });
        repo.findOne.mockResolvedValue(cheque);

        await expect(
          service.update('cheque-uuid-1', companyId, { dueDate: '2026-01-15' }),
        ).rejects.toThrow(ConflictException);
      });

      it('still allows a harmless field such as notes on a cleared cheque', async () => {
        const cheque = clearable({
          status: ChequeStatus.CLEARED,
          clearedDate: today,
        });
        repo.findOne.mockResolvedValue(cheque);

        await expect(
          service.update('cheque-uuid-1', companyId, { notes: 'Filed' }),
        ).resolves.toBeDefined();
      });

      it('refuses a type change on a cleared cheque', async () => {
        const cheque = clearable({
          status: ChequeStatus.CLEARED,
          clearedDate: today,
        });
        repo.findOne.mockResolvedValue(cheque);

        await expect(
          service.update('cheque-uuid-1', companyId, {
            type: ChequeType.MAINTENANCE,
          }),
        ).rejects.toThrow(ConflictException);
      });
    });
  });
});
