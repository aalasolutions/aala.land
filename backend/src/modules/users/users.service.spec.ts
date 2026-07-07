import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository, Not } from 'typeorm';
import { NotFoundException, ConflictException, ForbiddenException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';
import { User, AuthProvider } from './entities/user.entity';
import { Role } from '@shared/enums/roles.enum';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { MailService } from '../../shared/services/mail.service';
import { EmailTemplatesService } from '../email-templates/email-templates.service';
import { Company, SubscriptionTier } from '../companies/entities/company.entity';
import { BillingService } from '../billing/billing.service';
import { UserReassignmentService } from './reassignment/user-reassignment.service';
import { OWNERSHIP_TRANSFER_RECORDER } from './reassignment/ownership-transfer-recorder';

jest.mock('bcryptjs');
jest.mock('crypto');

let managerMock: { update: jest.Mock; delete: jest.Mock; query: jest.Mock };
let commissionRepoMock: { count: jest.Mock };
let dataSourceMock: { transaction: jest.Mock; getRepository: jest.Mock };
let billingServiceMock: { reserveSeat: jest.Mock; setSeatQuantity: jest.Mock };
let reassignmentServiceMock: { reassignOwnedRecords: jest.Mock };

const emptyReport = {
  fromUserId: 'user-uuid-2',
  toUserId: 'user-uuid-3',
  reason: 'left',
  entities: [],
};

describe('UsersService', () => {
  let service: UsersService;
  let repo: jest.Mocked<Repository<User>>;
  let companyRepo: jest.Mocked<Pick<Repository<Company>, 'findOne' | 'update'>>;
  let mailService: jest.Mocked<Pick<MailService, 'sendMail'>>;
  let emailTemplatesService: jest.Mocked<Pick<EmailTemplatesService, 'findAll' | 'render'>>;
  let billingService: jest.Mocked<Pick<BillingService, 'reserveSeat' | 'setSeatQuantity'>>;

  const companyId = 'company-uuid-1';

  const mockUser: User = {
    id: 'user-uuid-1',
    name: 'Test Agent',
    email: 'agent@test.com',
    password: 'hashed-password',
    googleId: null,
    authProvider: AuthProvider.LOCAL,
    role: Role.AGENT,
    companyId,
    phone: null,
    preferredLanguage: 'en',
    dateFormat: 'DD/MM/YYYY',
    timezone: 'Asia/Dubai',
    lastLoginAt: null,
    isActive: true,
    mustChangePassword: false,
    resetPasswordToken: null,
    resetPasswordExpires: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    company: null as any,
  };

  const targetUser = { ...mockUser, id: 'user-uuid-2', role: Role.AGENT, isActive: true };
  const reassignee = { ...mockUser, id: 'user-uuid-3', role: Role.AGENT, isActive: true };
  const removeDto = { reassignToUserId: 'user-uuid-3', reason: 'left' };

  const freeCompany = {
    id: companyId, subscriptionTier: SubscriptionTier.FREE, maxUsers: 1,
    purchasedSeats: 1, billingSubscriptionId: null,
  } as unknown as Company;
  const proCompany = {
    id: companyId, subscriptionTier: SubscriptionTier.PRO, maxUsers: 999,
    purchasedSeats: 5, billingSubscriptionId: 'sub_123', billingCustomerId: 'cus_123',
  } as unknown as Company;
  const proCompanyNoSub = { ...proCompany, billingSubscriptionId: null } as unknown as Company;

  function primeRemovalLookups(company: Company, target = targetUser, recipient = reassignee) {
    repo.findOne
      .mockResolvedValueOnce(target as User)      // target lookup
      .mockResolvedValueOnce(recipient as User);  // reassignee lookup
    companyRepo.findOne.mockResolvedValue(company as Company);
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    managerMock = { update: jest.fn(), delete: jest.fn(), query: jest.fn() };
    commissionRepoMock = { count: jest.fn().mockResolvedValue(0) };
    dataSourceMock = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => cb(managerMock)),
      getRepository: jest.fn().mockReturnValue(commissionRepoMock),
    };
    billingServiceMock = { reserveSeat: jest.fn().mockResolvedValue(null), setSeatQuantity: jest.fn().mockResolvedValue({}) };
    reassignmentServiceMock = { reassignOwnedRecords: jest.fn().mockResolvedValue(emptyReport) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            findAndCount: jest.fn(),
            find: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Company),
          useValue: { findOne: jest.fn(), update: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
        {
          provide: BillingService,
          useValue: billingServiceMock,
        },
        {
          provide: UserReassignmentService,
          useValue: reassignmentServiceMock,
        },
        {
          provide: OWNERSHIP_TRANSFER_RECORDER,
          useValue: undefined,
        },
        {
          provide: MailService,
          useValue: { sendMail: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: EmailTemplatesService,
          useValue: {
            findAll: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
            render: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repo = module.get(getRepositoryToken(User));
    companyRepo = module.get(getRepositoryToken(Company));
    mailService = module.get(MailService);
    emailTemplatesService = module.get(EmailTemplatesService);
    billingService = module.get(BillingService);

    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a user with hashed password', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(mockUser);
      repo.save.mockResolvedValue(mockUser);
      const mockCompany = { id: companyId, subscriptionTier: 'FREE', maxUsers: 5 } as any;
      companyRepo.findOne.mockResolvedValue(mockCompany);
      repo.count.mockResolvedValue(2);

      const dto = { name: 'Test Agent', email: 'agent@test.com', password: 'pass123', companyId, role: Role.AGENT };
      const result = await service.create(dto as any, companyId, Role.COMPANY_ADMIN);

      expect(bcrypt.hash).toHaveBeenCalledWith('pass123', 12);
      expect(result).toEqual(mockUser);
    });

    it('throws ConflictException when email already exists', async () => {
      repo.findOne.mockResolvedValue(mockUser);
      const mockCompany = { id: companyId, subscriptionTier: 'FREE', maxUsers: 5 } as any;
      companyRepo.findOne.mockResolvedValue(mockCompany);

      const dto = { name: 'Test', email: 'agent@test.com', password: 'pass123', companyId, role: Role.AGENT };
      await expect(service.create(dto as any, companyId, Role.COMPANY_ADMIN)).rejects.toThrow(ConflictException);
    });

    it('throws ForbiddenException when assigning a role equal to requester role', async () => {
      const dto = { name: 'Test', email: 'new@test.com', password: 'pass123', companyId, role: Role.ADMIN };
      await expect(service.create(dto as any, companyId, Role.ADMIN)).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when assigning a role higher than requester role', async () => {
      const dto = { name: 'Test', email: 'new@test.com', password: 'pass123', companyId, role: Role.COMPANY_ADMIN };
      await expect(service.create(dto as any, companyId, Role.ADMIN)).rejects.toThrow(ForbiddenException);
    });

    it('allows SUPER_ADMIN to assign any role including equal privilege', async () => {
      repo.findOne.mockResolvedValue(null);
      const superAdminUser = { ...mockUser, role: Role.SUPER_ADMIN };
      repo.create.mockReturnValue(superAdminUser);
      repo.save.mockResolvedValue(superAdminUser);
      const mockCompany = { id: companyId, subscriptionTier: 'PRO', maxUsers: 999 } as any;
      companyRepo.findOne.mockResolvedValue(mockCompany);
      repo.count.mockResolvedValue(2);

      const dto = { name: 'Another SA', email: 'sa2@test.com', password: 'pass123', companyId, role: Role.SUPER_ADMIN };
      await expect(service.create(dto as any, companyId, Role.SUPER_ADMIN)).resolves.not.toThrow();
    });
  });

  describe('findAll', () => {
    const mockAdmin: User = {
      ...mockUser,
      id: 'admin-uuid',
      role: Role.ADMIN,
      name: 'Test Admin',
      email: 'admin@test.com',
    };
    const mockSuperAdmin: User = {
      ...mockUser,
      id: 'super-uuid',
      role: Role.SUPER_ADMIN,
      name: 'Super Admin',
      email: 'super@test.com',
      companyId: null as any,
    };

    it('returns paginated users for company', async () => {
      repo.findAndCount.mockResolvedValue([[mockUser], 1]);

      const result = await service.findAll(companyId, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { companyId, role: Not(Role.SUPER_ADMIN) },
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
      expect(result.data).toEqual([mockUser]);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('excludes SUPER_ADMIN users for normal company queries', async () => {
      repo.findAndCount.mockResolvedValue([[mockUser, mockAdmin], 2]);

      await service.findAll(companyId, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { companyId, role: Not(Role.SUPER_ADMIN) },
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
    });

    it('returns all users across companies for SUPER_ADMIN', async () => {
      repo.findAndCount.mockResolvedValue([[mockUser, mockSuperAdmin], 2]);

      const result = await service.findAll(undefined as any, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: {},
        relations: ['company'],
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
      expect(result.data.length).toBe(2);
      expect(result.data.every(u => u.role !== Role.SUPER_ADMIN || u.companyId == null)).toBe(true);
    });
  });

  describe('findOne', () => {
    it('returns user when found within company', async () => {
      repo.findOne.mockResolvedValue(mockUser);

      const result = await service.findOne('user-uuid-1', companyId);

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'user-uuid-1', companyId } });
      expect(result).toEqual(mockUser);
    });

    it('throws NotFoundException when user not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when user belongs to different company', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('user-uuid-1', 'other-company')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const mockCompanyAdmin: User = {
      ...mockUser,
      id: 'ca-uuid',
      role: Role.COMPANY_ADMIN,
      name: 'Company Admin',
      email: 'ca@test.com',
      companyId,
    };

    it('updates user fields for same company users', async () => {
      repo.findOne.mockResolvedValue(mockUser);
      repo.save.mockResolvedValue({ ...mockUser, name: 'Updated Name' });

      const result = await service.update('user-uuid-1', companyId, { name: 'Updated Name' } as any, Role.COMPANY_ADMIN, 'ca-uuid');

      expect(result.name).toBe('Updated Name');
    });

    it('hashes new password if provided', async () => {
      repo.findOne.mockResolvedValue(mockUser);
      repo.save.mockResolvedValue(mockUser);

      await service.update('user-uuid-1', companyId, { password: 'new-password' } as any, Role.COMPANY_ADMIN, 'ca-uuid');

      expect(bcrypt.hash).toHaveBeenCalledWith('new-password', 12);
    });

    it('throws ForbiddenException when trying to assign a role <= requester role', async () => {
      repo.findOne.mockResolvedValue(mockUser);

      await expect(
        service.update('user-uuid-1', companyId, { role: Role.MANAGER } as any, Role.AGENT, 'agent-uuid'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows SUPER_ADMIN to update any user role (except SUPER_ADMIN)', async () => {
      const target: User = {
        ...mockUser,
        role: Role.ADMIN,
        id: 'admin-uuid',
        email: 'admin@test.com',
        companyId,
      };
      repo.findOne.mockResolvedValue(target);
      repo.save.mockResolvedValue({ ...target, role: Role.COMPANY_ADMIN });

      const result = await service.update('admin-uuid', companyId, { role: Role.COMPANY_ADMIN } as any, Role.SUPER_ADMIN, 'super-admin-uuid');

      expect(result.role).toBe(Role.COMPANY_ADMIN);
    });
  });

  describe('deactivateUser', () => {
    it('calls the provider BEFORE the transaction with max(purchasedSeats - 1, 1) on paid plans', async () => {
      primeRemovalLookups(proCompany);
      const order: string[] = [];
      billingServiceMock.setSeatQuantity.mockImplementation(async () => { order.push('provider'); });
      dataSourceMock.transaction.mockImplementation(async (cb: (m: unknown) => Promise<unknown>) => {
        order.push('transaction');
        return cb(managerMock);
      });

      await service.deactivateUser('user-uuid-2', 'requester-uuid', companyId, Role.COMPANY_ADMIN, removeDto);

      expect(billingServiceMock.setSeatQuantity).toHaveBeenCalledWith(proCompany, 4);
      expect(order).toEqual(['provider', 'transaction']);
      expect(managerMock.update).toHaveBeenCalledWith(User, 'user-uuid-2', { isActive: false });
      expect(reassignmentServiceMock.reassignOwnedRecords).toHaveBeenCalledWith(
        managerMock, companyId, 'user-uuid-2', 'user-uuid-3', 'left',
        { collectIds: false },
      );
    });

    it('never calls the provider with a quantity below 1', async () => {
      primeRemovalLookups({ ...proCompany, purchasedSeats: 1 } as unknown as Company);
      await service.deactivateUser('user-uuid-2', 'requester-uuid', companyId, Role.COMPANY_ADMIN, removeDto);
      expect(billingServiceMock.setSeatQuantity).toHaveBeenCalledWith(expect.anything(), 1);
    });

    it('makes no provider call on FREE companies', async () => {
      primeRemovalLookups(freeCompany);
      await service.deactivateUser('user-uuid-2', 'requester-uuid', companyId, Role.COMPANY_ADMIN, removeDto);
      expect(billingServiceMock.setSeatQuantity).not.toHaveBeenCalled();
      expect(dataSourceMock.transaction).toHaveBeenCalled();
    });

    it('skips the provider for a paid comp company with no subscription and still deactivates (Option B)', async () => {
      primeRemovalLookups(proCompanyNoSub);
      await service.deactivateUser('user-uuid-2', 'requester-uuid', companyId, Role.COMPANY_ADMIN, removeDto);
      expect(billingServiceMock.setSeatQuantity).not.toHaveBeenCalled();
      expect(dataSourceMock.transaction).toHaveBeenCalled();
      expect(managerMock.update).toHaveBeenCalledWith(User, 'user-uuid-2', { isActive: false });
    });

    it('compensates the seat quantity when the local transaction fails and rethrows the original error', async () => {
      primeRemovalLookups(proCompany);
      dataSourceMock.transaction.mockRejectedValue(new Error('db down'));

      await expect(
        service.deactivateUser('user-uuid-2', 'requester-uuid', companyId, Role.COMPANY_ADMIN, removeDto),
      ).rejects.toThrow('db down');

      expect(billingServiceMock.setSeatQuantity).toHaveBeenNthCalledWith(1, proCompany, 4);
      expect(billingServiceMock.setSeatQuantity).toHaveBeenNthCalledWith(2, proCompany, 5);
    });

    it('rejects self-removal', async () => {
      await expect(
        service.deactivateUser('requester-uuid', 'requester-uuid', companyId, Role.COMPANY_ADMIN, removeDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the reassignment target equals the removed user', async () => {
      await expect(
        service.deactivateUser('user-uuid-2', 'requester-uuid', companyId, Role.COMPANY_ADMIN, {
          reassignToUserId: 'user-uuid-2', reason: 'left',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects removing an equal-or-higher role for non super admins', async () => {
      repo.findOne.mockResolvedValueOnce({ ...targetUser, role: Role.COMPANY_ADMIN } as User);
      await expect(
        service.deactivateUser('user-uuid-2', 'requester-uuid', companyId, Role.COMPANY_ADMIN, removeDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects an inactive reassignment target', async () => {
      repo.findOne
        .mockResolvedValueOnce(targetUser as User)
        .mockResolvedValueOnce(null);
      await expect(
        service.deactivateUser('user-uuid-2', 'requester-uuid', companyId, Role.COMPANY_ADMIN, removeDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteUserWithReassignment', () => {
    it('blocks deletion with 409 when non PENDING commissions exist', async () => {
      primeRemovalLookups(proCompany);
      commissionRepoMock.count.mockResolvedValue(2);
      await expect(
        service.deleteUserWithReassignment('user-uuid-2', 'requester-uuid', companyId, Role.COMPANY_ADMIN, removeDto),
      ).rejects.toThrow(ConflictException);
      expect(billingServiceMock.setSeatQuantity).not.toHaveBeenCalled();
      expect(dataSourceMock.transaction).not.toHaveBeenCalled();
    });

    it('reassigns, nulls email template authorship, deletes notifications, then deletes the row', async () => {
      primeRemovalLookups(proCompany);
      await service.deleteUserWithReassignment('user-uuid-2', 'requester-uuid', companyId, Role.COMPANY_ADMIN, removeDto);

      expect(reassignmentServiceMock.reassignOwnedRecords).toHaveBeenCalledWith(
        managerMock, companyId, 'user-uuid-2', 'user-uuid-3', 'left',
        { collectIds: false },
      );
      expect(managerMock.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "email_templates" SET "created_by" = NULL'),
        ['user-uuid-2', companyId],
      );
      expect(managerMock.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM "notifications"'),
        ['user-uuid-2'],
      );
      expect(managerMock.delete).toHaveBeenCalledWith(User, { id: 'user-uuid-2' });
    });

    it('does not decrement the seat again when deleting an already deactivated user', async () => {
      primeRemovalLookups(proCompany, { ...targetUser, isActive: false });
      await service.deleteUserWithReassignment('user-uuid-2', 'requester-uuid', companyId, Role.COMPANY_ADMIN, removeDto);
      expect(billingServiceMock.setSeatQuantity).not.toHaveBeenCalled();
    });
  });

  describe('trimToOneActiveUser', () => {
    const keeper = { ...mockUser, id: 'keeper-uuid', role: Role.COMPANY_ADMIN, isActive: true };
    const trimDto = { keepUserId: 'keeper-uuid', reason: 'Downgrading to the Free plan' };

    it('sets the seat quantity to 1, then deactivates and reassigns every other active user', async () => {
      repo.findOne.mockResolvedValueOnce(keeper as User);
      companyRepo.findOne.mockResolvedValue(proCompany as Company);
      repo.find.mockResolvedValue([
        { ...mockUser, id: 'u-a' }, { ...mockUser, id: 'u-b' },
      ] as User[]);

      const result = await service.trimToOneActiveUser(companyId, 'keeper-uuid', trimDto);

      expect(billingServiceMock.setSeatQuantity).toHaveBeenCalledWith(proCompany, 1);
      expect(managerMock.update).toHaveBeenCalledWith(User, 'u-a', { isActive: false });
      expect(managerMock.update).toHaveBeenCalledWith(User, 'u-b', { isActive: false });
      expect(reassignmentServiceMock.reassignOwnedRecords).toHaveBeenCalledTimes(2);
      expect(result.deactivatedCount).toBe(2);
      expect(result.reports).toHaveLength(2);
    });

    it('skips the provider call when the company has no subscription', async () => {
      repo.findOne.mockResolvedValueOnce(keeper as User);
      companyRepo.findOne.mockResolvedValue(proCompanyNoSub as Company);
      repo.find.mockResolvedValue([{ ...mockUser, id: 'u-a' }] as User[]);

      const result = await service.trimToOneActiveUser(companyId, 'keeper-uuid', trimDto);
      expect(billingServiceMock.setSeatQuantity).not.toHaveBeenCalled();
      expect(result.deactivatedCount).toBe(1);
    });

    it('rejects a keeper who is not a company admin', async () => {
      repo.findOne.mockResolvedValueOnce({ ...keeper, role: Role.AGENT } as User);
      await expect(
        service.trimToOneActiveUser(companyId, 'keeper-uuid', trimDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('is a no-op when only the keeper is active', async () => {
      repo.findOne.mockResolvedValueOnce(keeper as User);
      companyRepo.findOne.mockResolvedValue(proCompany as Company);
      repo.find.mockResolvedValue([]);
      const result = await service.trimToOneActiveUser(companyId, 'keeper-uuid', trimDto);
      expect(result).toEqual({ deactivatedCount: 0, reports: [] });
      expect(billingServiceMock.setSeatQuantity).not.toHaveBeenCalled();
    });

    it('compensates the seat quantity when the bulk transaction fails', async () => {
      repo.findOne.mockResolvedValueOnce(keeper as User);
      companyRepo.findOne.mockResolvedValue(proCompany as Company);
      repo.find.mockResolvedValue([{ ...mockUser, id: 'u-a' }] as User[]);
      dataSourceMock.transaction.mockRejectedValue(new Error('db down'));

      await expect(
        service.trimToOneActiveUser(companyId, 'keeper-uuid', trimDto),
      ).rejects.toThrow('db down');
      expect(billingServiceMock.setSeatQuantity).toHaveBeenNthCalledWith(1, proCompany, 1);
      expect(billingServiceMock.setSeatQuantity).toHaveBeenNthCalledWith(2, proCompany, 5);
    });
  });

  describe('reactivateUser', () => {
    it('increments the seat before activating on paid plans', async () => {
      repo.findOne.mockResolvedValueOnce({ ...targetUser, isActive: false } as User);
      companyRepo.findOne.mockResolvedValue(proCompany as Company);
      repo.update = jest.fn().mockResolvedValue({});
      jest.spyOn(service, 'findOne').mockResolvedValue(targetUser as User);

      await service.reactivateUser('user-uuid-2', companyId, Role.COMPANY_ADMIN);

      expect(billingServiceMock.setSeatQuantity).toHaveBeenCalledWith(proCompany, 6);
      expect(repo.update).toHaveBeenCalledWith('user-uuid-2', { isActive: true });
    });

    it('skips the provider for a paid comp company with no subscription and still reactivates (Option B)', async () => {
      repo.findOne.mockResolvedValueOnce({ ...targetUser, isActive: false } as User);
      companyRepo.findOne.mockResolvedValue(proCompanyNoSub as Company);
      repo.update = jest.fn().mockResolvedValue({});
      jest.spyOn(service, 'findOne').mockResolvedValue(targetUser as User);

      await service.reactivateUser('user-uuid-2', companyId, Role.COMPANY_ADMIN);

      expect(billingServiceMock.setSeatQuantity).not.toHaveBeenCalled();
      expect(repo.update).toHaveBeenCalledWith('user-uuid-2', { isActive: true });
    });

    it('enforces the FREE active-user cap', async () => {
      repo.findOne.mockResolvedValueOnce({ ...targetUser, isActive: false } as User);
      companyRepo.findOne.mockResolvedValue(freeCompany as Company);
      repo.count.mockResolvedValue(1);
      await expect(
        service.reactivateUser('user-uuid-2', companyId, Role.COMPANY_ADMIN),
      ).rejects.toThrow(BadRequestException);
      expect(billingServiceMock.setSeatQuantity).not.toHaveBeenCalled();
    });

    it('rejects reactivating an already active user', async () => {
      repo.findOne.mockResolvedValueOnce(targetUser as User);
      await expect(
        service.reactivateUser('user-uuid-2', companyId, Role.COMPANY_ADMIN),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findActiveMembers', () => {
    it('queries active non-super-admin members scoped to the company, capped at 500', async () => {
      repo.find.mockResolvedValue([{ id: 'u1' }] as User[]);

      const result = await service.findActiveMembers(companyId);

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId, isActive: true }),
          take: 500,
        }),
      );
      expect(result).toEqual([{ id: 'u1' }]);
    });
  });

  describe('create - user limit enforcement', () => {
    it('should throw BadRequestException when company user limit is reached', async () => {
      const mockCompany = { id: companyId, subscriptionTier: 'FREE', maxUsers: 1 } as any;
      companyRepo.findOne.mockResolvedValue(mockCompany);
      repo.count.mockResolvedValue(1); // already at limit
      repo.findOne.mockResolvedValue(null); // email not taken

      await expect(
        service.create({ email: 'new@test.com', password: 'pass', name: 'New', role: Role.AGENT }, companyId, Role.COMPANY_ADMIN)
      ).rejects.toThrow('Your FREE plan allows up to 1 user');
    });

    it('should allow creation when under user limit', async () => {
      const mockCompany = { id: companyId, subscriptionTier: 'PRO', maxUsers: 999 } as any;
      companyRepo.findOne.mockResolvedValue(mockCompany);
      repo.count.mockResolvedValue(3);
      repo.findOne.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      repo.create.mockReturnValue(mockUser);
      repo.save.mockResolvedValue(mockUser);

      const result = await service.create(
        { email: 'new@test.com', password: 'pass', name: 'New', role: Role.AGENT },
        companyId,
        Role.COMPANY_ADMIN,
      );
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException when company is not found', async () => {
      companyRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create({ email: 'new@test.com', password: 'pass', name: 'New', role: Role.AGENT }, companyId, Role.COMPANY_ADMIN)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('inviteUser', () => {
    beforeEach(() => {
      const mockRandomBytes = { toString: jest.fn().mockReturnValue('abc123temppassword') };
      (crypto.randomBytes as jest.Mock).mockReturnValue(mockRandomBytes);

      // Default: company exists with room to spare
      companyRepo.findOne.mockResolvedValue(
        { id: companyId, subscriptionTier: 'PRO', maxUsers: 999 } as any,
      );
      repo.count.mockResolvedValue(2);
    });

    it('creates a user with temporary password and mustChangePassword=true', async () => {
      repo.findOne.mockResolvedValue(null);
      const invitedUser = {
        ...mockUser,
        name: 'Jane Smith',
        email: 'jane@company.com',
        mustChangePassword: true,
      };
      repo.create.mockReturnValue(invitedUser as User);
      repo.save.mockResolvedValue(invitedUser as User);

      const dto = {
        email: 'jane@company.com',
        firstName: 'Jane',
        lastName: 'Smith',
        role: Role.AGENT,
      };
      const result = await service.inviteUser(companyId, dto, Role.COMPANY_ADMIN);

      expect(crypto.randomBytes).toHaveBeenCalledWith(32);
      expect(bcrypt.hash).toHaveBeenCalledWith('abc123temppassword', 12);
      expect(repo.create).toHaveBeenCalledWith({
        name: 'Jane Smith',
        email: 'jane@company.com',
        password: 'hashed-password',
        role: Role.AGENT,
        companyId,
        mustChangePassword: true,
      });
      expect(result.mustChangePassword).toBe(true);
    });

    it('throws ConflictException when email already exists', async () => {
      repo.findOne.mockResolvedValue(mockUser);

      const dto = {
        email: 'agent@test.com',
        firstName: 'Duplicate',
        lastName: 'User',
      };
      await expect(service.inviteUser(companyId, dto, Role.COMPANY_ADMIN)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when company user limit is reached', async () => {
      const mockCompany = { id: companyId, subscriptionTier: 'FREE', maxUsers: 1 } as any;
      companyRepo.findOne.mockResolvedValue(mockCompany);
      repo.count.mockResolvedValue(1);

      const dto = { email: 'new@test.com', firstName: 'New', lastName: 'User', role: Role.AGENT };
      await expect(service.inviteUser(companyId, dto, Role.COMPANY_ADMIN)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException with correct message when limit is reached', async () => {
      const mockCompany = { id: companyId, subscriptionTier: 'FREE', maxUsers: 1 } as any;
      companyRepo.findOne.mockResolvedValue(mockCompany);
      repo.count.mockResolvedValue(1);

      const dto = { email: 'new@test.com', firstName: 'New', lastName: 'User', role: Role.AGENT };
      await expect(service.inviteUser(companyId, dto, Role.COMPANY_ADMIN)).rejects.toThrow(
        'Your FREE plan allows up to 1 user',
      );
    });

    it('throws NotFoundException when company is not found during invite', async () => {
      companyRepo.findOne.mockResolvedValue(null);

      const dto = { email: 'new@test.com', firstName: 'New', lastName: 'User', role: Role.AGENT };
      await expect(service.inviteUser(companyId, dto, Role.COMPANY_ADMIN)).rejects.toThrow(NotFoundException);
    });

    it('combines firstName and lastName into name', async () => {
      repo.findOne.mockResolvedValue(null);
      const invitedUser = { ...mockUser, name: 'Ahmed Al-Rashid', mustChangePassword: true };
      repo.create.mockReturnValue(invitedUser as User);
      repo.save.mockResolvedValue(invitedUser as User);

      const dto = {
        email: 'ahmed@company.com',
        firstName: 'Ahmed',
        lastName: 'Al-Rashid',
      };
      await service.inviteUser(companyId, dto, Role.COMPANY_ADMIN);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Ahmed Al-Rashid' }),
      );
    });

    it('calls MailService.sendMail with plaintext fallback when no WELCOME template exists', async () => {
      repo.findOne.mockResolvedValue(null);
      const invitedUser = { ...mockUser, name: 'Jane Smith', email: 'jane@company.com', mustChangePassword: true };
      repo.create.mockReturnValue(invitedUser as User);
      repo.save.mockResolvedValue(invitedUser as User);
      (emailTemplatesService.findAll as jest.Mock).mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

      const mockRandomBytes = { toString: jest.fn().mockReturnValue('abc123temppassword') };
      (crypto.randomBytes as jest.Mock).mockReturnValue(mockRandomBytes);

      await service.inviteUser(companyId, {
        email: 'jane@company.com',
        firstName: 'Jane',
        lastName: 'Smith',
        role: Role.AGENT,
      }, Role.COMPANY_ADMIN);

      // Wait for fire-and-forget to complete
      await new Promise(resolve => setImmediate(resolve));

      expect(mailService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'jane@company.com',
          subject: expect.any(String),
          text: expect.stringContaining('abc123temppassword'),
        }),
      );
    });

    it('calls MailService.sendMail with rendered template when WELCOME template exists', async () => {
      repo.findOne.mockResolvedValue(null);
      const invitedUser = { ...mockUser, name: 'Jane Smith', email: 'jane@company.com', mustChangePassword: true };
      repo.create.mockReturnValue(invitedUser as User);
      repo.save.mockResolvedValue(invitedUser as User);

      const mockTemplate = { id: 'tpl-1', subject: 'Welcome {{name}}', body: 'Password: {{password}}' };
      (emailTemplatesService.findAll as jest.Mock).mockResolvedValue({ data: [mockTemplate], total: 1, page: 1, limit: 1 });
      (emailTemplatesService.render as jest.Mock).mockResolvedValue({
        subject: 'Welcome Jane Smith',
        body: 'Password: abc123temppassword',
      });

      const mockRandomBytes = { toString: jest.fn().mockReturnValue('abc123temppassword') };
      (crypto.randomBytes as jest.Mock).mockReturnValue(mockRandomBytes);

      await service.inviteUser(companyId, {
        email: 'jane@company.com',
        firstName: 'Jane',
        lastName: 'Smith',
        role: Role.AGENT,
      }, Role.COMPANY_ADMIN);

      await new Promise(resolve => setImmediate(resolve));

      expect(emailTemplatesService.render).toHaveBeenCalledWith(
        'tpl-1',
        companyId,
        expect.objectContaining({
          name: 'Jane Smith',
          email: 'jane@company.com',
          inviteUrl: expect.stringContaining('/accept-invite'),
        }),
      );
      expect(mailService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'jane@company.com',
          subject: 'Welcome Jane Smith',
          text: 'Password: abc123temppassword',
        }),
      );
    });

    it('still returns saved user even when MailService.sendMail throws', async () => {
      repo.findOne.mockResolvedValue(null);
      const invitedUser = { ...mockUser, name: 'Jane Smith', email: 'jane@company.com', mustChangePassword: true };
      repo.create.mockReturnValue(invitedUser as User);
      repo.save.mockResolvedValue(invitedUser as User);
      (emailTemplatesService.findAll as jest.Mock).mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
      (mailService.sendMail as jest.Mock).mockRejectedValue(new Error('transport error'));

      const mockRandomBytes = { toString: jest.fn().mockReturnValue('abc123temppassword') };
      (crypto.randomBytes as jest.Mock).mockReturnValue(mockRandomBytes);

      const result = await service.inviteUser(companyId, {
        email: 'jane@company.com',
        firstName: 'Jane',
        lastName: 'Smith',
        role: Role.AGENT,
      }, Role.COMPANY_ADMIN);

      expect(result).toBeDefined();
      expect(result.email).toBe('jane@company.com');
    });

    it('reserves a seat before saving the invited user', async () => {
      repo.findOne.mockResolvedValue(null);
      const invitedUser = { ...mockUser, name: 'Jane Smith', email: 'jane@company.com', mustChangePassword: true };
      repo.create.mockReturnValue(invitedUser as User);
      repo.save.mockResolvedValue(invitedUser as User);
      const release = jest.fn().mockResolvedValue(undefined);
      billingService.reserveSeat.mockResolvedValue({ subscriptionId: 'sub_test_1', targetQuantity: 3, release });

      const dto = { email: 'jane@company.com', firstName: 'Jane', lastName: 'Smith', role: Role.AGENT };
      const result = await service.inviteUser(companyId, dto, Role.COMPANY_ADMIN);

      expect(billingService.reserveSeat.mock.invocationCallOrder[0]).toBeLessThan(
        repo.save.mock.invocationCallOrder[0],
      );
      expect(release).not.toHaveBeenCalled();
      expect(result.mustChangePassword).toBe(true);
    });

    it('creates no invite when the provider rejects the seat change', async () => {
      repo.findOne.mockResolvedValue(null);
      billingService.reserveSeat.mockRejectedValue(
        new HttpException(
          { message: 'Payment required', error: 'Payment Required', statusCode: HttpStatus.PAYMENT_REQUIRED },
          HttpStatus.PAYMENT_REQUIRED,
        ),
      );

      const dto = { email: 'jane@company.com', firstName: 'Jane', lastName: 'Smith', role: Role.AGENT };
      const err = await service.inviteUser(companyId, dto, Role.COMPANY_ADMIN).catch((e) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
      expect(repo.save).not.toHaveBeenCalled();
      expect(mailService.sendMail).not.toHaveBeenCalled();
    });

    it('releases the seat when the invited user save fails', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(mockUser);
      repo.save.mockRejectedValue(new Error('insert failed'));
      const release = jest.fn().mockResolvedValue(undefined);
      billingService.reserveSeat.mockResolvedValue({ subscriptionId: 'sub_test_1', targetQuantity: 3, release });

      const dto = { email: 'jane@company.com', firstName: 'Jane', lastName: 'Smith', role: Role.AGENT };
      await expect(service.inviteUser(companyId, dto, Role.COMPANY_ADMIN)).rejects.toThrow('insert failed');
      expect(release).toHaveBeenCalledTimes(1);
    });
  });

  describe('create - seat gate (paid plans)', () => {
    const paidCompany = {
      id: companyId,
      subscriptionTier: 'PRO',
      maxUsers: 999,
      purchasedSeats: 3,
      billingSubscriptionId: 'sub_test_123',
    } as any;
    const dto = { name: 'Paid Agent', email: 'paid@test.com', password: 'pass123', role: Role.AGENT };

    beforeEach(() => {
      companyRepo.findOne.mockResolvedValue(paidCompany);
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(mockUser);
      repo.save.mockResolvedValue(mockUser);
    });

    it('reserves a seat with the provider before saving the user', async () => {
      const release = jest.fn().mockResolvedValue(undefined);
      billingService.reserveSeat.mockResolvedValue({ subscriptionId: 'sub_test_123', targetQuantity: 4, release });

      const result = await service.create(dto as any, companyId, Role.COMPANY_ADMIN);

      expect(billingService.reserveSeat).toHaveBeenCalledWith(paidCompany);
      expect(billingService.reserveSeat.mock.invocationCallOrder[0]).toBeLessThan(
        repo.save.mock.invocationCallOrder[0],
      );
      expect(release).not.toHaveBeenCalled();
      expect(result).toEqual(mockUser);
    });

    it('creates no user when the provider rejects the seat change', async () => {
      billingService.reserveSeat.mockRejectedValue(
        new HttpException(
          { message: 'The billing provider rejected the seat change. No user was created.', error: 'Payment Required', statusCode: HttpStatus.PAYMENT_REQUIRED },
          HttpStatus.PAYMENT_REQUIRED,
        ),
      );

      const err = await service.create(dto as any, companyId, Role.COMPANY_ADMIN).catch((e) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('releases the reserved seat when the local insert fails, then rethrows the original error', async () => {
      const release = jest.fn().mockResolvedValue(undefined);
      billingService.reserveSeat.mockResolvedValue({ subscriptionId: 'sub_test_123', targetQuantity: 4, release });
      repo.save.mockRejectedValue(new Error('duplicate key value violates unique constraint'));

      await expect(service.create(dto as any, companyId, Role.COMPANY_ADMIN)).rejects.toThrow('duplicate key');
      expect(release).toHaveBeenCalledTimes(1);
    });

    it('never writes purchasedSeats locally (webhook is the single writer)', async () => {
      billingService.reserveSeat.mockResolvedValue({
        subscriptionId: 'sub_test_123',
        targetQuantity: 4,
        release: jest.fn().mockResolvedValue(undefined),
      });

      await service.create(dto as any, companyId, Role.COMPANY_ADMIN);

      expect(companyRepo.update).not.toHaveBeenCalled();
    });

    it('creates a FREE user under the cap; reserveSeat no-ops via null', async () => {
      const freeCompany = { id: companyId, subscriptionTier: 'FREE', maxUsers: 1 } as any;
      companyRepo.findOne.mockResolvedValue(freeCompany);
      repo.count.mockResolvedValue(0);
      billingService.reserveSeat.mockResolvedValue(null);

      const result = await service.create(dto as any, companyId, Role.COMPANY_ADMIN);

      expect(billingService.reserveSeat).toHaveBeenCalledWith(freeCompany);
      expect(result).toEqual(mockUser);
    });
  });
});
