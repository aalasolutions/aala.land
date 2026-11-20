import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DeleteContactDto } from './dto/delete-contact.dto';
import { ContactsExportService } from './transfer/contacts-export.service';
import { ExportContactsQueryDto } from './dto/export-contacts-query.dto';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';

describe('ContactsController', () => {
  let controller: ContactsController;
  let service: jest.Mocked<ContactsService>;
  let exportService: jest.Mocked<ContactsExportService>;

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
        {
          provide: ContactsExportService,
          useValue: { export: jest.fn() },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ContactsController>(ContactsController);
    service = module.get(ContactsService);
    exportService = module.get(ContactsExportService);
  });

  describe('exportList', () => {
    const query = (overrides: Partial<ExportContactsQueryDto> = {}) =>
      Object.assign(new ExportContactsQueryDto(), overrides);
    const res = () => ({ setHeader: jest.fn(), send: jest.fn() });
    const file = (truncated = false) => ({
      buffer: Buffer.from('a,b'),
      contentType: 'text/csv; charset=utf-8',
      extension: 'csv' as const,
      fileName: 'contacts-dubai-2026-11-19.csv',
      rows: 1,
      truncated,
    });

    it('is COMPANY_ADMIN only', () => {
      expect(Reflect.getMetadata(ROLES_KEY, controller.exportList)).toEqual([
        Role.COMPANY_ADMIN,
      ]);
    });

    it('hands the query and the viewer to the export service and streams the file', async () => {
      exportService.export.mockResolvedValue(file());
      const response = res();
      const q = query({ format: 'csv', tag: 'tenant', search: 'Ahmed' });

      await controller.exportList(q, mockReq, response as never);

      expect(exportService.export).toHaveBeenCalledWith(
        companyId,
        {
          userId: 'user-uuid-1',
          role: 'company_admin',
          regionCodes: callerRegions,
        },
        q,
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/csv; charset=utf-8',
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="contacts-dubai-2026-11-19.csv"',
      );
      expect(response.setHeader).not.toHaveBeenCalledWith(
        'X-Export-Truncated',
        'true',
      );
      expect(response.send).toHaveBeenCalledWith(Buffer.from('a,b'));
    });

    it('marks a capped export with the truncation header', async () => {
      exportService.export.mockResolvedValue(file(true));
      const response = res();
      await controller.exportList(query(), mockReq, response as never);
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-Export-Truncated',
        'true',
      );
    });

    it('rejects a format outside csv and xlsx and an unknown tag at the DTO', async () => {
      const bad = plainToInstance(ExportContactsQueryDto, {
        format: 'pdf',
        tag: 'vendor',
        companyExact: 'yes',
      });
      const errors = await validate(bad);
      expect(errors.map((e) => e.property).sort()).toEqual([
        'companyExact',
        'format',
        'tag',
      ]);
      const good = plainToInstance(ExportContactsQueryDto, {
        format: 'xlsx',
        tag: 'owner',
        allRegions: 'true',
        regionCode: 'dubai',
      });
      expect(await validate(good)).toEqual([]);
    });
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
          companyExact: false,
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
          companyExact: false,
          nationality: undefined,
          dateFrom: undefined,
          dateTo: undefined,
          allRegions: false,
        },
        mockReq.user,
      );
    });
  });

  describe('findAll tag', () => {
    it('400s a tag outside the known list, such as the old vendor', () => {
      expect(() =>
        controller.findAll(mockReq, 1, 20, undefined, 'vendor'),
      ).toThrow(BadRequestException);
      expect(service.findAll).not.toHaveBeenCalled();
    });

    it('passes a known tag through', async () => {
      service.findAll.mockResolvedValue(paginated as any);

      await controller.findAll(mockReq, 1, 20, undefined, 'portfolio_owner');

      expect(service.findAll.mock.calls[0][4]).toBe('portfolio_owner');
    });
  });

  describe('findAll tagCounts', () => {
    it('asks for tag totals only on tagCounts=true', async () => {
      service.findAll.mockResolvedValue(paginated as any);
      const call = (tagCounts?: string) =>
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
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          tagCounts,
        );

      await call('true');
      expect(service.findAll.mock.calls[0][5]?.tagCounts).toBe(true);

      await call('false');
      expect(service.findAll.mock.calls[1][5]?.tagCounts).toBeUndefined();

      await call();
      expect(service.findAll.mock.calls[2][5]?.tagCounts).toBeUndefined();
    });
  });

  describe('findAll sort', () => {
    it('passes sort=name and rejects any other value', async () => {
      service.findAll.mockResolvedValue(paginated as any);
      const call = (sort?: string) =>
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
          undefined,
          undefined,
          undefined,
          undefined,
          sort,
        );

      await call('name');
      expect(service.findAll.mock.calls[0][5]).toMatchObject({ sort: 'name' });

      expect(() => call('created')).toThrow(BadRequestException);
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
