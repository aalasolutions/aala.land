import { Test, TestingModule } from '@nestjs/testing';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DeleteContactDto } from './dto/delete-contact.dto';

describe('ContactsController', () => {
  let controller: ContactsController;
  let service: jest.Mocked<ContactsService>;

  const companyId = 'company-uuid-1';
  const callerRegions = ['dubai'];
  const mockReq = {
    user: {
      companyId,
      userId: 'user-uuid-1',
      email: 'agent@test.com',
      role: 'company_admin',
      regionCodes: callerRegions,
    },
  };
  const caller = { role: 'company_admin', regionCodes: callerRegions };

  const mockContact = {
    id: 'contact-uuid-1',
    companyId,
    firstName: 'Ahmed',
    lastName: 'Al-Rashid',
    email: 'ahmed@example.com',
    phone: '+971501234567',
    isWhatsapp: false,
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
            verifyPhone: jest.fn(),
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
    it('creates contact scoped to company with createdBy', async () => {
      service.create.mockResolvedValue(mockContact as any);

      const dto = {
        firstName: 'Ahmed',
        lastName: 'Al-Rashid',
        email: 'ahmed@example.com',
      };
      const result = await controller.create(dto as any, mockReq);

      expect(service.create).toHaveBeenCalledWith(
        companyId,
        dto,
        'user-uuid-1',
        caller,
      );
      expect(result).toEqual(mockContact);
    });
  });

  describe('findAll', () => {
    it('returns paginated contacts', async () => {
      service.findAll.mockResolvedValue(paginated as any);

      const result = await controller.findAll(mockReq, 1, 20, undefined);

      expect(service.findAll).toHaveBeenCalledWith(
        companyId,
        1,
        20,
        undefined,
        undefined,
        {
          agentId: undefined,
          isWhatsapp: undefined,
          company: undefined,
          nationality: undefined,
          dateFrom: undefined,
          dateTo: undefined,
          allRegions: false,
        },
        mockReq.user,
      );
      expect(result).toEqual(paginated);
    });

    it('passes search parameter to service', async () => {
      service.findAll.mockResolvedValue(paginated as any);

      await controller.findAll(mockReq, 1, 20, 'Ahmed');

      expect(service.findAll).toHaveBeenCalledWith(
        companyId,
        1,
        20,
        'Ahmed',
        undefined,
        {
          agentId: undefined,
          isWhatsapp: undefined,
          company: undefined,
          nationality: undefined,
          dateFrom: undefined,
          dateTo: undefined,
          allRegions: false,
        },
        mockReq.user,
      );
    });
  });

  describe('findAll allRegions', () => {
    it("passes allRegions only for the literal 'true'", async () => {
      service.findAll.mockResolvedValue(paginated as any);
      const args = [
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
        undefined,
        'makkah',
      ] as const;

      await controller.findAll(...args, 'true');
      await controller.findAll(...args, '1');

      const filters = service.findAll.mock.calls.map((c) => c[5]);
      expect(filters[0]).toMatchObject({
        regionCode: 'makkah',
        allRegions: true,
      });
      expect(filters[1]).toMatchObject({ allRegions: false });
    });
  });

  describe('verifyPhone', () => {
    it('passes the typed phone and the caller to the service', async () => {
      service.verifyPhone.mockResolvedValue({
        verified: false,
        contact: { id: 'contact-uuid-1' },
      } as any);

      await controller.verifyPhone(
        'contact-uuid-1',
        { phone: '0501234567' },
        mockReq,
      );

      expect(service.verifyPhone).toHaveBeenCalledWith(
        'contact-uuid-1',
        companyId,
        '0501234567',
        mockReq.user,
      );
    });
  });

  describe('findOne', () => {
    it('returns contact by id', async () => {
      service.findOne.mockResolvedValue(mockContact as any);

      const result = await controller.findOne('contact-uuid-1', mockReq);

      expect(service.findOne).toHaveBeenCalledWith(
        'contact-uuid-1',
        companyId,
        mockReq.user,
      );
      expect(result).toEqual(mockContact);
    });
  });

  describe('update', () => {
    it('updates contact', async () => {
      const updated = { ...mockContact, firstName: 'Khalid' };
      service.update.mockResolvedValue(updated as any);

      const result = await controller.update(
        'contact-uuid-1',
        { firstName: 'Khalid' },
        mockReq,
      );

      expect(service.update).toHaveBeenCalledWith(
        'contact-uuid-1',
        companyId,
        { firstName: 'Khalid' },
        mockReq.user,
      );
      expect(result.firstName).toBe('Khalid');
    });
  });

  describe('remove', () => {
    it('POST :id/delete passes the body DTO and actor', async () => {
      service.remove.mockResolvedValue(undefined);
      const dto = {
        reason: 'Duplicate',
        transferToContactId: 'contact-uuid-2',
      };

      await controller.remove('contact-uuid-1', dto, mockReq);

      expect(service.remove).toHaveBeenCalledWith(
        'contact-uuid-1',
        companyId,
        dto,
        'user-uuid-1',
        caller,
      );
    });
  });

  describe('DeleteContactDto', () => {
    const errorsFor = (body: object) =>
      validate(plainToInstance(DeleteContactDto, body));

    it('requires a non-blank reason', async () => {
      expect(await errorsFor({})).not.toHaveLength(0);
      expect(await errorsFor({ reason: '  ' })).not.toHaveLength(0);
    });

    it('rejects a non-uuid transfer target', async () => {
      expect(
        await errorsFor({ reason: 'Duplicate', transferToContactId: 'x' }),
      ).not.toHaveLength(0);
    });

    it('accepts a reason with an optional uuid target', async () => {
      expect(await errorsFor({ reason: 'Duplicate' })).toHaveLength(0);
      expect(
        await errorsFor({
          reason: 'Duplicate',
          transferToContactId: '9460c4c5-344a-4782-963e-8ec3b2b52479',
        }),
      ).toHaveLength(0);
    });
  });
});
