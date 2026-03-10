import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { EmailTemplatesService } from './email-templates.service';
import { EmailTemplate, EmailTemplateCategory } from './entities/email-template.entity';

describe('EmailTemplatesService', () => {
  let service: EmailTemplatesService;
  let repo: jest.Mocked<Repository<EmailTemplate>>;

  const companyId = 'company-uuid-1';

  const mockTemplate: Partial<EmailTemplate> = {
    id: 'template-uuid-1',
    companyId,
    name: 'Welcome Tenant',
    subject: 'Welcome to {{propertyName}}, {{firstName}}!',
    body: '<h1>Hello {{firstName}}</h1><p>Your lease for {{propertyName}} begins on {{startDate}}.</p>',
    category: EmailTemplateCategory.WELCOME,
    variables: ['firstName', 'propertyName', 'startDate'],
    isActive: true,
    createdBy: 'user-uuid-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailTemplatesService,
        {
          provide: getRepositoryToken(EmailTemplate),
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

    service = module.get<EmailTemplatesService>(EmailTemplatesService);
    repo = module.get(getRepositoryToken(EmailTemplate));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates and returns an email template', async () => {
      repo.create.mockReturnValue(mockTemplate as EmailTemplate);
      repo.save.mockResolvedValue(mockTemplate as EmailTemplate);

      const dto = {
        name: 'Welcome Tenant',
        subject: 'Welcome to {{propertyName}}, {{firstName}}!',
        body: '<h1>Hello {{firstName}}</h1>',
        category: EmailTemplateCategory.WELCOME,
        variables: ['firstName', 'propertyName'],
      };
      const result = await service.create(companyId, dto as any, 'user-uuid-1');

      expect(repo.create).toHaveBeenCalledWith({ ...dto, companyId, createdBy: 'user-uuid-1' });
      expect(result).toEqual(mockTemplate);
    });
  });

  describe('findAll', () => {
    it('returns paginated templates for company', async () => {
      repo.findAndCount.mockResolvedValue([[mockTemplate as EmailTemplate], 1]);

      const result = await service.findAll(companyId, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { companyId },
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
      expect(result.data).toEqual([mockTemplate]);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('filters by category when provided', async () => {
      repo.findAndCount.mockResolvedValue([[mockTemplate as EmailTemplate], 1]);

      await service.findAll(companyId, 1, 20, EmailTemplateCategory.WELCOME);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { companyId, category: EmailTemplateCategory.WELCOME },
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findOne', () => {
    it('returns template when found', async () => {
      repo.findOne.mockResolvedValue(mockTemplate as EmailTemplate);

      const result = await service.findOne('template-uuid-1', companyId);

      expect(result).toEqual(mockTemplate);
    });

    it('throws NotFoundException when template not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when template belongs to different company', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('template-uuid-1', 'other-company')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates template fields', async () => {
      repo.findOne.mockResolvedValue({ ...mockTemplate } as EmailTemplate);
      repo.save.mockResolvedValue({ ...mockTemplate, name: 'Updated Name' } as EmailTemplate);

      const result = await service.update('template-uuid-1', companyId, { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
    });

    it('throws NotFoundException when updating non-existent template', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.update('bad-id', companyId, { name: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('removes template', async () => {
      repo.findOne.mockResolvedValue(mockTemplate as EmailTemplate);
      repo.remove.mockResolvedValue(mockTemplate as EmailTemplate);

      await service.remove('template-uuid-1', companyId);

      expect(repo.remove).toHaveBeenCalledWith(mockTemplate);
    });

    it('throws NotFoundException when removing non-existent template', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.remove('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('render', () => {
    it('replaces all placeholders in subject and body', async () => {
      repo.findOne.mockResolvedValue(mockTemplate as EmailTemplate);

      const result = await service.render('template-uuid-1', companyId, {
        firstName: 'Ahmed',
        propertyName: 'Marina Tower',
        startDate: '2026-04-01',
      });

      expect(result.subject).toBe('Welcome to Marina Tower, Ahmed!');
      expect(result.body).toBe('<h1>Hello Ahmed</h1><p>Your lease for Marina Tower begins on 2026-04-01.</p>');
    });

    it('leaves unmatched placeholders as-is', async () => {
      repo.findOne.mockResolvedValue(mockTemplate as EmailTemplate);

      const result = await service.render('template-uuid-1', companyId, {
        firstName: 'Ahmed',
      });

      expect(result.subject).toBe('Welcome to {{propertyName}}, Ahmed!');
      expect(result.body).toContain('{{startDate}}');
    });

    it('throws NotFoundException when rendering non-existent template', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.render('bad-id', companyId, { firstName: 'Ahmed' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('handles multiple occurrences of the same variable', async () => {
      const templateWithDuplicates: Partial<EmailTemplate> = {
        ...mockTemplate,
        subject: '{{firstName}} - Reminder',
        body: 'Dear {{firstName}}, this is for {{firstName}}.',
      };
      repo.findOne.mockResolvedValue(templateWithDuplicates as EmailTemplate);

      const result = await service.render('template-uuid-1', companyId, {
        firstName: 'Ahmed',
      });

      expect(result.subject).toBe('Ahmed - Reminder');
      expect(result.body).toBe('Dear Ahmed, this is for Ahmed.');
    });
  });
});
