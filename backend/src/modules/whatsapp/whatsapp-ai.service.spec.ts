import { WhatsappAiService } from './whatsapp-ai.service';
import { WhatsappSendError } from './whatsapp-cloud-api.service';
import { DIRECT_CONTACT_RESPONSE } from './whatsapp-ai-filter';
import { SubscriptionTier } from '../companies/entities/company.entity';

function sseStream(chunks: object[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines =
    chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') +
    'data: [DONE]\n\n';
  return new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(encoder.encode(lines));
      ctrl.close();
    },
  });
}

function mockTextResponse(content: string) {
  return {
    ok: true,
    body: sseStream([{ choices: [{ delta: { role: 'assistant', content } }] }]),
  };
}

function mockToolCallResponse(id: string, name: string, args = '{}') {
  return {
    ok: true,
    body: sseStream([
      {
        choices: [
          {
            delta: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  index: 0,
                  id,
                  type: 'function',
                  function: { name, arguments: '' },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { arguments: args } }],
            },
          },
        ],
      },
    ]),
  };
}

const makeCompany = (
  tier: SubscriptionTier = SubscriptionTier.FREE,
  purchasedSeats = 1,
) => ({
  id: 'co',
  subscriptionTier: tier,
  purchasedSeats,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
});

const makeMockRepo = (
  customPrompt: string | null = null,
  tier: SubscriptionTier = SubscriptionTier.FREE,
) => ({
  getCompany: jest.fn().mockResolvedValue(makeCompany(tier)),
  getCompanyAndUnits: jest.fn().mockResolvedValue({
    company: makeCompany(tier),
    units: [],
  }),
  getCompanyPrompt: jest.fn().mockResolvedValue(customPrompt),
  persistAiEnabled: jest.fn().mockResolvedValue(undefined),
  loadAiEnabled: jest.fn().mockResolvedValue(null),
  clearContextCache: jest.fn(),
  clearPromptCache: jest.fn(),
  getPeriodAnchor: jest
    .fn()
    .mockResolvedValue(new Date('2026-07-01T00:00:00.000Z')),
  consumeConversationCredit: jest
    .fn()
    .mockResolvedValue({ allowed: true, charged: true, conversationId: 'cv1' }),
  recordTurnDelivered: jest.fn().mockResolvedValue(undefined),
  getCreditUsage: jest.fn().mockResolvedValue({ used: 0, openWindows: 0 }),
  getAgentCreditBreakdown: jest.fn().mockResolvedValue([]),
  claimExhaustedNotification: jest.fn().mockResolvedValue(true),
  searchProperties: jest.fn().mockResolvedValue([]),
});

const makeMockEmail = () => ({
  sendQuotaExceededToCompany: jest.fn().mockResolvedValue(undefined),
});

const makeMockBuilder = (
  fullPrompt = 'default system prompt for AALA.LAND',
) => ({
  buildContextBlock: jest
    .fn()
    .mockReturnValue({ block: '', fallbackCurrency: '' }),
  buildFullPrompt: jest.fn().mockReturnValue(fullPrompt),
  formatToolResult: jest.fn().mockReturnValue('Formatted listings'),
});

const makeMockStore = (history: any[] = []) => ({
  getChatHistory: jest.fn().mockResolvedValue(history),
  addMessage: jest.fn().mockResolvedValue(undefined),
});

const baseEvt = (
  overrides: Partial<{
    id: string;
    chatId: string;
    body: string;
    fromMe: boolean;
    isGroup: boolean;
    timestamp: number;
  }> = {},
) => ({
  id: 'wa-msg-1',
  chatId: 'c1',
  body: 'hello',
  fromMe: false,
  isGroup: false,
  timestamp: Math.floor(Date.now() / 1000),
  senderId: 's1',
  ...overrides,
});

function makeMockRedis() {
  const store = new Map<string, string>();
  const locks = new Map<string, string>();
  const lists = new Map<string, string[]>();
  const sets = new Map<string, Set<string>>();
  const toRegExp = (pattern: string) =>
    new RegExp(
      '^' +
        pattern
          .split('*')
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*') +
        '$',
    );
  return {
    store,
    locks,
    getJson: (key: string) =>
      Promise.resolve(store.has(key) ? JSON.parse(store.get(key)!) : null),
    setJson: (key: string, value: unknown) => {
      store.set(key, JSON.stringify(value));
      return Promise.resolve();
    },
    getNumber: (key: string) =>
      Promise.resolve(store.has(key) ? Number(store.get(key)) : null),
    setNumber: (key: string, value: number) => {
      store.set(key, String(value));
      return Promise.resolve();
    },
    del: (...keys: string[]) => {
      keys.forEach((key) => {
        store.delete(key);
        lists.delete(key);
      });
      return Promise.resolve();
    },
    pushList: (key: string, value: string) => {
      const list = lists.get(key) ?? [];
      list.push(value);
      lists.set(key, list);
      return Promise.resolve();
    },
    getList: (key: string) => Promise.resolve(lists.get(key) ?? []),
    listLength: (key: string) => Promise.resolve((lists.get(key) ?? []).length),
    renameKey: (from: string, to: string) => {
      if (!lists.has(from)) return Promise.resolve(false);
      lists.set(to, lists.get(from)!);
      lists.delete(from);
      return Promise.resolve(true);
    },
    incrCounter: (key: string) => {
      const next = (store.has(key) ? Number(store.get(key)) : 0) + 1;
      store.set(key, String(next));
      return Promise.resolve(next);
    },
    setAdd: (key: string, member: string) => {
      const set = sets.get(key) ?? new Set<string>();
      set.add(member);
      sets.set(key, set);
      return Promise.resolve();
    },
    setRemove: (key: string, member: string) => {
      sets.get(key)?.delete(member);
      return Promise.resolve();
    },
    setMembers: (key: string) =>
      Promise.resolve([...(sets.get(key) ?? new Set<string>())]),
    delByPattern: (pattern: string) => {
      const re = toRegExp(pattern);
      let deleted = 0;
      for (const key of [...store.keys()]) {
        if (re.test(key)) {
          store.delete(key);
          deleted++;
        }
      }
      for (const key of [...lists.keys()]) {
        if (re.test(key)) {
          lists.delete(key);
          deleted++;
        }
      }
      return Promise.resolve(deleted);
    },
    tryLock: (key: string, token: string) => {
      if (locks.has(key)) return Promise.resolve(false);
      locks.set(key, token);
      return Promise.resolve(true);
    },
    renewLock: () => Promise.resolve(true),
    releaseLock: (key: string, token: string) => {
      if (locks.get(key) === token) locks.delete(key);
      return Promise.resolve();
    },
  };
}

// Stands in for the BullMQ delayed job: one job per chat keyed by `userId:chatId`,
// re-armed by changeDelay, fired on the jest fake timer. `run` mirrors what
// WhatsappAiDebounceProcessor does in production.
function makeMockQueue(
  getService: () => WhatsappAiService,
  getSend: () => any,
  getMarkRead: () => any,
) {
  const jobs = new Map<string, any>();
  const arm = (id: string, delay: number) =>
    setTimeout(() => {
      void run(id);
    }, delay);
  const run = async (id: string) => {
    const job = jobs.get(id);
    if (!job) return;
    job.state = 'active';
    const service = getService();
    const buffered = await service.takeDebouncedBuffer(job.data);
    if (!buffered) {
      jobs.delete(id);
      return;
    }
    try {
      await service.runTurn(
        job.data.companyId,
        job.data.userId,
        job.data.chatId,
        buffered.messageIds,
        buffered.combinedText,
        getSend(),
        getMarkRead(),
      );
    } catch {
      // Mirrors the processor: a failed turn keeps its job record and gives the buffer back.
      job.state = 'failed';
      await service.restoreClaimedBuffer(job.data);
      return;
    }
    await service.releaseClaimedBuffer(job.data);
    jobs.delete(id); // removeOnComplete
  };
  return {
    jobs,
    // BullMQ's addDelayedJob returns the EXISTING job when the id is already present in
    // any state, so a stale-id add is a silent no-op. Modelled here on purpose.
    add: (_name: string, data: any, opts: { jobId: string; delay: number }) => {
      const dup = jobs.get(opts.jobId);
      if (dup) return Promise.resolve(dup);
      const job: any = { id: opts.jobId, data, state: 'delayed' };
      job.timer = arm(opts.jobId, opts.delay);
      job.remove = () => {
        clearTimeout(job.timer);
        jobs.delete(opts.jobId);
        return Promise.resolve();
      };
      const reschedule = (ms: number) => {
        if (job.state !== 'delayed') {
          return Promise.reject(new Error('Job is not in the delayed state'));
        }
        clearTimeout(job.timer);
        job.timer = arm(opts.jobId, ms);
        return Promise.resolve();
      };
      job.changeDelay = reschedule;
      job.promote = () => reschedule(0);
      jobs.set(opts.jobId, job);
      return Promise.resolve(job);
    },
    getJob: (id: string) => Promise.resolve(jobs.get(id)),
  };
}

describe('WhatsappAiService', () => {
  let service: WhatsappAiService;
  let currentSend: any;
  let currentMarkRead: any;
  const queue = makeMockQueue(
    () => service,
    () => currentSend,
    () => currentMarkRead,
  );
  // Every test that used to pass `send` into handleIncomingMessage now registers it
  // here instead: in production the processor resolves the sender, not the caller.
  // The typing rider is resolved the same way, so it registers here too.
  const incoming = (
    evt: any,
    companyId: string,
    userId: string,
    send?: any,
    markRead?: any,
  ) => {
    if (send) currentSend = send;
    if (markRead) currentMarkRead = markRead;
    return service.handleIncomingMessage(evt, companyId, userId);
  };
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    queue.jobs.clear();
    currentSend = undefined;
    currentMarkRead = undefined;
    delete process.env.OLLAMA_API_KEY;
    delete process.env.AI_ENABLED;
    delete process.env.AI_DEBOUNCE_MS;
    delete process.env.AI_HUMAN_SILENCE_MINUTES;
    delete process.env.AI_LOCK_WAIT_MS;
    service = new WhatsappAiService(
      makeMockRepo() as any,
      makeMockStore() as any,
      makeMockBuilder() as any,
      makeMockEmail() as any,

      makeMockRedis() as any,
      queue as any,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    delete process.env.OLLAMA_API_KEY;
    delete process.env.OLLAMA_HOST;
    delete process.env.OLLAMA_MODEL;
    delete process.env.AI_DEBOUNCE_MS;
    delete process.env.AI_HUMAN_SILENCE_MINUTES;
  });

  it('is enabled by default', () => {
    expect(service.isEnabled('company-1')).toBe(true);
  });

  it('setEnabled toggles state per company', () => {
    service.setEnabled('company-1', false);
    expect(service.isEnabled('company-1')).toBe(false);
    service.setEnabled('company-1', true);
    expect(service.isEnabled('company-1')).toBe(true);
  });

  it('setEnabled on one company does not affect another company', () => {
    service.setEnabled('company-1', false);
    expect(service.isEnabled('company-2')).toBe(true);
  });

  it('getConfig returns keyConfigured false when no API key', () => {
    expect(service.getConfig('company-1').keyConfigured).toBe(false);
  });

  it('getHistoryFor returns empty array for unknown userId+chatId', async () => {
    expect(await service.getHistoryFor('unknown-user', 'unknown-chat')).toEqual(
      [],
    );
  });

  it('handleIncomingMessage skips when no API key', async () => {
    const mockSend = jest.fn();
    await incoming(
      baseEvt(),
      'company-1',
      'user-1',
      mockSend,
    );
    await jest.runAllTimersAsync();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('handleIncomingMessage skips fromMe messages', async () => {
    process.env.OLLAMA_API_KEY = 'test-key';
    service = new WhatsappAiService(
      makeMockRepo() as any,
      makeMockStore() as any,
      makeMockBuilder() as any,
      makeMockEmail() as any,

      makeMockRedis() as any,
      queue as any,
    );
    const mockSend = jest.fn();
    await incoming(
      baseEvt({ fromMe: true }),
      'company-1',
      'user-1',
      mockSend,
    );
    await jest.runAllTimersAsync();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('handleIncomingMessage skips group messages', async () => {
    process.env.OLLAMA_API_KEY = 'test-key';
    service = new WhatsappAiService(
      makeMockRepo() as any,
      makeMockStore() as any,
      makeMockBuilder() as any,
      makeMockEmail() as any,

      makeMockRedis() as any,
      queue as any,
    );
    const mockSend = jest.fn();
    await incoming(
      baseEvt({ chatId: 'c1@g.us', isGroup: true }),
      'company-1',
      'user-1',
      mockSend,
    );
    await jest.runAllTimersAsync();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends canned response when message contains only dangerous words', async () => {
    process.env.OLLAMA_API_KEY = 'test-key';
    process.env.AI_DEBOUNCE_MS = '100';
    service = new WhatsappAiService(
      makeMockRepo() as any,
      makeMockStore() as any,
      makeMockBuilder() as any,
      makeMockEmail() as any,

      makeMockRedis() as any,
      queue as any,
    );
    const mockSend = jest.fn().mockResolvedValue({});
    await incoming(
      baseEvt({ body: 'DROP DELETE REMOVE' }),
      'company-1',
      'user-1',
      mockSend,
    );
    await jest.runAllTimersAsync();
    expect(mockSend).toHaveBeenCalledWith('c1', DIRECT_CONTACT_RESPONSE);
  });

  describe('debouncing', () => {
    beforeEach(() => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.OLLAMA_MODEL = 'test-model';
      process.env.AI_DEBOUNCE_MS = '5000';
    });

    it('queues messages and flushes combined text after debounce window', async () => {
      const mockRepo = makeMockRepo(null);
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );

      global.fetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(mockTextResponse('AI reply')),
        ) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      await incoming(
        baseEvt({ body: 'Hello', timestamp: ts }),
        'co',
        'u1',
        mockSend,
      );
      await incoming(
        baseEvt({ body: 'I need help', timestamp: ts }),
        'co',
        'u1',
        mockSend,
      );

      // No send yet — timer still pending
      expect(mockSend).not.toHaveBeenCalled();

      await jest.runAllTimersAsync();

      expect(mockSend).toHaveBeenCalledTimes(1);

      // Combined text sent to LLM as one user message
      const body = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[0][1].body,
      );
      const userMsg = body.messages.find((m: any) => m.role === 'user');
      // sanitizeInput normalises whitespace so \n becomes a space
      expect(userMsg.content).toBe('Hello I need help');
    });

    it('resets debounce timer when a new message arrives', async () => {
      service = new WhatsappAiService(
        makeMockRepo() as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );

      global.fetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(mockTextResponse('reply')),
        ) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      await incoming(
        baseEvt({ body: 'msg1', timestamp: ts }),
        'co',
        'u1',
        mockSend,
      );
      // Advance only 3 seconds — timer should still be running
      jest.advanceTimersByTime(3000);
      await incoming(
        baseEvt({ body: 'msg2', timestamp: ts }),
        'co',
        'u1',
        mockSend,
      );
      // Advance another 3 seconds — only 3s into the new timer, should NOT have fired
      jest.advanceTimersByTime(3000);
      expect(mockSend).not.toHaveBeenCalled();

      // Advance remaining 2 seconds to complete the 5s debounce window
      await jest.advanceTimersByTimeAsync(2000);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('separate chats debounce independently', async () => {
      service = new WhatsappAiService(
        makeMockRepo() as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );

      global.fetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(mockTextResponse('reply')),
        ) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      await incoming(
        baseEvt({ chatId: 'chat-a', body: 'Hi', timestamp: ts }),
        'co',
        'u1',
        mockSend,
      );
      await incoming(
        baseEvt({ chatId: 'chat-b', body: 'Hey', timestamp: ts }),
        'co',
        'u1',
        mockSend,
      );

      await jest.runAllTimersAsync();

      // Each chat should have triggered one LLM call → one send each
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('queued debounce lifecycle', () => {
    it('takeDebouncedBuffer returns null when nothing is buffered', async () => {
      expect(
        await service.takeDebouncedBuffer({ userId: 'user-1', chatId: 'c1' }),
      ).toBeNull();
    });

    it('takeDebouncedBuffer claims once, so a second claim finds nothing', async () => {
      process.env.OLLAMA_API_KEY = 'test-key';
      await incoming(baseEvt({ id: 'm1', body: 'one' }), 'company-1', 'user-1', jest.fn());
      await incoming(baseEvt({ id: 'm2', body: 'two' }), 'company-1', 'user-1', jest.fn());

      const first = await service.takeDebouncedBuffer({
        userId: 'user-1',
        chatId: 'c1',
      });
      expect(first).toEqual({ combinedText: 'one\ntwo', messageIds: ['m1', 'm2'] });
      expect(
        await service.takeDebouncedBuffer({ userId: 'user-1', chatId: 'c1' }),
      ).toBeNull();
    });

    it('clearUserState removes every queued turn for that user', async () => {
      process.env.OLLAMA_API_KEY = 'test-key';
      await incoming(baseEvt({ chatId: 'c1' }), 'company-1', 'user-1', jest.fn());
      await incoming(baseEvt({ chatId: 'c2' }), 'company-1', 'user-1', jest.fn());
      expect(queue.jobs.size).toBe(2);

      await service.clearUserState('user-1', 'company-1');

      expect(queue.jobs.size).toBe(0);
      expect(
        await service.takeDebouncedBuffer({ userId: 'user-1', chatId: 'c1' }),
      ).toBeNull();
    });

    it('clearUserState keeps the turn sequence so a reconnect cannot reuse a job id', async () => {
      process.env.OLLAMA_API_KEY = 'test-key';
      const redis = makeMockRedis();
      service = new WhatsappAiService(
        makeMockRepo() as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,
        redis as any,
        queue as any,
      );

      await incoming(baseEvt({ id: 'm1' }), 'company-1', 'user-1', jest.fn());
      await service.takeDebouncedBuffer({ userId: 'user-1', chatId: 'c1' });

      await service.clearUserState('user-1', 'company-1');

      // The claim advanced the sequence and the disconnect must not undo it: the
      // failed job record for :0 lives on in BullMQ for 7 days.
      expect(await redis.getNumber('wa:ai:seq:user-1:c1')).toBe(1);
      expect(queue.jobs.has('user-1:c1:0')).toBe(true);

      await incoming(baseEvt({ id: 'm2' }), 'company-1', 'user-1', jest.fn());

      expect(queue.jobs.has('user-1:c1:1')).toBe(true);
    });

    it('a message arriving after the flush starts a fresh turn instead of vanishing', async () => {
      process.env.OLLAMA_API_KEY = 'test-key';
      await incoming(baseEvt({ id: 'm1', body: 'first' }), 'company-1', 'user-1', jest.fn());
      await service.takeDebouncedBuffer({ userId: 'user-1', chatId: 'c1' });

      await incoming(baseEvt({ id: 'm2', body: 'second' }), 'company-1', 'user-1', jest.fn());

      expect(
        await service.takeDebouncedBuffer({ userId: 'user-1', chatId: 'c1' }),
      ).toEqual({ combinedText: 'second', messageIds: ['m2'] });
    });

    it('never reuses the id of a job that already fired, even mid-claim', async () => {
      process.env.OLLAMA_API_KEY = 'test-key';
      await incoming(baseEvt({ id: 'm1', body: 'first' }), 'company-1', 'user-1', jest.fn());
      const firedJob = [...queue.jobs.values()][0];

      // The job has fired and is running, but has NOT yet advanced the sequence: the
      // exact window where a re-read of `wa:ai:seq` still returns the running job's id.
      firedJob.state = 'active';
      await incoming(baseEvt({ id: 'm2', body: 'second' }), 'company-1', 'user-1', jest.fn());

      const scheduled = [...queue.jobs.values()].filter(
        (job: any) => job.state === 'delayed',
      );
      expect(scheduled).toHaveLength(1);
      expect(scheduled[0].id).not.toBe(firedJob.id);
    });

    it('schedules a NEW job for a message that lands while a turn is in flight', async () => {
      process.env.OLLAMA_API_KEY = 'test-key';
      await incoming(baseEvt({ id: 'm1', body: 'first' }), 'company-1', 'user-1', jest.fn());
      const firstJobId = [...queue.jobs.keys()][0];

      // The processor claims the buffer; the job for that turn is now in flight.
      await service.takeDebouncedBuffer({ userId: 'user-1', chatId: 'c1' });
      await incoming(baseEvt({ id: 'm2', body: 'second' }), 'company-1', 'user-1', jest.fn());

      const jobIds = [...queue.jobs.keys()];
      expect(jobIds).toHaveLength(2);
      expect(jobIds).toContain(firstJobId);
      expect(jobIds.filter((id) => id !== firstJobId)).toHaveLength(1);
    });
  });

  describe('human silence (owner replied)', () => {
    beforeEach(() => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.OLLAMA_MODEL = 'test-model';
      process.env.AI_DEBOUNCE_MS = '100';
      process.env.AI_HUMAN_SILENCE_MINUTES = '20';
    });

    it('does not respond when human replied recently', async () => {
      service = new WhatsappAiService(
        makeMockRepo() as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      global.fetch = jest.fn() as any;

      const mockSend = jest.fn().mockResolvedValue({});

      await service.recordHumanReply('u1', 'c1');
      await incoming(baseEvt(), 'co', 'u1', mockSend);
      await jest.runAllTimersAsync();

      expect(mockSend).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('responds again after silence window expires', async () => {
      service = new WhatsappAiService(
        makeMockRepo() as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      global.fetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(mockTextResponse('reply')),
        ) as any;

      const mockSend = jest.fn().mockResolvedValue({});

      await service.recordHumanReply('u1', 'c1');

      // Advance past the 20-minute silence window
      jest.advanceTimersByTime(20 * 60 * 1000 + 1);

      await incoming(baseEvt(), 'co', 'u1', mockSend);
      await jest.runAllTimersAsync();

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('cancels pending debounced response when human replies', async () => {
      service = new WhatsappAiService(
        makeMockRepo() as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      global.fetch = jest.fn() as any;

      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      // Customer sends a message (queued, debounce timer running)
      await incoming(
        baseEvt({ body: 'Hello?', timestamp: ts }),
        'co',
        'u1',
        mockSend,
      );

      // Human manually replies BEFORE debounce timer fires
      await service.recordHumanReply('u1', 'c1');

      // Timers fire — but pending was cancelled by recordHumanReply
      await jest.runAllTimersAsync();

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('aborts the send when the human replies mid-stream (after the turn started)', async () => {
      const mockRepo = makeMockRepo();
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );

      // The human replies WHILE the LLM is streaming: the fetch mock records the human
      // reply before resolving the LLM response, mimicking a phone reply mid-turn.
      global.fetch = jest.fn().mockImplementation(async () => {
        await service.recordHumanReply('u1', 'c1');
        return mockTextResponse('AI reply');
      }) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      await incoming(
        baseEvt({ body: 'Hello?', timestamp: ts }),
        'co',
        'u1',
        mockSend,
      );
      await jest.runAllTimersAsync();

      // LLM was called (turn started before the human reply), but the send was aborted.
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(mockSend).not.toHaveBeenCalled();
      // No refund by design: the credit bought the 24h window, which is still open.
      // Nothing is counted as delivered, because nothing reached the lead.
      expect(mockRepo.recordTurnDelivered).not.toHaveBeenCalled();
      // The aborted assistant reply is not retained in history.
      expect(await service.getHistoryFor('u1', 'c1')).toEqual([]);
    });

    it('aborts the send when the human replies mid-tool-flow', async () => {
      const mockRepo = makeMockRepo();
      mockRepo.searchProperties.mockResolvedValue([
        { id: 'l1', title: 'Test' },
      ]);
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );

      // First call returns a tool call; the human replies during the SECOND LLM call.
      (global.fetch as jest.Mock) = jest
        .fn()
        .mockResolvedValueOnce(
          mockToolCallResponse(
            'call_1',
            'search_properties',
            '{"city":"Karachi"}',
          ),
        )
        .mockImplementationOnce(async () => {
          await service.recordHumanReply('u1', 'c1');
          return mockTextResponse('Here are properties.');
        });

      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      await incoming(
        baseEvt({ body: 'properties in karachi', timestamp: ts }),
        'co',
        'u1',
        mockSend,
      );
      await jest.runAllTimersAsync();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('human silence is per-chat — other chats still respond', async () => {
      service = new WhatsappAiService(
        makeMockRepo() as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      global.fetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(mockTextResponse('reply')),
        ) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      // Human replied in chat-a
      await service.recordHumanReply('u1', 'chat-a');

      // Customer messages in chat-a (silenced) and chat-b (not silenced)
      await incoming(
        baseEvt({ chatId: 'chat-a', timestamp: ts }),
        'co',
        'u1',
        mockSend,
      );
      await incoming(
        baseEvt({ chatId: 'chat-b', timestamp: ts }),
        'co',
        'u1',
        mockSend,
      );

      await jest.runAllTimersAsync();

      // Only chat-b should have gotten a response
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith('chat-b', expect.any(String), {
        creditCharged: true,
      });
    });
  });

  describe('handleIncomingMessage with LLM', () => {
    beforeEach(() => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.OLLAMA_MODEL = 'test-model';
      process.env.AI_DEBOUNCE_MS = '100';
    });

    it('calls repo.getCompanyPrompt and passes result to builder', async () => {
      const mockRepo = makeMockRepo('DB prompt');
      const mockBuilder = makeMockBuilder('DB prompt');
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        mockBuilder as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );

      global.fetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(mockTextResponse('reply')),
        ) as any;

      await incoming(
        baseEvt(),
        'company-1',
        'user-1',
        jest.fn().mockResolvedValue({}),
      );
      await jest.runAllTimersAsync();

      expect(mockRepo.getCompanyPrompt).toHaveBeenCalledWith('company-1');
      expect(mockBuilder.buildFullPrompt).toHaveBeenCalledWith('DB prompt', '');
    });

    it('passes null customPrompt to builder when no settings row', async () => {
      const mockRepo = makeMockRepo(null);
      const mockBuilder = makeMockBuilder(
        'default system prompt for AALA.LAND',
      );
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        mockBuilder as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );

      global.fetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(mockTextResponse('reply')),
        ) as any;

      await incoming(
        baseEvt(),
        'company-1',
        'user-1',
        jest.fn().mockResolvedValue({}),
      );
      await jest.runAllTimersAsync();

      expect(mockBuilder.buildFullPrompt).toHaveBeenCalledWith(null, '');

      const body = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[0][1].body,
      );
      expect(body.messages[0].content).toBe(
        'default system prompt for AALA.LAND',
      );
    });

    it('histories are scoped per user', async () => {
      const mockRepo = makeMockRepo('prompt');
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );

      global.fetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(mockTextResponse('AI reply')),
        ) as any;

      const mockSend = jest.fn().mockResolvedValue({ messageId: 'msg-1' });
      await incoming(
        baseEvt(),
        'company-1',
        'user-1',
        mockSend,
      );
      await incoming(
        baseEvt(),
        'company-1',
        'user-2',
        mockSend,
      );
      await jest.runAllTimersAsync();

      expect(await service.getHistoryFor('user-1', 'c1')).toHaveLength(2);
      expect(await service.getHistoryFor('user-2', 'c1')).toHaveLength(2);
      expect(await service.getHistoryFor('user-1', 'c1')).not.toBe(
        await service.getHistoryFor('user-2', 'c1'),
      );
    });
  });

  describe('credit usage reads', () => {
    it('returns the usage summary and reads the company WITHOUT the 40-unit join', async () => {
      const mockRepo = makeMockRepo(null, SubscriptionTier.PRO);
      mockRepo.getCompany.mockResolvedValue(
        makeCompany(SubscriptionTier.PRO, 2),
      );
      mockRepo.getCreditUsage.mockResolvedValue({ used: 7, openWindows: 2 });
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );

      const usage = await service.getCreditUsage('co');

      expect(usage).toEqual({
        used: 7,
        limit: 400,
        openWindows: 2,
        resetsAt: expect.any(String),
      });
      expect(mockRepo.getCompany).toHaveBeenCalledWith('co');
      expect(mockRepo.getCompanyAndUnits).not.toHaveBeenCalled();
    });

    it('returns null when the company row is gone', async () => {
      const mockRepo = makeMockRepo();
      mockRepo.getCompany.mockResolvedValue(null);
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      await expect(service.getCreditUsage('co')).resolves.toBeNull();
      await expect(service.getCreditUsageWithAgents('co')).resolves.toBeNull();
    });

    it('includes the per-agent breakdown for the same period it reports usage for', async () => {
      const mockRepo = makeMockRepo();
      mockRepo.getCreditUsage.mockResolvedValue({ used: 3, openWindows: 1 });
      mockRepo.getAgentCreditBreakdown.mockResolvedValue([
        { userId: 'u1', name: 'Agent One', credits: 3, aiTurns: 9, leads: 2 },
      ]);
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );

      const result = await service.getCreditUsageWithAgents('co');

      expect(result!.agents).toHaveLength(1);
      expect(result!.used).toBe(3);
      expect(result!.limit).toBe(50);
      // Usage and breakdown must be read for the SAME period start.
      expect(mockRepo.getCreditUsage.mock.calls[0][1]).toEqual(
        mockRepo.getAgentCreditBreakdown.mock.calls[0][1],
      );
    });
  });

  describe('AI credits', () => {
    beforeEach(() => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.OLLAMA_MODEL = 'test-model';
      process.env.AI_DEBOUNCE_MS = '100';
    });

    it('refuses the turn when the company row is missing, rather than serving unmetered', async () => {
      const mockRepo = makeMockRepo();
      mockRepo.getCompanyAndUnits.mockResolvedValue({
        company: null,
        units: [],
      });
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      global.fetch = jest.fn() as any;

      const mockSend = jest.fn().mockResolvedValue({});
      await incoming(
        baseEvt(),
        'company-1',
        'user-1',
        mockSend,
      );
      await jest.runAllTimersAsync();

      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
      expect(mockRepo.consumeConversationCredit).not.toHaveBeenCalled();
      expect(await service.getHistoryFor('user-1', 'c1')).toEqual([]);
    });

    it('stays REFUSED on a DB error once the company is known exhausted this period', async () => {
      const mockRepo = makeMockRepo();
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      global.fetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(mockTextResponse('reply')),
        ) as any;
      const mockSend = jest.fn().mockResolvedValue({});

      // Turn 1 learns the company is out of credits.
      mockRepo.consumeConversationCredit.mockResolvedValue({
        allowed: false,
        charged: false,
        conversationId: null,
      });
      await incoming(
        baseEvt(),
        'company-1',
        'user-1',
        mockSend,
      );
      await jest.runAllTimersAsync();

      // Turn 2 hits a degraded DB. Fail-open must NOT hand out a free turn.
      mockRepo.consumeConversationCredit.mockRejectedValue(
        new Error('connection terminated'),
      );
      await incoming(
        baseEvt({ body: 'again' }),
        'company-1',
        'user-1',
        mockSend,
      );
      await jest.runAllTimersAsync();

      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('fails CLOSED on a DB error, refusing the turn rather than serving it unmetered', async () => {
      const mockRepo = makeMockRepo();
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      global.fetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(mockTextResponse('reply')),
        ) as any;
      const mockSend = jest.fn().mockResolvedValue({});

      mockRepo.consumeConversationCredit.mockRejectedValue(
        new Error('connection terminated'),
      );
      await incoming(
        baseEvt(),
        'company-1',
        'user-1',
        mockSend,
      );
      await jest.runAllTimersAsync();

      expect(mockSend).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('stays REFUSED when period resolution itself throws for a known-exhausted company', async () => {
      const mockRepo = makeMockRepo();
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      global.fetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(mockTextResponse('reply')),
        ) as any;
      const mockSend = jest.fn().mockResolvedValue({});

      mockRepo.consumeConversationCredit.mockResolvedValue({
        allowed: false,
        charged: false,
        conversationId: null,
      });
      await incoming(
        baseEvt(),
        'company-1',
        'user-1',
        mockSend,
      );
      await jest.runAllTimersAsync();

      // Now the ANCHOR read fails, so the period is never resolved at all.
      mockRepo.getPeriodAnchor.mockRejectedValue(
        new Error('billing read down'),
      );
      await incoming(
        baseEvt({ body: 'again' }),
        'company-1',
        'user-1',
        mockSend,
      );
      await jest.runAllTimersAsync();

      expect(mockSend).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('does not send when the allowance is spent (allowed: false)', async () => {
      const mockRepo = makeMockRepo(null, SubscriptionTier.FREE);
      mockRepo.consumeConversationCredit.mockResolvedValue({
        allowed: false,
        charged: false,
        conversationId: null,
      });
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      global.fetch = jest.fn() as any;

      const mockSend = jest.fn().mockResolvedValue({});
      await incoming(
        baseEvt(),
        'company-1',
        'user-1',
        mockSend,
      );
      await jest.runAllTimersAsync();

      expect(mockSend).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('emails the company once per period when the allowance runs out', async () => {
      const mockRepo = makeMockRepo(null, SubscriptionTier.FREE);
      const mockEmail = makeMockEmail();
      mockRepo.consumeConversationCredit.mockResolvedValue({
        allowed: false,
        charged: false,
        conversationId: null,
      });
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        mockEmail as any,

        makeMockRedis() as any,
        queue as any,
      );
      global.fetch = jest.fn() as any;

      await incoming(
        baseEvt(),
        'company-1',
        'user-1',
        jest.fn().mockResolvedValue({}),
      );
      await jest.runAllTimersAsync();

      expect(mockRepo.claimExhaustedNotification).toHaveBeenCalledWith(
        'company-1',
        expect.any(Date),
      );
      expect(mockEmail.sendQuotaExceededToCompany).toHaveBeenCalledWith(
        'company-1',
        'AI credits',
        expect.any(String),
      );
    });

    it('does not email again when another turn already claimed this period', async () => {
      const mockRepo = makeMockRepo(null, SubscriptionTier.FREE);
      const mockEmail = makeMockEmail();
      mockRepo.consumeConversationCredit.mockResolvedValue({
        allowed: false,
        charged: false,
        conversationId: null,
      });
      mockRepo.claimExhaustedNotification.mockResolvedValue(false);
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        mockEmail as any,

        makeMockRedis() as any,
        queue as any,
      );
      global.fetch = jest.fn() as any;

      await incoming(
        baseEvt(),
        'company-1',
        'user-1',
        jest.fn().mockResolvedValue({}),
      );
      await jest.runAllTimersAsync();

      expect(mockEmail.sendQuotaExceededToCompany).not.toHaveBeenCalled();
    });

    it('meters FREE against a 50-credit allowance', async () => {
      const mockRepo = makeMockRepo(null, SubscriptionTier.FREE);
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      global.fetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(mockTextResponse('reply')),
        ) as any;

      await incoming(
        baseEvt(),
        'company-1',
        'user-1',
        jest.fn().mockResolvedValue({}),
      );
      await jest.runAllTimersAsync();

      expect(mockRepo.consumeConversationCredit).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        'c1',
        50,
        expect.objectContaining({ start: expect.any(Date) }),
      );
    });

    // Unlike the old weekly limiter, paid tiers are metered too: they get a bigger
    // per-seat allowance, not an exemption.
    it('meters ENTERPRISE against 500 per seat', async () => {
      const mockRepo = makeMockRepo(null, SubscriptionTier.ENTERPRISE);
      mockRepo.getCompanyAndUnits.mockResolvedValue({
        company: {
          id: 'co',
          subscriptionTier: SubscriptionTier.ENTERPRISE,
          purchasedSeats: 3,
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        units: [],
      });
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      global.fetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(mockTextResponse('reply')),
        ) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      await incoming(
        baseEvt(),
        'company-1',
        'user-1',
        mockSend,
      );
      await jest.runAllTimersAsync();

      expect(mockRepo.consumeConversationCredit).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        'c1',
        1500,
        expect.anything(),
      );
    });

    it('meters PRO against 200 per seat and still replies', async () => {
      const mockRepo = makeMockRepo(null, SubscriptionTier.PRO);
      mockRepo.getCompanyAndUnits.mockResolvedValue({
        company: {
          id: 'co',
          subscriptionTier: SubscriptionTier.PRO,
          purchasedSeats: 2,
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        units: [],
      });
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      global.fetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(mockTextResponse('reply')),
        ) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      await incoming(
        baseEvt(),
        'company-1',
        'user-1',
        mockSend,
      );
      await jest.runAllTimersAsync();

      expect(mockRepo.consumeConversationCredit).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        'c1',
        400,
        expect.anything(),
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('counts nothing delivered when the turn dies before a reply', async () => {
      const mockRepo = makeMockRepo(null, SubscriptionTier.FREE);
      mockRepo.consumeConversationCredit.mockResolvedValue({
        allowed: true,
        charged: false,
        conversationId: 'open-1',
      });
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      global.fetch = jest.fn().mockResolvedValue({ ok: false }) as any;

      await incoming(
        baseEvt(),
        'company-1',
        'user-1',
        jest.fn().mockResolvedValue({}),
      );
      await jest.runAllTimersAsync();

      expect(mockRepo.recordTurnDelivered).not.toHaveBeenCalled();
    });

    it('refuses the message when the credit check throws (fail-closed)', async () => {
      const mockRepo = makeMockRepo(null, SubscriptionTier.FREE);
      mockRepo.consumeConversationCredit.mockRejectedValue(
        new Error('DB error'),
      );
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      global.fetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(mockTextResponse('reply')),
        ) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      await incoming(
        baseEvt(),
        'company-1',
        'user-1',
        mockSend,
      );
      await jest.runAllTimersAsync();

      expect(mockSend).not.toHaveBeenCalled();
      expect(await service.getHistoryFor('user-1', 'c1')).toEqual([]);
    });
  });

  describe('tool calling', () => {
    beforeEach(() => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.OLLAMA_MODEL = 'test-model';
      process.env.AI_DEBOUNCE_MS = '100';
    });

    it('sends direct reply when LLM returns no tool_calls', async () => {
      service = new WhatsappAiService(
        makeMockRepo() as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      global.fetch = jest
        .fn()
        .mockResolvedValue(mockTextResponse('Hello!')) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      await incoming(
        baseEvt({ body: 'hi' }),
        'comp1',
        'user1',
        mockSend,
      );
      await jest.runAllTimersAsync();

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith('c1', 'Hello!', {
        creditCharged: true,
      });
    });

    it('passes TOOL_DEFINITIONS and stream:true in first LLM call body', async () => {
      service = new WhatsappAiService(
        makeMockRepo() as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      global.fetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(mockTextResponse('reply')),
        ) as any;

      await incoming(
        baseEvt({ body: 'hi' }),
        'comp1',
        'user1',
        jest.fn().mockResolvedValue({}),
      );
      await jest.runAllTimersAsync();

      const body = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[0][1].body,
      );
      expect(body.tools).toBeDefined();
      expect(Array.isArray(body.tools)).toBe(true);
      expect(body.tools.length).toBeGreaterThan(0);
      expect(body.stream).toBe(true);
    });

    it('executes search_properties and makes second LLM call', async () => {
      const mockRepo = makeMockRepo();
      mockRepo.searchProperties.mockResolvedValue([
        { id: 'l1', title: 'Test' },
      ]);
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );

      (global.fetch as jest.Mock) = jest
        .fn()
        .mockResolvedValueOnce(
          mockToolCallResponse(
            'call_1',
            'search_properties',
            '{"city":"Karachi"}',
          ),
        )
        .mockResolvedValueOnce(
          mockTextResponse('Here are properties in Karachi.'),
        );

      const mockSend = jest.fn().mockResolvedValue({});
      await incoming(
        baseEvt({ body: 'properties in karachi' }),
        'comp1',
        'user1',
        mockSend,
      );
      await jest.runAllTimersAsync();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenCalledWith(
        'c1',
        'Here are properties in Karachi.',
        { creditCharged: true },
      );
    });

    it('makes second LLM call with escalate_to_human result and sends AI reply', async () => {
      service = new WhatsappAiService(
        makeMockRepo() as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      (global.fetch as jest.Mock) = jest
        .fn()
        .mockResolvedValueOnce(
          mockToolCallResponse('call_2', 'escalate_to_human', '{}'),
        )
        .mockResolvedValueOnce(
          mockTextResponse('I have escalated your request to a human agent.'),
        );

      const mockSend = jest.fn().mockResolvedValue({});
      await incoming(
        baseEvt({ body: 'talk to human' }),
        'comp1',
        'user1',
        mockSend,
      );
      await jest.runAllTimersAsync();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenCalledWith(
        'c1',
        'I have escalated your request to a human agent.',
        { creditCharged: true },
      );
    });

    it('accumulates content correctly when SSE chunks arrive split across multiple reads', async () => {
      service = new WhatsappAiService(
        makeMockRepo() as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );

      // Split the SSE body across two separate Uint8Array chunks mid-line
      const encoder = new TextEncoder();
      const full =
        'data: {"choices":[{"delta":{"role":"assistant","content":"Hello"}}]}\n\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\ndata: [DONE]\n\n';
      const half = Math.floor(full.length / 2);
      const chunk1 = encoder.encode(full.slice(0, half));
      const chunk2 = encoder.encode(full.slice(half));

      const splitStream = new ReadableStream<Uint8Array>({
        start(ctrl) {
          ctrl.enqueue(chunk1);
          ctrl.enqueue(chunk2);
          ctrl.close();
        },
      });

      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: true, body: splitStream }) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      await incoming(
        baseEvt({ body: 'hi' }),
        'comp1',
        'user1',
        mockSend,
      );
      await jest.runAllTimersAsync();

      expect(mockSend).toHaveBeenCalledWith('c1', 'Hello world', {
        creditCharged: true,
      });
    });
  });

  describe('per-chat turn serialization', () => {
    beforeEach(() => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.OLLAMA_MODEL = 'test-model';
      process.env.AI_DEBOUNCE_MS = '100';
    });

    // A follow-up inbound message arriving while the first turn is mid-LLM must NOT spawn
    // a second concurrent processMessage on the same chat. Two overlapping turns would
    // double-count the quota and could persist history out of order.
    it('does not interleave two turns on the same chat — history stays ordered, quota counted once per turn', async () => {
      const mockRepo = makeMockRepo(null, SubscriptionTier.FREE);
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );

      // Gate every LLM call behind a manually-released resolver so we can hold turn 1
      // open while turn 2's flush timer fires.
      const releases: Array<(v: any) => void> = [];
      const fetchResolvedWith = (content: string) =>
        new Promise((resolve) =>
          releases.push(() => resolve(mockTextResponse(content))),
        );

      let call = 0;
      global.fetch = jest
        .fn()
        .mockImplementation(() => fetchResolvedWith(`reply-${++call}`)) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      // Turn 1 queued + flushed → processMessage starts, blocks on the gated fetch.
      await incoming(
        baseEvt({ body: 'first', timestamp: ts }),
        'co',
        'u1',
        mockSend,
      );
      await jest.advanceTimersByTimeAsync(100);
      // Turn 1's fetch is pending. Stored history is still empty: a turn works on a
      // local copy and only writes back once it has delivered a reply.
      expect(releases.length).toBe(1);
      expect(await service.getHistoryFor('u1', 'c1')).toEqual([]);

      // Turn 2 arrives WHILE turn 1 is mid-LLM (no pending entry exists anymore).
      await incoming(
        baseEvt({ body: 'second', timestamp: ts }),
        'co',
        'u1',
        mockSend,
      );
      await jest.advanceTimersByTimeAsync(100);
      // Serialization: turn 2 must be BLOCKED behind turn 1, so no second fetch yet and
      // nothing has been written to stored history.
      expect(releases.length).toBe(1);
      expect(await service.getHistoryFor('u1', 'c1')).toEqual([]);

      // Release turn 1's LLM so it finishes and persists its reply.
      releases[0]('resolve');
      // Turn 2 resumes on its next lock poll, not instantly.
      await jest.advanceTimersByTimeAsync(200);
      expect(releases.length).toBe(2);
      releases[1]('resolve');
      await jest.runAllTimersAsync();

      // Final history is cleanly ordered, no interleaving, no lost/duplicated entries.
      expect(
        (await service.getHistoryFor('u1', 'c1')).map((m) => m.content),
      ).toEqual(['first', 'reply-1', 'second', 'reply-2']);
      expect(mockSend).toHaveBeenCalledTimes(2);
      // Credit consumed exactly once per turn (never interleaved).
      expect(mockRepo.consumeConversationCredit).toHaveBeenCalledTimes(2);
    });

    // A failed turn must leave the stored history exactly as the previous turn left it:
    // the working copy is discarded rather than written back.
    it('on LLM failure removes only this turn user message, leaving prior turns intact', async () => {
      const mockRepo = makeMockRepo(null, SubscriptionTier.PRO);
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );

      // Turn 1 succeeds, turn 2 throws inside the LLM call.
      global.fetch = jest
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(mockTextResponse('ok-reply')),
        )
        .mockImplementationOnce(() =>
          Promise.reject(
            Object.assign(new Error('boom'), { cause: new Error('down') }),
          ),
        ) as any;

      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      await incoming(
        baseEvt({ body: 'good', timestamp: ts }),
        'co',
        'u1',
        mockSend,
      );
      await jest.runAllTimersAsync();
      await incoming(
        baseEvt({ body: 'bad', timestamp: ts }),
        'co',
        'u1',
        mockSend,
      );
      await jest.runAllTimersAsync();

      // Turn 1's user+assistant survive; turn 2's user message was rolled back cleanly.
      expect(
        (await service.getHistoryFor('u1', 'c1')).map((m) => m.content),
      ).toEqual(['good', 'ok-reply']);
    });
  });

  describe('input guards', () => {
    beforeEach(() => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.OLLAMA_MODEL = 'test-model';
      process.env.AI_DEBOUNCE_MS = '100';
      process.env.AI_HUMAN_SILENCE_MINUTES = '20';
    });

    it('does not throw and does not process when body is undefined (media message)', async () => {
      service = new WhatsappAiService(
        makeMockRepo() as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      global.fetch = jest.fn() as any;
      const mockSend = jest.fn().mockResolvedValue({});

      // A media event with no text body must be skipped, not crash on body.trim().
      const evt = {
        id: 'wa-media-1',
        chatId: 'c1',
        body: undefined as any,
        fromMe: false,
        isGroup: false,
        timestamp: Math.floor(Date.now() / 1000),
        senderId: 's1',
      };
      await expect(
        incoming(evt, 'co', 'u1', mockSend),
      ).resolves.toBeUndefined();
      await jest.runAllTimersAsync();

      expect(mockSend).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('sends the direct-contact reply when no human has taken over', async () => {
      service = new WhatsappAiService(
        makeMockRepo() as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      global.fetch = jest.fn() as any;
      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      // Baseline: 'DROP DELETE REMOVE' trips needsDirectContact; with no takeover the
      // canned reply is sent (guard does not fire).
      await incoming(
        baseEvt({ body: 'DROP DELETE REMOVE', timestamp: ts }),
        'co',
        'u1',
        mockSend,
      );
      await jest.runAllTimersAsync();

      expect(mockSend).toHaveBeenCalledWith('c1', DIRECT_CONTACT_RESPONSE);
    });

    it('skips the direct-contact reply when a human took over after the turn started', async () => {
      service = new WhatsappAiService(
        makeMockRepo() as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      global.fetch = jest.fn() as any;
      const mockSend = jest.fn().mockResolvedValue({});
      const ts = Math.floor(Date.now() / 1000);

      // The needsDirectContact early send is reachable only in the sub-millisecond window
      // between the top isHumanSilenceActive() check and the canned send, so a human
      // takeover in that window is forced here by making the mid-turn guard report true.
      // This asserts the guard is actually consulted before the direct-contact send.
      const guardSpy = jest
        .spyOn(service as any, 'humanTookOverSince')
        .mockReturnValue(true);

      await incoming(
        baseEvt({ body: 'DROP DELETE REMOVE', timestamp: ts }),
        'co',
        'u1',
        mockSend,
      );
      await jest.runAllTimersAsync();

      expect(guardSpy).toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('AI history seeding from the database', () => {
    const priorRow = (over: any = {}) => ({
      id: 'wa-x',
      chatId: 'c1',
      senderId: 's1',
      senderName: 'Ahmed',
      chatName: 'Ahmed',
      isGroup: false,
      body: 'earlier message',
      hasMedia: false,
      mediaType: '',
      mediaUrls: [],
      mentionedIds: [],
      quotedParticipant: '',
      fromMe: false,
      aiGenerated: false,
      timestamp: 1700000000,
      ...over,
    });

    const buildService = (store: any) => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.OLLAMA_HOST = 'http://llm';
      process.env.OLLAMA_MODEL = 'm';
      process.env.AI_DEBOUNCE_MS = '100';
      global.fetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(mockTextResponse('reply')),
        ) as any;
      return new WhatsappAiService(
        makeMockRepo() as any,
        store as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
    };

    const sentMessages = () =>
      JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).messages;

    afterEach(() => {
      delete process.env.AI_HISTORY_SEED_LIMIT;
      delete process.env.AI_HISTORY_SEED_MAX_CHARS;
    });

    it('rebuilds prior turns into the prompt on a cold start', async () => {
      const store = makeMockStore([
        priorRow({ id: 'p1', body: 'do you have 2 bedrooms', fromMe: false }),
        priorRow({ id: 'p2', body: 'yes, three of them', fromMe: true }),
      ]);
      service = buildService(store);

      await incoming(
        baseEvt({ id: 'now-1', body: 'what price' }),
        'co',
        'u1',
        jest.fn().mockResolvedValue({}),
      );
      await jest.runAllTimersAsync();

      const nonSystem = sentMessages().filter((m: any) => m.role !== 'system');
      expect(nonSystem).toEqual([
        { role: 'user', content: 'do you have 2 bedrooms' },
        { role: 'assistant', content: 'yes, three of them' },
        { role: 'user', content: 'what price' },
      ]);
    });

    it('excludes the ids of the current turn so they are not sent twice', async () => {
      const store = makeMockStore([]);
      service = buildService(store);

      await incoming(
        baseEvt({ id: 'now-1', body: 'first' }),
        'co',
        'u1',
        jest.fn().mockResolvedValue({}),
      );
      await incoming(
        baseEvt({ id: 'now-2', body: 'second' }),
        'co',
        'u1',
        jest.fn().mockResolvedValue({}),
      );
      await jest.runAllTimersAsync();

      expect(store.getChatHistory).toHaveBeenCalledWith('co', 'u1', 'c1', 20, [
        'now-1',
        'now-2',
      ]);
    });

    it('does not re-query the database while the history is still cached', async () => {
      const store = makeMockStore([]);
      service = buildService(store);
      const send = jest.fn().mockResolvedValue({});

      await incoming(
        baseEvt({ id: 'a1', body: 'one' }),
        'co',
        'u1',
        send,
      );
      await jest.runAllTimersAsync();
      await incoming(
        baseEvt({ id: 'a2', body: 'two' }),
        'co',
        'u1',
        send,
      );
      await jest.runAllTimersAsync();

      expect(store.getChatHistory).toHaveBeenCalledTimes(1);
    });

    it('still answers when the history query fails', async () => {
      const store = {
        getChatHistory: jest.fn().mockRejectedValue(new Error('db down')),
        addMessage: jest.fn().mockResolvedValue(undefined),
      };
      service = buildService(store);
      const send = jest.fn().mockResolvedValue({});

      await incoming(
        baseEvt({ id: 'now-1', body: 'hello' }),
        'co',
        'u1',
        send,
      );
      await jest.runAllTimersAsync();

      expect(send).toHaveBeenCalledTimes(1);
      const nonSystem = sentMessages().filter((m: any) => m.role !== 'system');
      expect(nonSystem).toEqual([{ role: 'user', content: 'hello' }]);
    });

    it('drops the oldest seeded messages to stay inside the character budget', async () => {
      process.env.AI_HISTORY_SEED_MAX_CHARS = '20';
      const store = makeMockStore([
        priorRow({ id: 'p1', body: 'aaaaaaaaaaaaaaa' }),
        priorRow({ id: 'p2', body: 'bbbbbbbbbbbbbbb' }),
      ]);
      service = buildService(store);

      await incoming(
        baseEvt({ id: 'now-1', body: 'hi' }),
        'co',
        'u1',
        jest.fn().mockResolvedValue({}),
      );
      await jest.runAllTimersAsync();

      const nonSystem = sentMessages().filter((m: any) => m.role !== 'system');
      expect(nonSystem).toEqual([
        { role: 'user', content: 'bbbbbbbbbbbbbbb' },
        { role: 'user', content: 'hi' },
      ]);
    });

    it('seeds nothing when the limit is zero', async () => {
      process.env.AI_HISTORY_SEED_LIMIT = '0';
      const store = makeMockStore([priorRow({ body: 'ignored' })]);
      service = buildService(store);

      await incoming(
        baseEvt({ id: 'now-1', body: 'hi' }),
        'co',
        'u1',
        jest.fn().mockResolvedValue({}),
      );
      await jest.runAllTimersAsync();

      expect(store.getChatHistory).not.toHaveBeenCalled();
    });
  });

  describe('AI toggle loaded from the database', () => {
    it('reads the stored value on a map miss', async () => {
      const mockRepo = makeMockRepo();
      mockRepo.loadAiEnabled.mockResolvedValue(false);
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,
        makeMockRedis() as any,
        queue as any,
      );

      expect(await service.isEnabledFor('company-1')).toBe(false);
      expect(mockRepo.loadAiEnabled).toHaveBeenCalledWith('company-1');
    });

    it('does not queue a turn on a fresh replica when the stored value is off', async () => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.AI_DEBOUNCE_MS = '100';
      const mockRepo = makeMockRepo();
      mockRepo.loadAiEnabled.mockResolvedValue(false);
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,
        makeMockRedis() as any,
        queue as any,
      );

      const mockSend = jest.fn();
      await incoming(baseEvt(), 'company-1', 'user-1', mockSend);
      await jest.runAllTimersAsync();

      expect(mockSend).not.toHaveBeenCalled();
      expect(queue.jobs.size).toBe(0);
    });

    it('keeps the in-process value once it is known', async () => {
      const mockRepo = makeMockRepo();
      mockRepo.loadAiEnabled.mockResolvedValue(false);
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,
        makeMockRedis() as any,
        queue as any,
      );
      service.setEnabled('company-1', true);

      expect(await service.isEnabledFor('company-1')).toBe(true);
      expect(mockRepo.loadAiEnabled).not.toHaveBeenCalled();
    });

    it('an admin disabling AI takes effect for the other agents of that company', async () => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.AI_DEBOUNCE_MS = '100';
      const mockRepo = makeMockRepo();
      mockRepo.loadAiEnabled.mockResolvedValue(true);
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,
        makeMockRedis() as any,
        queue as any,
      );

      // Agent A's gate loads the company state while AI is still on.
      expect(await service.isEnabledFor('company-1')).toBe(true);

      await service.persistEnabled('company-1', false);

      // Agent B, same company, different user: no restart, no stale true.
      const mockSend = jest.fn();
      await incoming(baseEvt(), 'company-1', 'agent-b', mockSend);
      await jest.runAllTimersAsync();

      expect(mockSend).not.toHaveBeenCalled();
      expect(queue.jobs.size).toBe(0);
    });

    it('persistEnabled sets the in-memory value and then propagates a failed write', async () => {
      const mockRepo = makeMockRepo();
      mockRepo.persistAiEnabled.mockRejectedValue(new Error('db unreachable'));
      service = new WhatsappAiService(
        mockRepo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,
        makeMockRedis() as any,
        queue as any,
      );

      await expect(service.persistEnabled('company-1', false)).rejects.toThrow(
        'db unreachable',
      );
      expect(service.isEnabled('company-1')).toBe(false);
    });
  });

  describe('claimed buffer survives a failed turn', () => {
    it('hands the messages back when the chat lock throws', async () => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.AI_DEBOUNCE_MS = '100';
      const redis = makeMockRedis();
      const realTryLock = redis.tryLock;
      let failOnce = true;
      redis.tryLock = (key: string, token: string) => {
        if (failOnce) {
          failOnce = false;
          return Promise.reject(new Error('redis blip'));
        }
        return realTryLock(key, token);
      };
      service = new WhatsappAiService(
        makeMockRepo() as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,
        redis as any,
        queue as any,
      );

      await incoming(
        baseEvt({ body: 'is the flat still free' }),
        'company-1',
        'user-1',
        jest.fn().mockResolvedValue({}),
      );
      await jest.advanceTimersByTimeAsync(150);

      expect(await redis.getList('wa:ai:pend:user-1:c1')).toEqual([
        JSON.stringify({ body: 'is the flat still free', id: 'wa-msg-1' }),
      ]);
      expect(await redis.getList('wa:ai:pend:user-1:c1:take')).toEqual([]);
      expect(
        [...queue.jobs.values()].some((job: any) => job.state === 'delayed'),
      ).toBe(true);
    });

    it('a lock timeout restores the buffer and re-arms a turn instead of deleting it', async () => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.AI_DEBOUNCE_MS = '100';
      process.env.AI_LOCK_WAIT_MS = '10';
      const redis = makeMockRedis();
      // Someone else already holds the chat lock, so every tryLock fails.
      redis.locks.set('wa:ai:lock:user-1:c1', 'another-replica');
      service = new WhatsappAiService(
        makeMockRepo() as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,
        redis as any,
        queue as any,
      );

      await incoming(
        baseEvt({ body: 'is the flat still free' }),
        'company-1',
        'user-1',
        jest.fn().mockResolvedValue({}),
      );
      await jest.advanceTimersByTimeAsync(500);

      expect(await redis.getList('wa:ai:pend:user-1:c1')).toEqual([
        JSON.stringify({ body: 'is the flat still free', id: 'wa-msg-1' }),
      ]);
      expect(await redis.getList('wa:ai:pend:user-1:c1:take')).toEqual([]);
      expect(
        [...queue.jobs.values()].some((job: any) => job.state === 'delayed'),
      ).toBe(true);
    });

    it('gives up on the chat lock after 20s by default', async () => {
      const redis = makeMockRedis();
      redis.locks.set('wa:ai:lock:user-1:c1', 'another-replica');
      service = new WhatsappAiService(
        makeMockRepo() as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,
        redis as any,
        queue as any,
      );

      const task = jest.fn().mockResolvedValue(undefined);
      const assertion = expect(
        (service as any).runSerializedPerChat('user-1:c1', task),
      ).rejects.toThrow('Timed out waiting 20000ms');
      await jest.advanceTimersByTimeAsync(21000);
      await assertion;

      expect(task).not.toHaveBeenCalled();
    });

    it('drops the claim once the turn completes', async () => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.OLLAMA_MODEL = 'test-model';
      process.env.AI_DEBOUNCE_MS = '100';
      const redis = makeMockRedis();
      service = new WhatsappAiService(
        makeMockRepo() as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,
        redis as any,
        queue as any,
      );
      global.fetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(mockTextResponse('AI reply')),
        ) as any;

      await incoming(
        baseEvt(),
        'company-1',
        'user-1',
        jest.fn().mockResolvedValue({ messageId: 'wamid.1' }),
      );
      await jest.runAllTimersAsync();

      expect(await redis.getList('wa:ai:pend:user-1:c1')).toEqual([]);
      expect(await redis.getList('wa:ai:pend:user-1:c1:take')).toEqual([]);
    });
  });

  describe('a send that never reaches Meta', () => {
    beforeEach(() => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.OLLAMA_MODEL = 'test-model';
      process.env.AI_DEBOUNCE_MS = '100';
    });

    const failures: Array<[string, () => Error]> = [
      [
        'a payment failure (131042)',
        () => new WhatsappSendError('Cloud API send failed 400', 400, 131042),
      ],
      [
        'an invalid token (401)',
        () => new WhatsappSendError('Cloud API send failed 401', 401, 190),
      ],
      [
        'a timeout',
        () => new WhatsappSendError('Cloud API send error: aborted'),
      ],
    ];

    for (const [label, makeError] of failures) {
      it(`records no delivery and no history after ${label}`, async () => {
        const mockRepo = makeMockRepo(null);
        const redis = makeMockRedis();
        service = new WhatsappAiService(
          mockRepo as any,
          makeMockStore() as any,
          makeMockBuilder() as any,
          makeMockEmail() as any,
          redis as any,
          queue as any,
        );
        jest
          .spyOn((service as any).logger, 'error')
          .mockImplementation(() => undefined);
        global.fetch = jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve(mockTextResponse('AI reply')),
          ) as any;

        const mockSend = jest.fn().mockRejectedValue(makeError());
        await incoming(baseEvt(), 'company-1', 'user-1', mockSend);
        await jest.runAllTimersAsync();

        expect(mockSend).toHaveBeenCalled();
        expect(mockRepo.recordTurnDelivered).not.toHaveBeenCalled();
        expect(await service.getHistoryFor('user-1', 'c1')).toEqual([]);
      });
    }
  });

  // Meta has no standalone typing call: it rides a read receipt for one inbound id,
  // lasts 25 seconds, and may only be shown when a reply is actually coming.
  describe('typing rider', () => {
    const newService = (repo: any = makeMockRepo()) => {
      service = new WhatsappAiService(
        repo as any,
        makeMockStore() as any,
        makeMockBuilder() as any,
        makeMockEmail() as any,

        makeMockRedis() as any,
        queue as any,
      );
      return repo;
    };

    beforeEach(() => {
      process.env.OLLAMA_API_KEY = 'test-key';
      process.env.OLLAMA_HOST = 'http://localhost:11434';
      process.env.OLLAMA_MODEL = 'test-model';
      process.env.AI_DEBOUNCE_MS = '100';
    });

    it('rides typing on the newest claimed inbound id, before the first LLM call', async () => {
      newService();
      global.fetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(mockTextResponse('AI reply')),
        ) as any;
      const mockSend = jest.fn().mockResolvedValue({});
      const mockMarkRead = jest.fn().mockResolvedValue(undefined);
      const ts = Math.floor(Date.now() / 1000);

      await incoming(
        baseEvt({ id: 'wamid.a', body: 'hello', timestamp: ts }),
        'co',
        'u1',
        mockSend,
        mockMarkRead,
      );
      await incoming(
        baseEvt({ id: 'wamid.b', body: 'you there', timestamp: ts }),
        'co',
        'u1',
        mockSend,
        mockMarkRead,
      );
      await jest.runAllTimersAsync();

      expect(mockMarkRead).toHaveBeenCalledTimes(1);
      expect(mockMarkRead).toHaveBeenCalledWith('wamid.b', true);
      expect(mockMarkRead.mock.invocationCallOrder[0]).toBeLessThan(
        (global.fetch as jest.Mock).mock.invocationCallOrder[0],
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('a rejected read receipt does not cost the turn its reply', async () => {
      newService();
      global.fetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(mockTextResponse('AI reply')),
        ) as any;
      const mockSend = jest.fn().mockResolvedValue({});
      const mockMarkRead = jest.fn().mockRejectedValue(new Error('graph down'));

      await incoming(baseEvt(), 'co', 'u1', mockSend, mockMarkRead);
      await jest.runAllTimersAsync();

      expect(mockMarkRead).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledWith('c1', 'AI reply', {
        creditCharged: true,
      });
    });

    it('shows nothing when AI is disabled for the company', async () => {
      newService();
      service.setEnabled('co', false);
      global.fetch = jest.fn() as any;
      const mockSend = jest.fn().mockResolvedValue({});
      const mockMarkRead = jest.fn().mockResolvedValue(undefined);

      await incoming(baseEvt(), 'co', 'u1', mockSend, mockMarkRead);
      await jest.runAllTimersAsync();

      expect(mockMarkRead).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('shows nothing while the human-silence window is open', async () => {
      process.env.AI_HUMAN_SILENCE_MINUTES = '20';
      newService();
      global.fetch = jest.fn() as any;
      const mockSend = jest.fn().mockResolvedValue({});
      const mockMarkRead = jest.fn().mockResolvedValue(undefined);

      await service.recordHumanReply('u1', 'c1');
      await incoming(baseEvt(), 'co', 'u1', mockSend, mockMarkRead);
      await jest.runAllTimersAsync();

      expect(mockMarkRead).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('shows nothing when the credit is refused', async () => {
      const repo = makeMockRepo();
      repo.consumeConversationCredit.mockResolvedValue({
        allowed: false,
        charged: false,
        conversationId: null,
      });
      newService(repo);
      global.fetch = jest.fn() as any;
      const mockSend = jest.fn().mockResolvedValue({});
      const mockMarkRead = jest.fn().mockResolvedValue(undefined);

      await incoming(baseEvt(), 'co', 'u1', mockSend, mockMarkRead);
      await jest.runAllTimersAsync();

      expect(mockMarkRead).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('shows nothing when the credit check itself fails', async () => {
      const repo = makeMockRepo();
      repo.consumeConversationCredit.mockRejectedValue(new Error('db down'));
      newService(repo);
      jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
      global.fetch = jest.fn() as any;
      const mockSend = jest.fn().mockResolvedValue({});
      const mockMarkRead = jest.fn().mockResolvedValue(undefined);

      await incoming(baseEvt(), 'co', 'u1', mockSend, mockMarkRead);
      await jest.runAllTimersAsync();

      expect(mockMarkRead).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
