import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { BadGatewayException } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { Role } from '@shared/enums/roles.enum';

describe('WhatsappController', () => {
  let controller: WhatsappController;
  let wa: jest.Mocked<WhatsappService>;

  const makeReq = (userId: string, companyId: string) =>
    ({
      user: { userId, companyId, role: Role.COMPANY_ADMIN, email: 'a@b.com' },
    }) as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [
        {
          provide: WhatsappService,
          useValue: {
            getConnection: jest.fn(),
            getChats: jest.fn(),
            getAllMessages: jest.fn(),
            getMessagesForChat: jest.fn(),
            getAiConfig: jest.fn(),
            getAiCreditUsage: jest.fn(),
            toggleAi: jest.fn(),
            getAiHistory: jest.fn(),
            sendMessage: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(WhatsappController);
    wa = module.get(WhatsappService);
  });

  describe('GET connection', () => {
    it('reads the caller own row, never a companyId from the query', async () => {
      const info = {
        status: 'connected',
        displayPhoneNumber: '+971500000000',
        connectedAt: '2026-08-01T00:00:00.000Z',
        disconnectedAt: null,
        disconnectReason: null,
      };
      wa.getConnection.mockResolvedValue(info as any);

      const result = await controller.getConnection(makeReq('u1', 'c1'));

      expect(wa.getConnection).toHaveBeenCalledWith('u1', 'c1');
      expect(result).toBe(info);
    });

    it('returns null when the caller has never connected a number', async () => {
      wa.getConnection.mockResolvedValue(null);

      await expect(
        controller.getConnection(makeReq('u1', 'c1')),
      ).resolves.toBeNull();
    });

    it('is open to every operator role, not admin only', () => {
      const reflector = new Reflector();
      expect(
        reflector.get<Role[]>('roles', controller.getConnection),
      ).toBeUndefined();
    });
  });

  describe('POST send', () => {
    it('sends as the caller and returns the created message unwrapped', async () => {
      const created = { id: 'wamid.op1', chatId: '971501234567', fromMe: true };
      wa.sendMessage.mockResolvedValue(created as any);
      const req = makeReq('u1', 'c1');

      const result = await controller.send(req, {
        chatId: '971501234567',
        body: 'hello',
      });

      expect(wa.sendMessage).toHaveBeenCalledWith(
        'u1',
        'c1',
        '971501234567',
        'hello',
      );
      // The socket path consumes a bare message, so the composer can render it directly.
      expect(result).toBe(created);
    });

    it('propagates a refused send instead of swallowing it', async () => {
      wa.sendMessage.mockRejectedValue(
        new BadGatewayException('WhatsApp could not be reached'),
      );

      await expect(
        controller.send(makeReq('u1', 'c1'), {
          chatId: '971501234567',
          body: 'hello',
        }),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('is open to every operator role on the controller, not admin only', () => {
      const reflector = new Reflector();
      expect(reflector.get<Role[]>('roles', controller.send)).toBeUndefined();
    });
  });

  describe('POST ai/toggle', () => {
    it('calls wa.toggleAi with correct params and returns result', async () => {
      wa.toggleAi.mockResolvedValue({ enabled: true } as any);
      const req = makeReq('u1', 'c1');

      const result = await controller.toggleAi(req, { enabled: true });

      expect(wa.toggleAi).toHaveBeenCalledWith('u1', 'c1', true);
      expect(result).toEqual({ enabled: true });
    });

    it('has COMPANY_ADMIN role restriction on toggleAi method', () => {
      const reflector = new Reflector();
      const roles = reflector.get<Role[]>('roles', controller.toggleAi);
      expect(roles).toEqual([Role.COMPANY_ADMIN]);
    });
  });
});
