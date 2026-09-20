import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappSignupService } from './whatsapp-signup.service';
import { Role } from '@shared/enums/roles.enum';
import { GRAPH_VERSION } from './wa-types';
import { ListWaMessagesDto } from './dto/list-wa-messages.dto';
import { ListWaChatMessagesDto } from './dto/list-wa-chat-messages.dto';
import { WaChatIdParamDto } from './dto/wa-chat-id-param.dto';

describe('WhatsappController', () => {
  let controller: WhatsappController;
  let wa: jest.Mocked<WhatsappService>;
  let signup: jest.Mocked<WhatsappSignupService>;

  const makeReq = (userId: string, companyId: string | null) =>
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
            getMessagesAfter: jest.fn(),
            getMessagesAround: jest.fn(),
            getAiConfig: jest.fn(),
            getAiCreditUsage: jest.fn(),
            toggleAi: jest.fn(),
            getAiHistory: jest.fn(),
            sendMessage: jest.fn(),
          },
        },
        {
          provide: WhatsappSignupService,
          useValue: {
            getSignupConfig: jest.fn(),
            connect: jest.fn(),
            disconnect: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(WhatsappController);
    wa = module.get(WhatsappService);
    signup = module.get(WhatsappSignupService);
  });

  describe('Embedded Signup', () => {
    it('serves the signup config the browser needs to launch the flow', () => {
      const config = {
        appId: '123',
        configId: '456',
        graphVersion: GRAPH_VERSION,
      };
      signup.getSignupConfig.mockReturnValue(config);

      expect(controller.getSignupConfig()).toBe(config);
    });

    it('connects as the caller, never as a companyId taken from the body', async () => {
      const dto = { code: 'AQ...', wabaId: '111', phoneNumberId: '222' };
      const info = { status: 'connected' };
      signup.connect.mockResolvedValue(info as any);

      const result = await controller.connect(makeReq('u1', 'c1'), dto);

      expect(signup.connect).toHaveBeenCalledWith('u1', 'c1', dto);
      expect(result).toBe(info);
    });

    it('disconnects the caller own connection', async () => {
      signup.disconnect.mockResolvedValue({ success: true });

      await expect(
        controller.disconnect(makeReq('u1', 'c1')),
      ).resolves.toEqual({ success: true });
      expect(signup.disconnect).toHaveBeenCalledWith('u1', 'c1');
    });

    it('leaves connecting open to every operator role, not admin only', () => {
      const reflector = new Reflector();
      expect(
        reflector.get<Role[]>('roles', controller.connect),
      ).toBeUndefined();
      expect(
        reflector.get<Role[]>('roles', controller.disconnect),
      ).toBeUndefined();
    });
  });

  describe('null companyId (SUPER_ADMIN acting without a company)', () => {
    // SUPER_ADMIN with null companyId must be rejected up front, not fall through unscoped.
    it('rejects connect before calling the signup service', () => {
      expect(() =>
        controller.connect(makeReq('super-1', null), {
          code: 'AQ...',
          wabaId: '111',
          phoneNumberId: '222',
        }),
      ).toThrow(ForbiddenException);
      expect(signup.connect).not.toHaveBeenCalled();
    });

    it('rejects getConnection before calling the service', () => {
      expect(() => controller.getConnection(makeReq('super-1', null))).toThrow(
        ForbiddenException,
      );
      expect(wa.getConnection).not.toHaveBeenCalled();
    });
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

  describe('GET messages', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const validate = (metatype: any, value: Record<string, string>) =>
      pipe.transform(value, { type: 'query', metatype });

    it('defaults both endpoints to 50 when limit is omitted', async () => {
      wa.getAllMessages.mockResolvedValue({ messages: [], hasMore: false });
      wa.getMessagesForChat.mockResolvedValue({ messages: [], hasMore: false });

      await controller.getAllMessages(
        makeReq('u1', 'c1'),
        await validate(ListWaMessagesDto, {}),
      );
      await controller.getMessages(
        makeReq('u1', 'c1'),
        { chatId: 'chat-a' },
        await validate(ListWaChatMessagesDto, {}),
      );

      expect(wa.getAllMessages).toHaveBeenCalledWith('c1', 'u1', 1, 50);
      expect(wa.getMessagesForChat).toHaveBeenCalledWith(
        'c1',
        'u1',
        'chat-a',
        50,
        undefined,
      );
    });

    it('passes limit and before for the caller own company and user', async () => {
      const page = { messages: [], hasMore: true };
      wa.getMessagesForChat.mockResolvedValue(page);

      const result = await controller.getMessages(
        makeReq('u1', 'c1'),
        { chatId: 'chat-a' },
        await validate(ListWaChatMessagesDto, {
          limit: '20',
          before: 'wamid.HBgM=',
        }),
      );

      expect(wa.getMessagesForChat).toHaveBeenCalledWith(
        'c1',
        'u1',
        'chat-a',
        20,
        'wamid.HBgM=',
      );
      expect(result).toBe(page);
    });

    it.each([
      [ListWaMessagesDto, { limit: '201' }],
      [ListWaMessagesDto, { limit: '0' }],
      [ListWaChatMessagesDto, { limit: '201' }],
      [ListWaChatMessagesDto, { limit: '0' }],
      [ListWaChatMessagesDto, { before: 'has space' }],
      [ListWaChatMessagesDto, { before: 'x'.repeat(256) }],
      [ListWaChatMessagesDto, { after: 'has space' }],
      [ListWaChatMessagesDto, { after: 'x'.repeat(256) }],
      [ListWaChatMessagesDto, { around: 'has space' }],
      [ListWaChatMessagesDto, { around: 'x'.repeat(256) }],
      [ListWaChatMessagesDto, { page: '2' }],
    ])('rejects an out-of-contract query with 400 (%p %p)', async (dto, q) => {
      await expect(validate(dto, q)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('routes after to the newer page for the caller own company and user', async () => {
      const page = { messages: [], hasMore: false };
      wa.getMessagesAfter.mockResolvedValue(page);

      const result = await controller.getMessages(
        makeReq('u1', 'c1'),
        { chatId: 'chat-a' },
        await validate(ListWaChatMessagesDto, { limit: '20', after: 'wamid.A' }),
      );

      expect(wa.getMessagesAfter).toHaveBeenCalledWith(
        'c1',
        'u1',
        'chat-a',
        'wamid.A',
        20,
      );
      expect(wa.getMessagesForChat).not.toHaveBeenCalled();
      expect(result).toBe(page);
    });

    it('routes around to the window for the caller own company and user', async () => {
      const window = { messages: [], hasMoreOlder: true, hasMoreNewer: false };
      wa.getMessagesAround.mockResolvedValue(window);

      const result = await controller.getMessages(
        makeReq('u1', 'c1'),
        { chatId: 'chat-a' },
        await validate(ListWaChatMessagesDto, { around: 'wamid.M' }),
      );

      expect(wa.getMessagesAround).toHaveBeenCalledWith(
        'c1',
        'u1',
        'chat-a',
        'wamid.M',
        50,
      );
      expect(result).toBe(window);
    });

    it.each([
      [{ before: 'a', after: 'b' }],
      [{ before: 'a', around: 'b' }],
      [{ after: 'a', around: 'b' }],
      [{ before: 'a', after: 'b', around: 'c' }],
    ])('rejects more than one cursor with 400 (%p)', async (q) => {
      const query = await validate(ListWaChatMessagesDto, q);

      expect(() =>
        controller.getMessages(makeReq('u1', 'c1'), { chatId: 'chat-a' }, query),
      ).toThrow(BadRequestException);
      expect(wa.getMessagesForChat).not.toHaveBeenCalled();
      expect(wa.getMessagesAfter).not.toHaveBeenCalled();
      expect(wa.getMessagesAround).not.toHaveBeenCalled();
    });

    it('accepts limit 200 and the regionCode the interceptor injects', async () => {
      await expect(
        validate(ListWaChatMessagesDto, { limit: '200', regionCode: 'dubai' }),
      ).resolves.toMatchObject({ limit: 200 });
    });
  });

  describe(':chatId route param', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const validateParam = (value: Record<string, string>) =>
      pipe.transform(value, { type: 'param', metatype: WaChatIdParamDto });

    it.each(['chat-a', '+971501234567', '0971501234567', '123', '9'.repeat(16)])(
      'rejects an invalid chatId with 400 (%p)',
      async (chatId) => {
        await expect(validateParam({ chatId })).rejects.toBeInstanceOf(
          BadRequestException,
        );
      },
    );

    it('accepts an E.164 chatId without a plus sign', async () => {
      await expect(
        validateParam({ chatId: '971501234567' }),
      ).resolves.toMatchObject({ chatId: '971501234567' });
    });

    it('both :chatId routes take WaChatIdParamDto', () => {
      for (const method of ['getMessages', 'getAiHistory']) {
        const types = Reflect.getMetadata(
          'design:paramtypes',
          WhatsappController.prototype,
          method,
        );
        expect(types[1]).toBe(WaChatIdParamDto);
      }
    });

    it('returns the AI history for a valid chatId', async () => {
      wa.getAiHistory.mockResolvedValue([]);
      const params = await validateParam({ chatId: '971501234567' });

      await expect(
        controller.getAiHistory(makeReq('u1', 'c1'), params),
      ).resolves.toEqual({ chatId: '971501234567', history: [] });
      expect(wa.getAiHistory).toHaveBeenCalledWith('u1', '971501234567');
    });
  });
});
