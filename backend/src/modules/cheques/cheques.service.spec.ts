import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { UsersService } from '../users/users.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { ChequesService } from './cheques.service';
import { Cheque, ChequeStatus, ChequeType } from './entities/cheque.entity';

describe('ChequesService', () => {
  let service: ChequesService;
  let repo: jest.Mocked<Repository<Cheque>>;
  let module: TestingModule;
  let updateBuilder: {
    update: jest.Mock;
    set: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    execute: jest.Mock;
  };

  const companyId = 'company-uuid-1';

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

  const mockCheque: Partial<Cheque> = {
    id: 'cheque-uuid-1',
    companyId,
    leaseId: 'lease-uuid-1',
    chequeNumber: 'CHQ001',
    bankName: 'Emirates NBD',
    accountHolder: 'Ahmed Al-Rashid',
    amount: 15000,
    currency: 'AED',
    dueDate: new Date('2026-03-01'),
    status: ChequeStatus.PENDING,
    type: ChequeType.RENT,
    ocrProcessed: false,
    ocrData: null,
    version: 1,
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        ChequesService,
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

      expect(repo.create).toHaveBeenCalledWith({ ...dto, companyId });
      expect(result).toEqual(mockCheque);
    });
  });

  describe('findAll', () => {
    it('returns paginated cheques sorted by due date', async () => {
      repo.findAndCount.mockResolvedValue([[mockCheque as Cheque], 1]);

      const result = await service.findAll(companyId, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { companyId },
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
        depositDate: new Date(),
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
        depositDate: new Date(),
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

    it('creates PAYMENT_RECEIVED notification when status changes to CLEARED', async () => {
      const adminUser = {
        id: 'admin-2',
        name: 'Admin Two',
        email: 'admin2@test.com',
      };
      const updated = { ...mockCheque, status: ChequeStatus.CLEARED } as Cheque;
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
        { status: ChequeStatus.CLEARED },
        'user-1',
      );

      expect(notificationsService.create).toHaveBeenCalledWith(
        companyId,
        expect.objectContaining({
          title: 'Cheque Cleared',
          message: expect.stringContaining('has been CLEARED'),
          type: NotificationType.PAYMENT_RECEIVED,
        }),
      );
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
        { status: ChequeStatus.CANCELLED },
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

    it('sets depositDate to now when status is DEPOSITED and depositDate is null', async () => {
      const chequeNoDepositDate = {
        ...mockCheque,
        depositDate: null,
      } as Cheque;
      const persisted = {
        ...mockCheque,
        status: ChequeStatus.DEPOSITED,
        depositDate: new Date(),
      } as Cheque;
      repo.findOne
        .mockResolvedValueOnce(chequeNoDepositDate)
        .mockResolvedValueOnce(persisted);

      const result = await service.update('cheque-uuid-1', companyId, {
        status: ChequeStatus.DEPOSITED,
      });

      // depositDate is stamped in the conditional UPDATE's SET clause.
      const setArg = updateBuilder.set.mock.calls[0][0];
      expect(setArg.depositDate).toBeInstanceOf(Date);
      expect(setArg.status).toBe(ChequeStatus.DEPOSITED);
      // Returned entity is the fresh re-read.
      expect(result.depositDate).toBeInstanceOf(Date);
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
        depositDate: new Date(),
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

      await expect(
        service.bounce('cheque-uuid-1', companyId, {}),
      ).rejects.toThrow(NotFoundException);
      // No re-read after a no-op UPDATE.
      expect(repo.findOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCollectionSchedule', () => {
    it('returns cheques grouped by due date schedule', async () => {
      const overdueCheque = { ...mockCheque, id: 'overdue-1' } as Cheque;
      const thisWeekCheque = { ...mockCheque, id: 'week-1' } as Cheque;
      const nextWeekCheque = { ...mockCheque, id: 'next-week-1' } as Cheque;
      const monthCheque = { ...mockCheque, id: 'month-1' } as Cheque;

      repo.find
        .mockResolvedValueOnce([overdueCheque])
        .mockResolvedValueOnce([thisWeekCheque])
        .mockResolvedValueOnce([nextWeekCheque])
        .mockResolvedValueOnce([monthCheque]);

      const result = await service.getCollectionSchedule(companyId);

      expect(result.overdue).toEqual([overdueCheque]);
      expect(result.thisWeek).toEqual([thisWeekCheque]);
      expect(result.nextWeek).toEqual([nextWeekCheque]);
      expect(result.thisMonth).toEqual([monthCheque]);
      expect(repo.find).toHaveBeenCalledTimes(4);
    });

    it('returns empty arrays when no pending cheques', async () => {
      repo.find.mockResolvedValue([]);

      const result = await service.getCollectionSchedule(companyId);

      expect(result.overdue).toEqual([]);
      expect(result.thisWeek).toEqual([]);
      expect(result.nextWeek).toEqual([]);
      expect(result.thisMonth).toEqual([]);
    });

    it('filters by PENDING status only', async () => {
      repo.find.mockResolvedValue([]);

      await service.getCollectionSchedule(companyId);

      for (const call of repo.find.mock.calls) {
        const where = (call[0] as any).where;
        expect(where.companyId).toBe(companyId);
        expect(where.status).toBe(ChequeStatus.PENDING);
      }
    });
  });

  describe('remove', () => {
    it('removes cheque', async () => {
      repo.findOne.mockResolvedValue(mockCheque as Cheque);
      repo.remove.mockResolvedValue(mockCheque as Cheque);

      await service.remove('cheque-uuid-1', companyId);

      expect(repo.remove).toHaveBeenCalledWith(mockCheque);
    });
  });
});
