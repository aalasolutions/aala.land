import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { Contact, ContactType } from './entities/contact.entity';

describe('ContactsService', () => {
  let service: ContactsService;
  let repo: jest.Mocked<Repository<Contact>>;

  const companyId = 'company-uuid-1';

  const mockContact: Partial<Contact> = {
    id: 'contact-uuid-1',
    companyId,
    firstName: 'Ahmed',
    lastName: 'Al-Rashid',
    email: 'ahmed@example.com',
    phone: '+971501234567',
    whatsappNumber: '+971501234567',
    type: ContactType.OTHER,
    contactCompany: 'Emaar Properties',
    jobTitle: 'Property Manager',
    address: 'Business Bay, Dubai',
    notes: 'VIP client',
    tags: ['VIP', 'dubai-marina'],
    leadId: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        {
          provide: getRepositoryToken(Contact),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            findAndCount: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ContactsService>(ContactsService);
    repo = module.get(getRepositoryToken(Contact));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates and returns a contact', async () => {
      const dto = {
        firstName: 'Ahmed',
        lastName: 'Al-Rashid',
        email: 'ahmed@example.com',
        phone: '+971501234567',
        type: ContactType.OTHER,
      };

      repo.create.mockReturnValue(mockContact as Contact);
      repo.save.mockResolvedValue(mockContact as Contact);

      const result = await service.create(companyId, dto as any);

      expect(repo.create).toHaveBeenCalledWith({ ...dto, companyId });
      expect(repo.save).toHaveBeenCalledWith(mockContact);
      expect(result).toEqual(mockContact);
    });
  });

  describe('findAll', () => {
    it('returns paginated contacts sorted by createdAt DESC', async () => {
      repo.findAndCount.mockResolvedValue([[mockContact as Contact], 1]);

      const result = await service.findAll(companyId, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: [{ companyId }],
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('returns paginated contacts with search filter', async () => {
      repo.findAndCount.mockResolvedValue([[mockContact as Contact], 1]);

      const result = await service.findAll(companyId, 1, 20, 'Ahmed');

      const callArgs = repo.findAndCount.mock.calls[0]![0]!;
      expect((callArgs as any).where).toHaveLength(4);
      expect((callArgs as any).where[0]).toHaveProperty('firstName');
      expect((callArgs as any).where[1]).toHaveProperty('lastName');
      expect((callArgs as any).where[2]).toHaveProperty('email');
      expect((callArgs as any).where[3]).toHaveProperty('phone');
      expect(result.total).toBe(1);
    });

    it('calculates correct skip for page 2', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll(companyId, 2, 10);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });

  describe('findOne', () => {
    it('returns contact when found', async () => {
      repo.findOne.mockResolvedValue(mockContact as Contact);

      const result = await service.findOne('contact-uuid-1', companyId);

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 'contact-uuid-1', companyId },
        relations: ['lead'],
      });
      expect(result).toEqual(mockContact);
    });

    it('throws NotFoundException when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for wrong company', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('contact-uuid-1', 'other-company')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates and returns the contact', async () => {
      const updated = { ...mockContact, firstName: 'Khalid' } as Contact;
      repo.findOne.mockResolvedValue({ ...mockContact } as Contact);
      repo.save.mockResolvedValue(updated);

      const result = await service.update('contact-uuid-1', companyId, { firstName: 'Khalid' });

      expect(result.firstName).toBe('Khalid');
    });

    it('throws NotFoundException when contact does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.update('bad-id', companyId, { firstName: 'Khalid' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('removes the contact', async () => {
      repo.findOne.mockResolvedValue(mockContact as Contact);
      repo.remove.mockResolvedValue(mockContact as Contact);

      await service.remove('contact-uuid-1', companyId);

      expect(repo.remove).toHaveBeenCalledWith(mockContact);
    });

    it('throws NotFoundException when contact does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.remove('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });
  });
});
