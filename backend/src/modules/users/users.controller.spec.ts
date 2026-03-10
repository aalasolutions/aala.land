import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
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

  const mockReq = { user: { companyId } };

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
            remove: jest.fn(),
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

      expect(service.create).toHaveBeenCalledWith(dto, companyId);
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

      expect(service.update).toHaveBeenCalledWith('user-uuid-1', companyId, { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('removes user', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove('user-uuid-1', mockReq);

      expect(service.remove).toHaveBeenCalledWith('user-uuid-1', companyId);
    });
  });
});
