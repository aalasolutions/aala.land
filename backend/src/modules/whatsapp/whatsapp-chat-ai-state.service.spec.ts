import { Logger, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { SystemEmailService } from '../email/system-email.service';
import { User } from '../users/entities/user.entity';
import { WhatsappChatAiState } from './entities/whatsapp-chat-ai-state.entity';
import { WhatsappChat } from './entities/whatsapp-chat.entity';
import { WhatsappGateway } from './whatsapp.gateway';
import {
  ESCALATION_REASON_LABELS,
  WhatsappChatAiStateService,
} from './whatsapp-chat-ai-state.service';

const CO = 'co-1';
const USER = 'user-1';
const CHAT = '971501234567';
const AT = new Date('2026-11-23T10:00:00Z');
const AT_SECONDS = Math.floor(AT.getTime() / 1000);

describe('WhatsappChatAiStateService', () => {
  let states: {
    query: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
  };
  let chats: { findOne: jest.Mock };
  let users: { findOne: jest.Mock };
  let gateway: { emitChatAiState: jest.Mock };
  let notifications: { create: jest.Mock };
  let systemEmail: { sendWhatsappSafetyEscalation: jest.Mock };
  let service: WhatsappChatAiStateService;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterAll(() => jest.restoreAllMocks());

  beforeEach(() => {
    jest.clearAllMocks();
    states = {
      query: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    chats = { findOne: jest.fn().mockResolvedValue({ chatName: 'Sara' }) };
    users = {
      findOne: jest.fn().mockResolvedValue({
        id: USER,
        email: 'owner@example.com',
        name: 'Owner',
      }),
    };
    gateway = { emitChatAiState: jest.fn() };
    notifications = { create: jest.fn().mockResolvedValue({ id: 'n-1' }) };
    systemEmail = {
      sendWhatsappSafetyEscalation: jest.fn().mockResolvedValue(undefined),
    };
    service = new WhatsappChatAiStateService(
      states as unknown as Repository<WhatsappChatAiState>,
      chats as unknown as Repository<WhatsappChat>,
      users as unknown as Repository<User>,
      gateway as unknown as WhatsappGateway,
      notifications as unknown as NotificationsService,
      systemEmail as unknown as SystemEmailService,
    );
  });

  const flagRow = (over: Record<string, unknown> = {}) => ({
    chat_id: CHAT,
    escalated_at: null,
    escalation_reason: null,
    opted_out_at: null,
    ...over,
  });

  function expectScopedByKey(callIndex = 0) {
    const [sql, params] = states.query.mock.calls[callIndex] as [
      string,
      unknown[],
    ];
    expect(sql).toContain('"company_id"');
    expect(sql).toContain('"user_id"');
    expect(sql).toContain('"chat_id"');
    expect(params.slice(0, 3)).toEqual([CO, USER, CHAT]);
  }

  describe('get', () => {
    it('reads the row by company, user and chat', async () => {
      states.findOne.mockResolvedValue(null);
      await expect(service.get(CO, USER, CHAT)).resolves.toBeNull();
      expect(states.findOne).toHaveBeenCalledWith({
        where: { companyId: CO, userId: USER, chatId: CHAT },
      });
    });
  });

  describe('listFlagged', () => {
    it('returns only flagged chats of the company and user', async () => {
      states.query.mockResolvedValue([
        flagRow({ escalated_at: AT, escalation_reason: 'request' }),
      ]);

      const rows = await service.listFlagged(CO, USER);

      const [sql, params] = states.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('"company_id" = $1 AND "user_id" = $2');
      expect(sql).toContain(
        '"escalated_at" IS NOT NULL OR "opted_out_at" IS NOT NULL',
      );
      expect(params).toEqual([CO, USER]);
      expect(rows).toEqual([
        {
          chatId: CHAT,
          escalatedAt: AT,
          escalationReason: 'request',
          optedOutAt: null,
        },
      ]);
    });
  });

  describe('escalate', () => {
    const NOTIFIED_SQL = '"escalation_notified_at" = now()';

    it('flags the chat, emits, notifies once and records the notification', async () => {
      states.query.mockResolvedValueOnce([
        flagRow({ escalated_at: AT, escalation_reason: 'payment' }),
      ]);
      states.query.mockResolvedValueOnce([[], 1]);

      await expect(
        service.escalate(CO, USER, CHAT, 'payment'),
      ).resolves.toEqual({ escalated: true, notified: true });

      expectScopedByKey();
      const [sql, params] = states.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('ON CONFLICT ("company_id", "user_id", "chat_id")');
      expect(sql).toContain('"escalated_at" IS NULL');
      expect(params[3]).toBe('payment');
      expect(gateway.emitChatAiState).toHaveBeenCalledWith(USER, {
        chatId: CHAT,
        aiEscalatedAt: AT_SECONDS,
        aiEscalationReason: 'payment',
        aiOptedOutAt: null,
      });
      expect(chats.findOne).toHaveBeenCalledWith({
        where: { companyId: CO, userId: USER, chatId: CHAT },
        select: { chatName: true },
      });
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledWith(CO, {
        userId: USER,
        type: NotificationType.WHATSAPP_ESCALATION,
        title: 'WhatsApp chat needs a reply',
        message:
          'Sara: Payment or deposit question. Automatic replies are paused until someone replies.',
        entityType: 'WhatsappChat',
      });
      expectScopedByKey(1);
      expect(states.query.mock.calls[1][0]).toContain(NOTIFIED_SQL);
      expect(systemEmail.sendWhatsappSafetyEscalation).not.toHaveBeenCalled();
    });

    it('does nothing more when the chat is already escalated and notified', async () => {
      states.query.mockResolvedValueOnce([]);
      states.query.mockResolvedValueOnce([]);

      await expect(
        service.escalate(CO, USER, CHAT, 'request'),
      ).resolves.toEqual({ escalated: false, notified: false });

      expectScopedByKey(1);
      expect(states.query.mock.calls[1][0]).toContain(
        '"escalation_notified_at" IS NULL',
      );
      expect(notifications.create).not.toHaveBeenCalled();
      expect(gateway.emitChatAiState).not.toHaveBeenCalled();
    });

    it('retries only the notification when an earlier one failed', async () => {
      states.query.mockResolvedValueOnce([]);
      states.query.mockResolvedValueOnce([{ escalation_reason: 'safety' }]);
      states.query.mockResolvedValueOnce([[], 1]);

      await expect(
        service.escalate(CO, USER, CHAT, 'request'),
      ).resolves.toEqual({ escalated: false, notified: true });

      expect(gateway.emitChatAiState).not.toHaveBeenCalled();
      expect(notifications.create.mock.calls[0][1].message).toBe(
        'Sara: Safety concern. Automatic replies are paused until someone replies.',
      );
      expect(states.query.mock.calls[2][0]).toContain(NOTIFIED_SQL);
      expect(systemEmail.sendWhatsappSafetyEscalation).toHaveBeenCalledTimes(1);
    });

    it('labels the notification with the number when the chat has no name', async () => {
      chats.findOne.mockResolvedValue(null);
      states.query.mockResolvedValueOnce([
        flagRow({ escalated_at: AT, escalation_reason: 'other' }),
      ]);
      states.query.mockResolvedValueOnce([[], 1]);

      await service.escalate(CO, USER, CHAT, 'other');

      expect(notifications.create.mock.calls[0][1].message).toBe(
        `${CHAT}: Needs the team. Automatic replies are paused until someone replies.`,
      );
    });

    it.each([
      ['complaint', 'complaint', 'Complaint'],
      ['opt_out', 'opt_out', 'Asked to stop messages'],
      ['account', 'other', 'Needs the team'],
      ['x'.repeat(64), 'other', 'Needs the team'],
    ])('stores reason "%s" as %s', async (input, stored, label) => {
      states.query.mockResolvedValueOnce([
        flagRow({ escalated_at: AT, escalation_reason: stored }),
      ]);
      states.query.mockResolvedValueOnce([[], 1]);

      await service.escalate(CO, USER, CHAT, input);

      expect(states.query.mock.calls[0][1][3]).toBe(stored);
      expect(notifications.create.mock.calls[0][1].message).toBe(
        `Sara: ${label}. Automatic replies are paused until someone replies.`,
      );
    });

    it('keeps the flag and leaves the notification pending when it fails', async () => {
      notifications.create.mockRejectedValue(new NotFoundException());
      states.query.mockResolvedValueOnce([
        flagRow({ escalated_at: AT, escalation_reason: 'request' }),
      ]);

      await expect(
        service.escalate(CO, USER, CHAT, 'request'),
      ).resolves.toEqual({ escalated: true, notified: false });
      expect(states.query).toHaveBeenCalledTimes(1);
      expect(Logger.prototype.error).toHaveBeenCalled();
    });

    it('leaves the notification pending when the chat name lookup fails', async () => {
      chats.findOne.mockRejectedValue(new Error('statement timeout'));
      states.query.mockResolvedValueOnce([
        flagRow({ escalated_at: AT, escalation_reason: 'safety' }),
      ]);

      await expect(service.escalate(CO, USER, CHAT, 'safety')).resolves.toEqual(
        { escalated: true, notified: false },
      );
      expect(notifications.create).not.toHaveBeenCalled();
      expect(systemEmail.sendWhatsappSafetyEscalation).not.toHaveBeenCalled();
      expect(states.query).toHaveBeenCalledTimes(1);
    });

    it('also emails the active owner on a safety escalation', async () => {
      states.query.mockResolvedValueOnce([
        flagRow({ escalated_at: AT, escalation_reason: 'safety' }),
      ]);
      states.query.mockResolvedValueOnce([[], 1]);

      await service.escalate(CO, USER, CHAT, 'safety');

      expect(systemEmail.sendWhatsappSafetyEscalation).toHaveBeenCalledWith(
        { email: 'owner@example.com', name: 'Owner' },
        'Sara',
      );
      expect(notifications.create).toHaveBeenCalledTimes(1);
    });

    it('notifies nobody when the owner is no longer active, once', async () => {
      users.findOne.mockResolvedValue(null);
      states.query.mockResolvedValueOnce([
        flagRow({ escalated_at: AT, escalation_reason: 'safety' }),
      ]);
      states.query.mockResolvedValueOnce([[], 1]);

      await expect(service.escalate(CO, USER, CHAT, 'safety')).resolves.toEqual(
        { escalated: true, notified: false },
      );

      expect(users.findOne).toHaveBeenCalledWith({
        where: { id: USER, companyId: CO, isActive: true },
        select: { id: true, email: true, name: true },
      });
      expect(notifications.create).not.toHaveBeenCalled();
      expect(systemEmail.sendWhatsappSafetyEscalation).not.toHaveBeenCalled();
      expect(states.query.mock.calls[1][0]).toContain(NOTIFIED_SQL);
      expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
    });

    it('upgrades an open escalation to safety, keeping its time and notifying again', async () => {
      states.query.mockResolvedValueOnce([
        flagRow({ escalated_at: AT, escalation_reason: 'safety' }),
      ]);
      states.query.mockResolvedValueOnce([[], 1]);

      await expect(service.escalate(CO, USER, CHAT, 'safety')).resolves.toEqual(
        { escalated: true, notified: true },
      );

      const sql = states.query.mock.calls[0][0] as string;
      expect(sql).toContain(
        'COALESCE("whatsapp_chat_ai_states"."escalated_at", EXCLUDED."escalated_at")',
      );
      expect(sql).toContain('"escalation_notified_at" = NULL');
      expect(sql).toContain(
        `CASE EXCLUDED."escalation_reason" WHEN 'safety' THEN 2 WHEN 'payment' THEN 1 ELSE 0 END > CASE "whatsapp_chat_ai_states"."escalation_reason"`,
      );
      expect(sql).toContain(
        `"escalation_holding_sent_at" = CASE WHEN "whatsapp_chat_ai_states"."escalated_at" IS NULL`,
      );
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(systemEmail.sendWhatsappSafetyEscalation).toHaveBeenCalledTimes(1);
    });

    it('keeps the flag when the safety email fails', async () => {
      systemEmail.sendWhatsappSafetyEscalation.mockRejectedValue(
        new Error('smtp down'),
      );
      states.query.mockResolvedValueOnce([
        flagRow({ escalated_at: AT, escalation_reason: 'safety' }),
      ]);
      states.query.mockResolvedValueOnce([[], 1]);

      await expect(service.escalate(CO, USER, CHAT, 'safety')).resolves.toEqual(
        { escalated: true, notified: true },
      );
    });
  });

  describe('clearEscalation', () => {
    it('clears a set flag and emits', async () => {
      states.query.mockResolvedValue([[flagRow()], 1]);

      await expect(service.clearEscalation(CO, USER, CHAT)).resolves.toBe(true);

      expectScopedByKey();
      expect(states.query.mock.calls[0][0]).toContain(
        '"escalated_at" IS NOT NULL',
      );
      expect(states.query.mock.calls[0][0]).toContain(
        '"escalation_notified_at" = NULL',
      );
      expect(gateway.emitChatAiState).toHaveBeenCalledWith(USER, {
        chatId: CHAT,
        aiEscalatedAt: null,
        aiEscalationReason: null,
        aiOptedOutAt: null,
      });
    });

    it('clears only an escalation raised before the given reply time', async () => {
      states.query.mockResolvedValue([[], 0]);
      const repliedAt = new Date('2026-11-23T09:59:00Z');

      await expect(
        service.clearEscalation(CO, USER, CHAT, repliedAt),
      ).resolves.toBe(false);

      const [sql, params] = states.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('"escalated_at" < $4::timestamptz');
      expect(params).toEqual([CO, USER, CHAT, repliedAt]);
      expect(gateway.emitChatAiState).not.toHaveBeenCalled();
    });

    it('clears without a time bound when no reply time is given', async () => {
      states.query.mockResolvedValue([[flagRow()], 1]);

      await service.clearEscalation(CO, USER, CHAT);

      expect(states.query.mock.calls[0][1]).toEqual([CO, USER, CHAT, null]);
    });

    it('returns false and stays quiet when nothing was escalated', async () => {
      states.query.mockResolvedValue([[], 0]);

      await expect(service.clearEscalation(CO, USER, CHAT)).resolves.toBe(
        false,
      );
      expect(gateway.emitChatAiState).not.toHaveBeenCalled();
    });
  });

  describe('optOut', () => {
    it('records a keyword opt-out unconfirmed and emits, without notifying', async () => {
      states.query.mockResolvedValue([flagRow({ opted_out_at: AT })]);

      await expect(service.optOut(CO, USER, CHAT, 'ur-Latn')).resolves.toBe(
        true,
      );

      expectScopedByKey();
      const [sql, params] = states.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('"opted_out_at" IS NULL');
      expect(sql).toContain('"opt_out_confirmed_at" = NULL');
      expect(params).toEqual([CO, USER, CHAT, 'ur-Latn']);
      expect(gateway.emitChatAiState).toHaveBeenCalledWith(USER, {
        chatId: CHAT,
        aiEscalatedAt: null,
        aiEscalationReason: null,
        aiOptedOutAt: AT_SECONDS,
      });
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('is idempotent on an already opted-out chat', async () => {
      states.query.mockResolvedValue([]);

      await expect(service.optOut(CO, USER, CHAT, 'en')).resolves.toBe(false);
      expect(gateway.emitChatAiState).not.toHaveBeenCalled();
    });
  });

  describe('optIn', () => {
    it('clears an opt-out, keeps the stored language and emits', async () => {
      states.query.mockResolvedValue([
        [{ ...flagRow(), opt_out_language: 'ar' }],
        1,
      ]);

      await expect(service.optIn(CO, USER, CHAT)).resolves.toEqual({
        changed: true,
        language: 'ar',
      });

      expectScopedByKey();
      const sql = states.query.mock.calls[0][0] as string;
      expect(sql).toContain('"opted_out_at" IS NOT NULL');
      expect(sql).not.toContain('"opt_out_language" = NULL');
      expect(gateway.emitChatAiState).toHaveBeenCalledTimes(1);
    });

    it('is idempotent when the chat was not opted out', async () => {
      states.query.mockResolvedValue([[], 0]);

      await expect(service.optIn(CO, USER, CHAT)).resolves.toEqual({
        changed: false,
        language: null,
      });
      expect(gateway.emitChatAiState).not.toHaveBeenCalled();
    });
  });

  describe('claimOptOutConfirmation', () => {
    it('returns the language once', async () => {
      states.query.mockResolvedValueOnce([[{ opt_out_language: 'ar' }], 1]);
      states.query.mockResolvedValueOnce([[], 0]);

      await expect(
        service.claimOptOutConfirmation(CO, USER, CHAT),
      ).resolves.toBe('ar');
      await expect(
        service.claimOptOutConfirmation(CO, USER, CHAT),
      ).resolves.toBeNull();

      expectScopedByKey();
      expect(states.query.mock.calls[0][0]).toContain(
        '"opt_out_confirmed_at" IS NULL',
      );
    });

    it('falls back to English when no language was stored', async () => {
      states.query.mockResolvedValue([[{ opt_out_language: null }], 1]);

      await expect(
        service.claimOptOutConfirmation(CO, USER, CHAT),
      ).resolves.toBe('en');
    });
  });

  describe('applyCustomerSignals', () => {
    it('opts out on an exact stop word', async () => {
      states.query.mockResolvedValue([flagRow({ opted_out_at: AT })]);

      await expect(
        service.applyCustomerSignals(CO, USER, CHAT, 'بس کرو'),
      ).resolves.toEqual({ signal: 'opt_out', language: 'ur', changed: true });
      expect(states.query.mock.calls[0][1]).toEqual([CO, USER, CHAT, 'ur']);
    });

    it('opts back in on START in the language stored at opt-out', async () => {
      states.query.mockResolvedValue([
        [{ ...flagRow(), opt_out_language: 'ar' }],
        1,
      ]);

      await expect(
        service.applyCustomerSignals(CO, USER, CHAT, 'START'),
      ).resolves.toEqual({ signal: 'opt_in', language: 'ar', changed: true });
    });

    it('keeps the START language when nothing was stored', async () => {
      states.query.mockResolvedValue([[], 0]);

      await expect(
        service.applyCustomerSignals(CO, USER, CHAT, 'shuru'),
      ).resolves.toMatchObject({ language: 'ur-Latn', changed: false });
    });

    it.each(['stop sending me property messages', 'Is it furnished?'])(
      'touches nothing on %s',
      async (text) => {
        await expect(
          service.applyCustomerSignals(CO, USER, CHAT, text),
        ).resolves.toEqual({ signal: 'none', language: null, changed: false });
        expect(states.query).not.toHaveBeenCalled();
      },
    );
  });

  describe('claimHoldingReply', () => {
    it('claims once per escalation, only after the wait', async () => {
      states.query.mockResolvedValueOnce([[{ id: 'row-1' }], 1]);

      await expect(
        service.claimHoldingReply(CO, USER, CHAT, 7200000),
      ).resolves.toBe(true);

      const [sql, params] = states.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('"escalation_holding_sent_at" IS NULL');
      expect(sql).toContain(
        `"escalated_at" <= now() - ($4::int * interval '1 millisecond')`,
      );
      expect(params).toEqual([CO, USER, CHAT, 7200000]);
    });

    it('returns false when the line was sent or the wait is not over', async () => {
      states.query.mockResolvedValueOnce([[], 0]);

      await expect(
        service.claimHoldingReply(CO, USER, CHAT, 7200000),
      ).resolves.toBe(false);
    });

    it('is reset when a staff reply clears the escalation', async () => {
      states.query.mockResolvedValue([[flagRow()], 1]);

      await service.clearEscalation(CO, USER, CHAT);

      expect(states.query.mock.calls[0][0]).toContain(
        '"escalation_holding_sent_at" = NULL',
      );
    });
  });

  describe('claimEscalationReminder', () => {
    it('notifies a second time once the escalation waited a day since the first notification', async () => {
      states.query.mockResolvedValueOnce([
        [flagRow({ escalated_at: new Date(), escalation_reason: 'safety' })],
        1,
      ]);

      await expect(
        service.claimEscalationReminder(CO, USER, CHAT, 86400000),
      ).resolves.toBe(true);

      const [sql, params] = states.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('SET "escalation_notified_at" = now()');
      expect(sql).toContain(
        `"escalation_notified_at" < "escalated_at" + ($4::int * interval '1 millisecond')`,
      );
      expect(params).toEqual([CO, USER, CHAT, 86400000]);
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create.mock.calls[0][1]).toMatchObject({
        title: 'WhatsApp chat still needs a reply',
        message:
          'Sara: Safety concern. The customer wrote again and is still waiting for a reply.',
      });
      expect(systemEmail.sendWhatsappSafetyEscalation).not.toHaveBeenCalled();
    });

    it('never notifies a third time', async () => {
      states.query.mockResolvedValueOnce([[], 0]);

      await expect(
        service.claimEscalationReminder(CO, USER, CHAT, 86400000),
      ).resolves.toBe(false);
      expect(notifications.create).not.toHaveBeenCalled();
    });
  });

  it('labels a request escalation with what the customer asked for', () => {
    expect(ESCALATION_REASON_LABELS.request).toBe(
      'Asked for a person, a viewing or a booking',
    );
  });
});
