import { Test, TestingModule } from '@nestjs/testing';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContactType } from './entities/contact.entity';

describe('ContactsController', () => {
  let controller: ContactsController;
  let service: jest.Mocked<ContactsService>;

  const companyId = 'company-uuid-1';
  const mockReq = { user: { companyId, userId: 'user-uuid-1' } };

  const mockContact = {
    id: 'contact-uuid-1',
    companyId,
    firstName: 'Ahmed',
    lastName: 'Al-Rashid',
    email: 'ahmed@example.com',
    phone: '+971501234567',
    type: ContactType.OTHER,
    tags: ['VIP'],
  };

  const paginated = { data: [mockContact], total: 1, page: 1, limit: 20 };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContactsController],
      providers: [
        {
          provide: ContactsService,
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

    controller = module.get<ContactsController>(ContactsController);
    service = module.get(ContactsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('creates contact scoped to company', async () => {
      service.create.mockResolvedValue(mockContact as any);

      const dto = { firstName: 'Ahmed', lastName: 'Al-Rashid', email: 'ahmed@example.com' };
      const result = await controller.create(dto as any, mockReq);

      expect(service.create).toHaveBeenCalledWith(companyId, dto);
      expect(result).toEqual(mockContact);
    });
  });

  describe('findAll', () => {
    it('returns paginated contacts', async () => {
      service.findAll.mockResolvedValue(paginated as any);

      const result = await controller.findAll(mockReq, 1, 20, undefined);

      expect(service.findAll).toHaveBeenCalledWith(companyId, 1, 20, undefined);
      expect(result).toEqual(paginated);
    });

    it('passes search parameter to service', async () => {
      service.findAll.mockResolvedValue(paginated as any);

      await controller.findAll(mockReq, 1, 20, 'Ahmed');

      expect(service.findAll).toHaveBeenCalledWith(companyId, 1, 20, 'Ahmed');
    });
  });

  describe('findOne', () => {
    it('returns contact by id', async () => {
      service.findOne.mockResolvedValue(mockContact as any);

      const result = await controller.findOne('contact-uuid-1', mockReq);

      expect(service.findOne).toHaveBeenCalledWith('contact-uuid-1', companyId);
      expect(result).toEqual(mockContact);
    });
  });

  describe('update', () => {
    it('updates contact', async () => {
      const updated = { ...mockContact, firstName: 'Khalid' };
      service.update.mockResolvedValue(updated as any);

      const result = await controller.update('contact-uuid-1', { firstName: 'Khalid' }, mockReq);

      expect(service.update).toHaveBeenCalledWith('contact-uuid-1', companyId, { firstName: 'Khalid' });
      expect(result.firstName).toBe('Khalid');
    });
  });

  describe('remove', () => {
    it('removes contact', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove('contact-uuid-1', mockReq);

      expect(service.remove).toHaveBeenCalledWith('contact-uuid-1', companyId);
    });
  });
});
