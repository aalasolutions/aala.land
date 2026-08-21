import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappSendError } from './whatsapp-cloud-api.service';
import { WhatsappConnection } from './entities/whatsapp-connection.entity';

const connection = {
  id: 'conn-1',
  companyId: 'company-1',
  userId: 'user-1',
  phoneNumberId: 'pnid-1',
  displayPhoneNumber: '+971500000000',
  accessTokenCiphertext: 'super-secret-token',
} as WhatsappConnection;

describe('WhatsappService', () => {
  let service: WhatsappService;
  let connections: { findOne: jest.Mock; update: jest.Mock };
  let store: { addMessage: jest.Mock };
  let ai: { recordHumanReply: jest.Mock; getCreditUsage: jest.Mock };
  let gateway: { emitMessage: jest.Mock; emitAi: jest.Mock };
  let cloud: { sendText: jest.Mock };

  beforeEach(() => {
    connections = {
      findOne: jest.fn().mockResolvedValue(connection),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    store = { addMessage: jest.fn().mockResolvedValue(true) };
    ai = {
      recordHumanReply: jest.fn().mockResolvedValue(undefined),
      getCreditUsage: jest.fn(),
    };
    gateway = { emitMessage: jest.fn(), emitAi: jest.fn() };
    cloud = {
      sendText: jest.fn().mockResolvedValue({ messageId: 'wamid.op1' }),
    };
    service = new WhatsappService(
      connections as any,
      store as any,
      ai as any,
      gateway as any,
      cloud as any,
    );
  });

  describe('getConnection', () => {
    it('scopes the lookup to the caller and their company', async () => {
      await service.getConnection('user-1', 'company-1');

      expect(connections.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1', companyId: 'company-1' },
      });
    });

    it('returns null when the caller has no row, rather than an empty shell', async () => {
      connections.findOne.mockResolvedValue(null);

      await expect(
        service.getConnection('user-1', 'company-1'),
      ).resolves.toBeNull();
    });

    it('never exposes the access token ciphertext', async () => {
      const result = await service.getConnection('user-1', 'company-1');

      expect(result).not.toHaveProperty('accessTokenCiphertext');
      expect(JSON.stringify(result)).not.toContain('super-secret-token');
    });

    it('serialises the lifecycle dates as ISO strings and passes the reason through', async () => {
      connections.findOne.mockResolvedValue({
        ...connection,
        status: 'disconnected',
        connectedAt: new Date('2026-08-01T10:00:00.000Z'),
        disconnectedAt: new Date('2026-08-05T09:30:00.000Z'),
        disconnectReason: 'PARTNER_REMOVED',
      });

      const result = await service.getConnection('user-1', 'company-1');

      expect(result).toEqual({
        status: 'disconnected',
        displayPhoneNumber: '+971500000000',
        connectedAt: '2026-08-01T10:00:00.000Z',
        disconnectedAt: '2026-08-05T09:30:00.000Z',
        disconnectReason: 'PARTNER_REMOVED',
      });
    });

    it('reports a pending row with null dates instead of failing on them', async () => {
      connections.findOne.mockResolvedValue({
        ...connection,
        status: 'pending',
        connectedAt: null,
        disconnectedAt: null,
        disconnectReason: null,
      });

      const result = await service.getConnection('user-1', 'company-1');

      expect(result).toEqual({
        status: 'pending',
        displayPhoneNumber: '+971500000000',
        connectedAt: null,
        disconnectedAt: null,
        disconnectReason: null,
      });
    });
  });

  describe('sendMessage', () => {
    it('sends through the caller own connected number', async () => {
      const result = await service.sendMessage(
        'user-1',
        'company-1',
        '971501234567',
        'the keys are ready',
      );

      expect(connections.findOne).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          companyId: 'company-1',
          status: 'connected',
        },
      });
      expect(cloud.sendText).toHaveBeenCalledWith(
        connection,
        '971501234567',
        'the keys are ready',
      );
      expect(result.id).toBe('wamid.op1');
      expect(result.chatId).toBe('971501234567');
      expect(result.body).toBe('the keys are ready');
    });

    it('marks the row outbound and human, never AI', async () => {
      const before = Math.floor(Date.now() / 1000);

      const result = await service.sendMessage(
        'user-1',
        'company-1',
        '971501234567',
        'hi',
      );

      expect(result.fromMe).toBe(true);
      expect(result.aiGenerated).toBe(false);
      expect(result.originUserId).toBe('user-1');
      // Seconds, matching every other timestamp on the WhatsApp path.
      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThan(before + 60);
    });

    it('persists the real wamid with the connection phone number id', async () => {
      await service.sendMessage('user-1', 'company-1', '971501234567', 'hi');

      expect(store.addMessage).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        expect.objectContaining({
          id: 'wamid.op1',
          chatId: '971501234567',
          fromMe: true,
          aiGenerated: false,
        }),
        'pnid-1',
      );
    });

    it('pushes the new message to the operator dashboards', async () => {
      const result = await service.sendMessage(
        'user-1',
        'company-1',
        '971501234567',
        'hi',
      );

      expect(gateway.emitMessage).toHaveBeenCalledWith('user-1', result);
    });

    it('records the human takeover BEFORE the send goes out', async () => {
      await service.sendMessage('user-1', 'company-1', '971501234567', 'hi');

      expect(ai.recordHumanReply).toHaveBeenCalledWith(
        'user-1',
        '971501234567',
      );
      expect(ai.recordHumanReply.mock.invocationCallOrder[0]).toBeLessThan(
        cloud.sendText.mock.invocationCallOrder[0],
      );
    });

    it('never touches credits: the operator path is free by ruling', async () => {
      await service.sendMessage('user-1', 'company-1', '971501234567', 'hi');

      expect(ai.getCreditUsage).not.toHaveBeenCalled();
      expect(gateway.emitAi).not.toHaveBeenCalled();
    });

    it('refuses with a 400 when the caller has no CONNECTED row', async () => {
      connections.findOne.mockResolvedValue(null);

      await expect(
        service.sendMessage('user-1', 'company-1', '971501234567', 'hi'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(ai.recordHumanReply).not.toHaveBeenCalled();
      expect(cloud.sendText).not.toHaveBeenCalled();
      expect(store.addMessage).not.toHaveBeenCalled();
    });

    it('maps a send failure to a 502 without leaking the token or the Graph body', async () => {
      cloud.sendText.mockRejectedValue(
        new WhatsappSendError(
          'Cloud API send failed 400: {"error":{"message":"bad token super-secret-token"}}',
          400,
          131042,
        ),
      );

      const err = (await service
        .sendMessage('user-1', 'company-1', '971501234567', 'hi')
        .catch((e: unknown) => e)) as Error;

      expect(err).toBeInstanceOf(BadGatewayException);
      expect(err.message).toBe(
        'WhatsApp rejected the message (HTTP 400); it was not sent',
      );
      expect(err.message).not.toContain('super-secret-token');
      expect(store.addMessage).not.toHaveBeenCalled();
      expect(gateway.emitMessage).not.toHaveBeenCalled();
    });

    it('maps a transport failure with no HTTP status to a 502', async () => {
      cloud.sendText.mockRejectedValue(
        new WhatsappSendError('Cloud API send error: fetch failed'),
      );

      const err = (await service
        .sendMessage('user-1', 'company-1', '971501234567', 'hi')
        .catch((e: unknown) => e)) as Error;

      expect(err).toBeInstanceOf(BadGatewayException);
      expect(err.message).toBe(
        'WhatsApp could not be reached; the message was not sent',
      );
    });

    it('rethrows anything that is not a send failure untouched', async () => {
      const boom = new Error('unexpected');
      cloud.sendText.mockRejectedValue(boom);

      await expect(
        service.sendMessage('user-1', 'company-1', '971501234567', 'hi'),
      ).rejects.toBe(boom);
    });

    it('still returns the delivered message when the store write fails', async () => {
      jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
      store.addMessage.mockRejectedValue(new Error('db down'));

      const result = await service.sendMessage(
        'user-1',
        'company-1',
        '971501234567',
        'hi',
      );

      // Meta already has it; reporting a failure here would only invite a duplicate.
      expect(result.id).toBe('wamid.op1');
      expect(gateway.emitMessage).toHaveBeenCalled();
    });
  });
});
