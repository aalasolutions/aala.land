import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiConversationRetentionCron } from './ai-conversation-retention.cron';
import { WhatsappAiConversation } from './entities/whatsapp-ai-conversation.entity';

describe('AiConversationRetentionCron', () => {
  let cron: AiConversationRetentionCron;
  let find: jest.Mock;

  beforeEach(async () => {
    find = jest.fn().mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiConversationRetentionCron,
        {
          provide: getRepositoryToken(WhatsappAiConversation),
          useValue: { find, delete: jest.fn() },
        },
      ],
    }).compile();
    cron = module.get(AiConversationRetentionCron);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('clamps the 13 month cutoff to month end', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-29T03:00:00.000Z'));

    await cron.run();

    const [opts] = find.mock.calls[0];
    expect(opts.where.periodStart.value.toISOString()).toBe(
      '2025-02-28T03:00:00.000Z',
    );
  });
});
