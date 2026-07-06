import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Role } from '@shared/enums/roles.enum';

describe('UsersController', () => {
  let controller: UsersController;
  let service: jest.Mocked<UsersService>;

  const companyId = 'company-uuid-1';

  const mockUser = {
    id: 'user-uuid-1',
    name: 'Test Agent',
    email: 'agent@test.com',
    role: Role.AGENT,
    companyId,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockReq = {
    user: {
      userId: 'admin-uuid-1',
      email: 'admin@test.com',
      companyId,
      role: Role.COMPANY_ADMIN,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            deactivateUser: jest.fn(),
            reactivateUser: jest.fn(),
            deleteUserWithReassignment: jest.fn(),
            trimToOneActiveUser: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('creates a user', async () => {
      service.create.mockResolvedValue(mockUser as any);

      const dto = { name: 'Test Agent', email: 'agent@test.com', password: 'pass123', companyId };
      const result = await controller.create(dto as any, mockReq);

      expect(service.create).toHaveBeenCalledWith(dto, companyId, Role.COMPANY_ADMIN);
      expect(result).toEqual(mockUser);
    });
  });

  describe('findAll', () => {
    it('returns paginated users for company', async () => {
      const paginated = { data: [mockUser], total: 1, page: 1, limit: 20 };
      service.findAll.mockResolvedValue(paginated as any);

      const result = await controller.findAll(mockReq, 1, 20);

      expect(service.findAll).toHaveBeenCalledWith(companyId, 1, 20);
      expect(result).toEqual(paginated);
    });
  });

  describe('findOne', () => {
    it('returns user by id scoped to company', async () => {
      service.findOne.mockResolvedValue(mockUser as any);

      const result = await controller.findOne('user-uuid-1', mockReq);

      expect(service.findOne).toHaveBeenCalledWith('user-uuid-1', companyId);
      expect(result).toEqual(mockUser);
    });

    it('propagates NotFoundException', async () => {
      service.findOne.mockRejectedValue(new NotFoundException());

      await expect(controller.findOne('bad-id', mockReq)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates user', async () => {
      service.update.mockResolvedValue({ ...mockUser, name: 'Updated' } as any);

      const result = await controller.update('user-uuid-1', { name: 'Updated' } as any, mockReq);

      expect(service.update).toHaveBeenCalledWith(
        'user-uuid-1',
        companyId,
        { name: 'Updated' },
        Role.COMPANY_ADMIN,
        'admin-uuid-1',
      );
      expect(result.name).toBe('Updated');
    });
  });

  describe('updateMyProfile', () => {
    it('updates only safe self-profile fields', async () => {
      service.update.mockResolvedValue({ ...mockUser, name: 'Updated Self' } as any);

      const result = await controller.updateMyProfile(
        { name: 'Updated Self', role: Role.SUPER_ADMIN } as any,
        mockReq,
      );

      expect(service.update).toHaveBeenCalledWith(
        'admin-uuid-1',
        companyId,
        { name: 'Updated Self' },
        Role.COMPANY_ADMIN,
        'admin-uuid-1',
      );
      expect(result.name).toBe('Updated Self');
    });
  });

  describe('removal endpoints', () => {
    const dto = { reassignToUserId: 'user-uuid-3', reason: 'left' };
    const reqAdmin = { user: { userId: 'requester-uuid', companyId: 'company-uuid-1', role: 'company_admin' } };

    it('DELETE /users/:id forwards to deleteUserWithReassignment with the requester context', async () => {
      await controller.remove('user-uuid-2', dto as never, reqAdmin as never);
      expect(service.deleteUserWithReassignment).toHaveBeenCalledWith(
        'user-uuid-2', 'requester-uuid', 'company-uuid-1', 'company_admin', dto,
      );
    });

    it('POST /users/:id/deactivate forwards to deactivateUser', async () => {
      await controller.deactivate('user-uuid-2', dto as never, reqAdmin as never);
      expect(service.deactivateUser).toHaveBeenCalledWith(
        'user-uuid-2', 'requester-uuid', 'company-uuid-1', 'company_admin', dto,
      );
    });

    it('POST /users/:id/reactivate forwards to reactivateUser', async () => {
      await controller.reactivate('user-uuid-2', reqAdmin as never);
      expect(service.reactivateUser).toHaveBeenCalledWith('user-uuid-2', 'company-uuid-1', 'company_admin');
    });

    it('POST /users/trim-to-one requires a company context', async () => {
      const reqNoCompany = { user: { userId: 'sa', companyId: null, role: 'super_admin' } };
      expect(() =>
        controller.trimToOne({ keepUserId: 'k', reason: 'r' } as never, reqNoCompany as never),
      ).toThrow(BadRequestException);
    });

    it('SUPER_ADMIN passes an undefined companyId so the service resolves scope from the target', async () => {
      const reqSa = { user: { userId: 'sa-uuid', companyId: null, role: 'super_admin' } };
      await controller.remove('user-uuid-2', dto as never, reqSa as never);
      expect(service.deleteUserWithReassignment).toHaveBeenCalledWith(
        'user-uuid-2', 'sa-uuid', undefined, 'super_admin', dto,
      );
    });
  });
});
