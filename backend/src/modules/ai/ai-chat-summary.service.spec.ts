import { Repository } from 'typeorm';
import { AiChatSummary } from './entities/ai-chat-summary.entity';
import { AiChatSummaryService } from './ai-chat-summary.service';

const KEY = {
  companyId: 'co-1',
  userId: 'user-1',
  channel: 'chat',
  chatId: '971501234567',
};

describe('AiChatSummaryService', () => {
  let repo: {
    findOne: jest.Mock;
    update: jest.Mock;
    manager: { query: jest.Mock };
  };
  let service: AiChatSummaryService;

  beforeEach(() => {
    repo = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      manager: { query: jest.fn().mockResolvedValue([]) },
    };
    service = new AiChatSummaryService(
      repo as unknown as Repository<AiChatSummary>,
    );
  });

  it('reads one row by company, user, channel and chat', async () => {
    const row = { id: 's1', summary: '- 2026-11-20: villa' };
    repo.findOne.mockResolvedValue(row);

    await expect(service.get(KEY)).resolves.toBe(row);
    expect(repo.findOne).toHaveBeenCalledWith({ where: KEY });
  });

  it('returns null when the chat has no summary', async () => {
    await expect(service.get(KEY)).resolves.toBeNull();
  });

  it('upserts the session start of the one row of the chat, on the given manager', async () => {
    const started = new Date('2026-11-28T09:00:00Z');
    const previous = new Date('2026-11-26T10:00:00Z');
    const manager = { query: jest.fn().mockResolvedValue([]) };

    await service.startSession(KEY, started, previous, manager as any);

    expect(repo.manager.query).not.toHaveBeenCalled();
    const [sql, params] = manager.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO "ai_chat_summaries"');
    expect(sql).toContain(
      'ON CONFLICT ("company_id", "user_id", "channel", "chat_id") DO UPDATE',
    );
    expect(sql).not.toContain('"summary"');
    expect(params).toEqual([
      'co-1',
      'user-1',
      'chat',
      '971501234567',
      started,
      previous,
    ]);
  });

  it('marks the session handled and replaces the summary', async () => {
    const through = new Date('2026-11-26T10:00:00Z');

    await service.finishSession(KEY, through, 'villa to rent');

    expect(repo.update).toHaveBeenCalledWith(KEY, {
      summarizedThrough: through,
      summary: 'villa to rent',
    });
  });

  it('marks the session handled and keeps the summary when none came back', async () => {
    const through = new Date('2026-11-26T10:00:00Z');

    await service.finishSession(KEY, through, null);

    expect(repo.update).toHaveBeenCalledWith(KEY, {
      summarizedThrough: through,
    });
  });
});
