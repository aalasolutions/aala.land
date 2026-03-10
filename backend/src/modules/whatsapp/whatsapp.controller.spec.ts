import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MessageDirection, MessageStatus } from './entities/whatsapp-message.entity';

describe('WhatsappController', () => {
  let controller: WhatsappController;
  let service: jest.Mocked<WhatsappService>;

  const companyId = 'company-uuid-1';
  const mockReq = { user: { companyId, userId: 'user-uuid-1' } };

  const mockMessage = {
    id: 'msg-uuid-1',
    companyId,
    phoneNumber: '+971501234567',
    message: 'Hello from AALA',
    direction: MessageDirection.OUTBOUND,
    status: MessageStatus.SENT,
    leadId: null,
  };

  const paginated = { data: [mockMessage], total: 1, page: 1, limit: 20 };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [
        {
          provide: WhatsappService,
          useValue: {
            sendMessage: jest.fn(),
            handleWebhook: jest.fn(),
            findMessages: jest.fn(),
            findMessagesByLead: jest.fn(),
            findOne: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WhatsappController>(WhatsappController);
    service = module.get(WhatsappService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('send', () => {
    it('sends message scoped to company', async () => {
      service.sendMessage.mockResolvedValue(mockMessage as any);

      const dto = { phoneNumber: '+971501234567', message: 'Hello from AALA' };
      const result = await controller.send(dto as any, mockReq);

      expect(service.sendMessage).toHaveBeenCalledWith(companyId, dto);
      expect(result).toEqual(mockMessage);
    });
  });

  describe('webhook', () => {
    it('processes incoming webhook', async () => {
      service.handleWebhook.mockResolvedValue({ received: true });

      const payload = { object: 'whatsapp_business_account', entry: [] };
      const result = await controller.webhook(payload, companyId);

      expect(service.handleWebhook).toHaveBeenCalledWith(companyId, payload);
      expect(result).toEqual({ received: true });
    });

    it('uses system as fallback when no company_id query param', async () => {
      service.handleWebhook.mockResolvedValue({ received: true });

      await controller.webhook({}, undefined as any);

      expect(service.handleWebhook).toHaveBeenCalledWith('system', {});
    });
  });

  describe('webhookVerify', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv, WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'test-token-123' };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('returns challenge when token matches', () => {
      const result = controller.webhookVerify('subscribe', 'test-token-123', 'challenge-abc');
      expect(result).toBe('challenge-abc');
    });

    it('returns error when token mismatches', () => {
      const result = controller.webhookVerify('subscribe', 'wrong-token', 'challenge-abc');
      expect(result).toEqual({ error: 'Verification failed' });
    });
  });

  describe('findAll', () => {
    it('returns paginated messages', async () => {
      service.findMessages.mockResolvedValue(paginated as any);

      const result = await controller.findAll(mockReq, 1, 20);

      expect(service.findMessages).toHaveBeenCalledWith(companyId, 1, 20);
      expect(result).toEqual(paginated);
    });
  });

  describe('findByLead', () => {
    it('returns messages for lead', async () => {
      service.findMessagesByLead.mockResolvedValue(paginated as any);

      const result = await controller.findByLead('lead-uuid-1', mockReq, 1, 20);

      expect(service.findMessagesByLead).toHaveBeenCalledWith('lead-uuid-1', companyId, 1, 20);
    });
  });

  describe('findOne', () => {
    it('returns single message', async () => {
      service.findOne.mockResolvedValue(mockMessage as any);

      const result = await controller.findOne('msg-uuid-1', mockReq);

      expect(service.findOne).toHaveBeenCalledWith('msg-uuid-1', companyId);
    });
  });
});
