import { Test, TestingModule } from '@nestjs/testing';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailTemplatesService } from './email-templates.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailTemplateCategory } from './entities/email-template.entity';

describe('EmailTemplatesController', () => {
  let controller: EmailTemplatesController;
  let service: jest.Mocked<EmailTemplatesService>;

  const companyId = 'company-uuid-1';
  const mockReq = { user: { companyId, userId: 'user-uuid-1' } };

  const mockTemplate = {
    id: 'template-uuid-1',
    companyId,
    name: 'Welcome Tenant',
    subject: 'Welcome to {{propertyName}}!',
    body: '<h1>Hello {{firstName}}</h1>',
    category: EmailTemplateCategory.WELCOME,
    variables: ['firstName', 'propertyName'],
    isActive: true,
    createdBy: 'user-uuid-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const paginated = { data: [mockTemplate], total: 1, page: 1, limit: 20 };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailTemplatesController],
      providers: [
        {
          provide: EmailTemplatesService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            render: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EmailTemplatesController>(EmailTemplatesController);
    service = module.get(EmailTemplatesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('creates template scoped to company', async () => {
      service.create.mockResolvedValue(mockTemplate as any);

      const dto = { name: 'Welcome Tenant', subject: 'Welcome!', body: '<h1>Hi</h1>' };
      const result = await controller.create(dto as any, mockReq);

      expect(service.create).toHaveBeenCalledWith(companyId, dto, 'user-uuid-1');
      expect(result).toEqual(mockTemplate);
    });
  });

  describe('findAll', () => {
    it('returns paginated templates', async () => {
      service.findAll.mockResolvedValue(paginated as any);

      const result = await controller.findAll(mockReq, 1, 20);

      expect(service.findAll).toHaveBeenCalledWith(companyId, 1, 20);
      expect(result).toEqual(paginated);
    });

    it('passes category filter when provided', async () => {
      service.findAll.mockResolvedValue(paginated as any);

      await controller.findAll(mockReq, 1, 20, EmailTemplateCategory.WELCOME);

      expect(service.findAll).toHaveBeenCalledWith(companyId, 1, 20, EmailTemplateCategory.WELCOME);
    });
  });

  describe('findOne', () => {
    it('returns template by id', async () => {
      service.findOne.mockResolvedValue(mockTemplate as any);

      const result = await controller.findOne('template-uuid-1', mockReq);

      expect(service.findOne).toHaveBeenCalledWith('template-uuid-1', companyId);
      expect(result).toEqual(mockTemplate);
    });
  });

  describe('update', () => {
    it('updates template', async () => {
      service.update.mockResolvedValue({ ...mockTemplate, name: 'Updated' } as any);

      const result = await controller.update('template-uuid-1', { name: 'Updated' }, mockReq);

      expect(service.update).toHaveBeenCalledWith('template-uuid-1', companyId, { name: 'Updated' });
    });
  });

  describe('remove', () => {
    it('removes template', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove('template-uuid-1', mockReq);

      expect(service.remove).toHaveBeenCalledWith('template-uuid-1', companyId);
    });
  });

  describe('render', () => {
    it('renders template with variables', async () => {
      const rendered = { subject: 'Welcome to Marina Tower!', body: '<h1>Hello Ahmed</h1>' };
      service.render.mockResolvedValue(rendered);

      const dto = { variables: { firstName: 'Ahmed', propertyName: 'Marina Tower' } };
      const result = await controller.render('template-uuid-1', dto, mockReq);

      expect(service.render).toHaveBeenCalledWith('template-uuid-1', companyId, dto.variables);
      expect(result).toEqual(rendered);
    });
  });
});
