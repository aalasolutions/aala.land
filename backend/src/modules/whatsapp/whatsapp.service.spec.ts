import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappMessage, MessageDirection, MessageStatus } from './entities/whatsapp-message.entity';

describe('WhatsappService', () => {
  let service: WhatsappService;
  let repo: jest.Mocked<Repository<WhatsappMessage>>;

  const companyId = 'company-uuid-1';

  const mockMessage: Partial<WhatsappMessage> = {
    id: 'msg-uuid-1',
    companyId,
    phoneNumber: '+971501234567',
    message: 'Hello from AALA',
    direction: MessageDirection.OUTBOUND,
    status: MessageStatus.SENT,
    leadId: null,
    externalId: null,
    mediaUrl: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        {
          provide: getRepositoryToken(WhatsappMessage),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            findAndCount: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
    repo = module.get(getRepositoryToken(WhatsappMessage));

    jest.spyOn(service as any, 'dispatchToWhatsAppApi').mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendMessage', () => {
    it('saves message and dispatches to API', async () => {
      const queued = { ...mockMessage, status: MessageStatus.QUEUED } as WhatsappMessage;
      const sent = { ...mockMessage, status: MessageStatus.SENT } as WhatsappMessage;

      repo.create.mockReturnValue(queued);
      repo.save.mockResolvedValueOnce(queued).mockResolvedValueOnce(sent);

      const dto = { phoneNumber: '+971501234567', message: 'Hello from AALA' };
      const result = await service.sendMessage(companyId, dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId,
          phoneNumber: '+971501234567',
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.QUEUED,
        }),
      );
      expect(repo.save).toHaveBeenCalledTimes(2);
    });

    it('marks message FAILED when dispatch throws', async () => {
      const queued = { ...mockMessage, status: MessageStatus.QUEUED } as WhatsappMessage;
      const failed = { ...mockMessage, status: MessageStatus.FAILED } as WhatsappMessage;

      repo.create.mockReturnValue(queued);
      repo.save.mockResolvedValueOnce(queued).mockResolvedValueOnce(failed);

      jest.spyOn(service as any, 'dispatchToWhatsAppApi').mockRejectedValue(new Error('API down'));

      const dto = { phoneNumber: '+971501234567', message: 'Hello' };
      const result = await service.sendMessage(companyId, dto);

      expect(repo.save).toHaveBeenCalledTimes(2);
      expect(queued.status).toBe(MessageStatus.FAILED);
    });
  });

  describe('handleWebhook', () => {
    it('returns received true for valid payload', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    { from: '+971509999999', text: { body: 'Hi there' }, id: 'wamid.abc123' },
                  ],
                },
              },
            ],
          },
        ],
      };

      const inbound: Partial<WhatsappMessage> = {
        ...mockMessage,
        direction: MessageDirection.INBOUND,
        phoneNumber: '+971509999999',
        message: 'Hi there',
      };

      repo.create.mockReturnValue(inbound as WhatsappMessage);
      repo.save.mockResolvedValue(inbound as WhatsappMessage);

      const result = await service.handleWebhook(companyId, payload);

      expect(result).toEqual({ received: true });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: MessageDirection.INBOUND,
          phoneNumber: '+971509999999',
          message: 'Hi there',
        }),
      );
    });

    it('returns received true for empty entry array', async () => {
      const result = await service.handleWebhook(companyId, { entry: [] });
      expect(result).toEqual({ received: true });
    });

    it('returns received true on missing entry', async () => {
      const result = await service.handleWebhook(companyId, {});
      expect(result).toEqual({ received: true });
    });
  });

  describe('findMessages', () => {
    it('returns paginated messages', async () => {
      repo.findAndCount.mockResolvedValue([[mockMessage as WhatsappMessage], 1]);

      const result = await service.findMessages(companyId, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { companyId },
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
      expect(result.total).toBe(1);
      expect(result.data).toEqual([mockMessage]);
    });
  });

  describe('findMessagesByLead', () => {
    it('returns paginated messages for lead', async () => {
      repo.findAndCount.mockResolvedValue([[mockMessage as WhatsappMessage], 1]);

      const result = await service.findMessagesByLead('lead-uuid-1', companyId, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { leadId: 'lead-uuid-1', companyId },
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findOne', () => {
    it('returns message when found', async () => {
      repo.findOne.mockResolvedValue(mockMessage as WhatsappMessage);

      const result = await service.findOne('msg-uuid-1', companyId);

      expect(result).toEqual(mockMessage);
    });

    it('throws NotFoundException when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for wrong company', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('msg-uuid-1', 'other-company')).rejects.toThrow(NotFoundException);
    });
  });
});
