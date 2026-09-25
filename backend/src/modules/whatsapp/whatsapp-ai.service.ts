import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { RedisService } from '@modules/redis/redis.service';
import {
  AiCreditUsageSummary,
  AiCreditUsageWithAgents,
  AiHistoryMessage,
  WA_AI_DEBOUNCE_QUEUE,
  DebounceJobData,
  DebouncedBuffer,
} from './wa-types';
import { WhatsappAiRepositoryService } from './whatsapp-ai-repository.service';
import { MessageStoreService } from './message-store.service';
import { WhatsappAiPromptBuilderService } from './whatsapp-ai-prompt-builder.service';
import {
  sanitizeInput,
  parseResponse,
  parseToolCall,
  DIRECT_CONTACT_RESPONSE,
  ChatCompletion,
  ToolDefinition,
} from './whatsapp-ai-filter';
import { TOOL_DEFINITIONS, executeTool } from './whatsapp-ai-tools';
import {
  getAiCreditAllowance,
  getCreditPeriod,
} from '@shared/utils/ai-credit.util';
import { errorMessage } from '@shared/utils/error.util';
import { envString, envInt, envFloat, envBool } from '@shared/utils/env.util';
import { SystemEmailService } from '@modules/email/system-email.service';
import { Company } from '@modules/companies/entities/company.entity';

export type SendFn = (
  chatId: string,
  message: string,
  meta?: { creditCharged: boolean },
) => Promise<{ messageId?: string }>;

// Resolved by the processor so this service stays free of transport dependencies.
export type MarkReadFn = (
  messageId: string,
  withTyping: boolean,
) => Promise<void>;

export class ChatLockTimeoutError extends Error {
  readonly name = 'ChatLockTimeoutError';
}

type ErrorCause = { code?: string; message?: string };

const errorCause = (err: unknown): ErrorCause | undefined =>
  typeof err === 'object' && err !== null && 'cause' in err
    ? (err.cause as ErrorCause | undefined)
    : undefined;

// State lives in Redis, turns queue in BullMQ, so replicas share history and survive restarts.
@Injectable()
export class WhatsappAiService {
  private readonly logger = new Logger(WhatsappAiService.name);
  private readonly AI_STATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  // Must outlive the debounce queue's removeOnFail age (604800s), so this TTL sits a day above it.
  private readonly AI_SEQ_TTL_MS = 8 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly repo: WhatsappAiRepositoryService,
    private readonly store: MessageStoreService,
    private readonly promptBuilder: WhatsappAiPromptBuilderService,
    private readonly systemEmail: SystemEmailService,
    private readonly redis: RedisService,
    @InjectQueue(WA_AI_DEBOUNCE_QUEUE)
    private readonly debounceQueue: Queue<DebounceJobData>,
  ) {}

  private histKey(userId: string, chatId: string): string {
    return `wa:ai:hist:${userId}:${chatId}`;
  }

  private humanKey(userId: string, chatId: string): string {
    return `wa:ai:human:${userId}:${chatId}`;
  }

  private pendKey(userId: string, chatId: string): string {
    return `wa:ai:pend:${userId}:${chatId}`;
  }

  private pendIdxKey(userId: string): string {
    return `wa:ai:pendidx:${userId}`;
  }

  // Per job, so overlapping claims on one chat never overwrite each other's scratch list.
  private takeKey(userId: string, chatId: string, jobId: string): string {
    return `${this.pendKey(userId, chatId)}:take:${jobId}`;
  }

  private enabledKey(companyId: string): string {
    return `wa:ai:enabled:${companyId}`;
  }

  private dispatchedKey(userId: string, messageId: string): string {
    return `wa:ai:dispatched:${userId}:${messageId}`;
  }

  // Job id encodes this so a mid-turn message schedules the next turn, avoiding BullMQ's dedup.
  private seqKey(userId: string, chatId: string): string {
    return `wa:ai:seq:${userId}:${chatId}`;
  }

  private jobIdFor(userId: string, chatId: string, seq: number): string {
    return `${userId}:${chatId}:${seq}`;
  }

  private async currentSeq(userId: string, chatId: string): Promise<number> {
    return (await this.redis.getNumber(this.seqKey(userId, chatId))) ?? 0;
  }

  async getConfig(companyId: string) {
    return {
      enabled: await this.isEnabledFor(companyId),
      keyConfigured: !!envString('OLLAMA_API_KEY'),
      model: envString('OLLAMA_MODEL', ''),
      host: envString('OLLAMA_HOST', ''),
    };
  }

  private async resolveLimitAndPeriod(
    company: Company,
  ): Promise<{ limit: number; period: { start: Date; end: Date } }> {
    const limit = getAiCreditAllowance(company);
    const period = getCreditPeriod(await this.repo.getPeriodAnchor(company));
    return { limit, period };
  }

  async getCreditUsage(
    companyId: string,
  ): Promise<AiCreditUsageSummary | null> {
    const company = await this.repo.getCompany(companyId);
    if (!company) return null;

    const { limit, period } = await this.resolveLimitAndPeriod(company);
    const { used, openWindows } = await this.repo.getCreditUsage(
      companyId,
      period.start,
    );

    return { used, limit, openWindows, resetsAt: period.end.toISOString() };
  }

  async getCreditUsageWithAgents(
    companyId: string,
  ): Promise<AiCreditUsageWithAgents | null> {
    const company = await this.repo.getCompany(companyId);
    if (!company) return null;

    const { limit, period } = await this.resolveLimitAndPeriod(company);
    const [usage, agents] = await Promise.all([
      this.repo.getCreditUsage(companyId, period.start),
      this.repo.getAgentCreditBreakdown(companyId, period.start),
    ]);

    return {
      used: usage.used,
      limit,
      openWindows: usage.openWindows,
      periodStart: period.start.toISOString(),
      resetsAt: period.end.toISOString(),
      agents,
    };
  }

  async getConfigWithUsage(companyId: string) {
    const base = await this.getConfig(companyId);
    const usage = await this.getCreditUsage(companyId);

    if (!usage) {
      return {
        ...base,
        creditsLimit: null,
        creditsUsed: null,
        creditsResetsAt: null,
        openWindows: null,
      };
    }

    return {
      ...base,
      creditsLimit: usage.limit,
      creditsUsed: usage.used,
      creditsResetsAt: usage.resetsAt,
      openWindows: usage.openWindows,
    };
  }

  // Shared across replicas in Redis; the DB is the source of truth on a miss, and any error fails closed.
  async isEnabledFor(companyId: string): Promise<boolean> {
    try {
      const cached = await this.redis.getNumber(this.enabledKey(companyId));
      if (cached !== null) return cached === 1;
      const stored = await this.repo.loadAiEnabled(companyId);
      if (stored === null) return envBool('AI_ENABLED', true);
      // NX so a stale load can never overwrite a toggle written after it.
      await this.redis.setNumberIfAbsent(
        this.enabledKey(companyId),
        stored ? 1 : 0,
        this.AI_STATE_TTL_MS,
      );
      return stored;
    } catch (err) {
      this.logger.error(
        `Failed to load aiEnabled for ${companyId}, refusing the AI turn`,
        errorMessage(err),
      );
      return false;
    }
  }

  // Cache dropped before the write, so a failed write or cache update leaves readers on the DB value.
  async persistEnabled(companyId: string, value: boolean): Promise<void> {
    await this.redis.del(this.enabledKey(companyId));
    await this.repo.persistAiEnabled(companyId, value);
    await this.redis.setNumber(
      this.enabledKey(companyId),
      value ? 1 : 0,
      this.AI_STATE_TTL_MS,
    );
  }

  async getHistoryFor(
    userId: string,
    chatId: string,
  ): Promise<AiHistoryMessage[]> {
    const history = await this.redis.getJson<AiHistoryMessage[]>(
      this.histKey(userId, chatId),
    );
    return history ?? [];
  }

  clearPromptCache(companyId?: string): void {
    this.repo.clearPromptCache(companyId);
    this.repo.clearContextCache(companyId);
  }

  // Left alone: resetting would reuse a job id a failed record holds for 7 days, and BullMQ drops it.
  async clearUserState(userId: string, companyId: string): Promise<void> {
    const jobIds = await this.redis.setMembers(this.pendIdxKey(userId));
    for (const jobId of jobIds) {
      const job = await this.debounceQueue.getJob(jobId);
      if (job) {
        await job
          .remove()
          .catch((err: unknown) =>
            this.logger.warn(
              `Could not remove debounce job ${jobId} for user ${userId}: ${errorMessage(err)}`,
            ),
          );
      }
    }
    await this.redis.del(this.pendIdxKey(userId));
    await this.redis.del(this.enabledKey(companyId));
    await this.redis.delByPattern(this.pendKey(userId, '*'));
    await this.redis.delByPattern(this.histKey(userId, '*'));
    await this.redis.delByPattern(this.humanKey(userId, '*'));
  }

  // Called on a human reply; cancels any pending debounced AI response. A replayed older reply changes nothing.
  async recordHumanReply(
    userId: string,
    chatId: string,
    at = Date.now(),
  ): Promise<void> {
    // Clamped so a phone clock running ahead can never block a later dashboard reply.
    const stamp = Math.min(at, Date.now());
    const key = this.humanKey(userId, chatId);
    const existing = await this.redis.getNumber(key);
    if (existing !== null && existing >= stamp) return;
    await this.redis.setNumber(key, stamp, this.AI_STATE_TTL_MS);
    await this.cancelPending(userId, chatId);
  }

  private async cancelPending(userId: string, chatId: string): Promise<void> {
    const jobId = this.jobIdFor(
      userId,
      chatId,
      await this.currentSeq(userId, chatId),
    );
    const job = await this.debounceQueue.getJob(jobId);
    if (job) {
      await job
        .remove()
        .catch((err: unknown) =>
          this.logger.warn(
            `Could not remove debounce job ${jobId} for ${userId}:${chatId}: ${errorMessage(err)}`,
          ),
        );
    }
    await this.redis.del(this.pendKey(userId, chatId));
    await this.redis.setRemove(this.pendIdxKey(userId), jobId);
  }

  async handleIncomingMessage(
    evt: {
      id: string;
      chatId: string;
      body: string;
      fromMe: boolean;
      isGroup: boolean;
      timestamp: number;
      senderId: string;
    },
    companyId: string,
    userId: string,
  ): Promise<void> {
    if (!envString('OLLAMA_API_KEY')) return;
    if (!(await this.isEnabledFor(companyId))) return;
    if (evt.fromMe || evt.isGroup || !(evt.body ?? '').trim()) return;

    const maxAge = envInt('AI_MESSAGE_MAX_AGE_S', 120, 1);
    if (Math.floor(Date.now() / 1000) - evt.timestamp > maxAge) return;

    // A retried webhook job re-delivers stored messages; each id is buffered for a turn at most once.
    const dispatchedKey = this.dispatchedKey(userId, evt.id);
    if ((await this.redis.getNumber(dispatchedKey)) !== null) return;

    const debounceMs = envInt('AI_DEBOUNCE_MS', 10000, 1);
    const maxDebounceMs = envInt('AI_DEBOUNCE_MAX_MS', 60000, 1);
    const maxPending = envInt('AI_PENDING_MAX', 20, 1);
    const maxBodyChars = envInt('AI_MESSAGE_MAX_CHARS', 4000, 1);
    const pendKey = this.pendKey(userId, evt.chatId);
    const body = evt.body.slice(0, maxBodyChars);

    // Buffered first: a mid-write claim already advanced the sequence, so this schedules a fresh turn.
    if ((await this.redis.listLength(pendKey)) < maxPending) {
      await this.redis.pushList(
        pendKey,
        JSON.stringify({ body, id: evt.id }),
        this.AI_STATE_TTL_MS,
      );
    } else {
      this.logger.warn(
        `Pending buffer full (${maxPending}), dropped message ${evt.id} for ${userId}:${evt.chatId}`,
      );
    }

    let jobId = this.jobIdFor(
      userId,
      evt.chatId,
      await this.currentSeq(userId, evt.chatId),
    );
    const existing = await this.debounceQueue.getJob(jobId);
    let rescheduled = false;

    if (existing) {
      // Deadline caps the extension: messaging faster than debounceMs would
      // otherwise restart the countdown forever and the turn would never run.
      const remaining = existing.data.deadlineAt - Date.now();
      try {
        if (remaining <= 0) await existing.promote();
        else await existing.changeDelay(Math.min(debounceMs, remaining));
        rescheduled = true;
      } catch {
        // Job already left delayed state; advancing the sequence here avoids a silent BullMQ dedup drop.
        jobId = this.jobIdFor(
          userId,
          evt.chatId,
          await this.redis.incrCounter(
            this.seqKey(userId, evt.chatId),
            this.AI_SEQ_TTL_MS,
          ),
        );
      }
    }

    if (!rescheduled) {
      await this.redis.setAdd(
        this.pendIdxKey(userId),
        jobId,
        this.AI_STATE_TTL_MS,
      );
      await this.debounceQueue.add(
        'turn',
        {
          userId,
          chatId: evt.chatId,
          companyId,
          deadlineAt: Date.now() + maxDebounceMs,
        },
        { jobId, delay: debounceMs },
      );
    }

    // Set only after buffering and scheduling succeed, so a failure above leaves the retry free to run.
    await this.redis.setNumberIfAbsent(
      dispatchedKey,
      Date.now(),
      this.AI_STATE_TTL_MS,
    );
  }

  // RENAME claims the buffer atomically; scratch key survives until release/restore retires it.
  async takeDebouncedBuffer(
    data: Pick<DebounceJobData, 'userId' | 'chatId'>,
    jobId: string,
  ): Promise<DebouncedBuffer | null> {
    const source = this.pendKey(data.userId, data.chatId);
    const scratch = this.takeKey(data.userId, data.chatId, jobId);
    // Sequence increments before rename, so a racing message joins this claim or the next turn, never both.
    const claimed = await this.redis.incrCounter(
      this.seqKey(data.userId, data.chatId),
      this.AI_SEQ_TTL_MS,
    );
    if (!(await this.redis.renameKey(source, scratch))) return null;
    await this.redis.setRemove(
      this.pendIdxKey(data.userId),
      this.jobIdFor(data.userId, data.chatId, claimed - 1),
    );
    const raw = await this.redis.getList(scratch);
    // Invalid entries are dropped, never thrown, so one bad entry cannot loop through restore forever.
    const parsed: { body: string; id: string }[] = [];
    const seen = new Set<string>();
    for (const entry of raw) {
      let value: unknown;
      try {
        value = JSON.parse(entry);
      } catch {
        value = null;
      }
      const item = value as { body?: unknown; id?: unknown } | null;
      if (typeof item?.body !== 'string' || typeof item.id !== 'string') {
        this.logger.warn(
          `Dropped an invalid buffered entry for ${data.userId}:${data.chatId}`,
        );
        continue;
      }
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      parsed.push({ body: item.body, id: item.id });
    }
    if (parsed.length === 0) {
      await this.redis.del(scratch);
      return null;
    }
    return {
      combinedText: parsed.map((p) => p.body).join('\n'),
      messageIds: parsed.map((p) => p.id),
    };
  }

  // The turn finished with the claim consumed: nothing left to hand back.
  async releaseClaimedBuffer(
    data: Pick<DebounceJobData, 'userId' | 'chatId'>,
    jobId: string,
  ): Promise<void> {
    await this.redis.del(this.takeKey(data.userId, data.chatId, jobId));
  }

  // Runs when a turn throws before replying: returns claimed messages to the buffer and re-arms it.
  async restoreClaimedBuffer(
    data: DebounceJobData,
    jobId: string,
  ): Promise<void> {
    const scratch = this.takeKey(data.userId, data.chatId, jobId);
    const raw = await this.redis.getList(scratch);
    await this.redis.del(scratch);
    if (raw.length === 0) return;

    const maxPending = envInt('AI_PENDING_MAX', 20, 1);
    const dropped = await this.redis.prependList(
      this.pendKey(data.userId, data.chatId),
      raw,
      maxPending,
      this.AI_STATE_TTL_MS,
    );
    if (dropped > 0) {
      this.logger.warn(
        `Pending buffer full (${maxPending}), dropped ${dropped} oldest message(s) restoring a failed turn for ${data.userId}:${data.chatId}`,
      );
    }
    await this.scheduleRestoredTurn(data);
    this.logger.warn(
      `Restored ${raw.length} buffered message(s) for ${data.userId}:${data.chatId} after a failed turn`,
    );
  }

  private async scheduleRestoredTurn(data: DebounceJobData): Promise<void> {
    const debounceMs = envInt('AI_DEBOUNCE_MS', 10000, 1);
    const maxDebounceMs = envInt('AI_DEBOUNCE_MAX_MS', 60000, 1);
    // Fresh id since the claim advanced the sequence; a job under it means one arrived during the failure.
    let jobId = this.jobIdFor(
      data.userId,
      data.chatId,
      await this.currentSeq(data.userId, data.chatId),
    );
    const existing = await this.debounceQueue.getJob(jobId);
    if (existing) {
      // Jobs are added with a delay and no priority or parent, so only these two states will still run.
      const state = await existing.getState();
      if (state === 'delayed' || state === 'waiting') return;
      jobId = this.jobIdFor(
        data.userId,
        data.chatId,
        await this.redis.incrCounter(
          this.seqKey(data.userId, data.chatId),
          this.AI_SEQ_TTL_MS,
        ),
      );
    }

    await this.redis.setAdd(
      this.pendIdxKey(data.userId),
      jobId,
      this.AI_STATE_TTL_MS,
    );
    await this.debounceQueue.add(
      'turn',
      {
        userId: data.userId,
        chatId: data.chatId,
        companyId: data.companyId,
        deadlineAt: Date.now() + maxDebounceMs,
      },
      { jobId, delay: debounceMs },
    );
  }

  async runTurn(
    companyId: string,
    userId: string,
    chatId: string,
    messageIds: string[],
    combinedText: string,
    send: SendFn,
    markRead?: MarkReadFn,
  ): Promise<void> {
    await this.runSerializedPerChat(`${userId}:${chatId}`, (isLockHeld) =>
      this.processMessage(
        combinedText,
        chatId,
        companyId,
        userId,
        send,
        messageIds,
        markRead,
        isLockHeld,
      ),
    );
  }

  // Waits rather than rejecting so a follow-up message still gets answered instead of dropped.
  private async runSerializedPerChat(
    key: string,
    task: (isLockHeld: () => boolean) => Promise<void>,
  ): Promise<void> {
    const lockKey = `wa:ai:lock:${key}`;
    const token = randomUUID();
    const ttlMs = envInt('AI_LOCK_TTL_MS', 30000, 1);
    // Seconds, not minutes: a longer wait pins a worker slot while the queue re-arms the turn anyway.
    const waitMs = envInt('AI_LOCK_WAIT_MS', 20000, 1);

    // Must throw, never return, so the processor's catch restores the buffer instead of deleting it.
    if (!(await this.acquireChatLock(lockKey, token, ttlMs, waitMs))) {
      throw new ChatLockTimeoutError(
        `Timed out waiting ${waitMs}ms for the AI chat lock on ${key}`,
      );
    }

    // A turn can outlive ttlMs, so keep extending the lock while this replica is alive; else it expires.
    const renewEveryMs = Math.max(Math.floor(ttlMs / 3), 1000);
    let lockHeld = true;
    const renew = setInterval(() => {
      void this.redis
        .renewLock(lockKey, token, ttlMs)
        .then((ok) => {
          if (ok) return;
          lockHeld = false;
          clearInterval(renew);
          this.logger.error(
            `Lost the AI chat lock on ${key}; the turn will not send or persist history`,
          );
        })
        .catch((err: unknown) =>
          this.logger.error(
            `Lock renewal failed on ${key}: ${errorMessage(err)}`,
          ),
        );
    }, renewEveryMs);

    try {
      await task(() => lockHeld);
    } finally {
      clearInterval(renew);
      await this.redis
        .releaseLock(lockKey, token)
        .catch((err: unknown) =>
          this.logger.warn(
            `Failed to release AI chat lock ${lockKey}: ${errorMessage(err)}`,
          ),
        );
    }
  }

  private async acquireChatLock(
    lockKey: string,
    token: string,
    ttlMs: number,
    waitMs: number,
  ): Promise<boolean> {
    const deadline = Date.now() + waitMs;
    let backoffMs = 50;
    for (;;) {
      if (await this.redis.tryLock(lockKey, token, ttlMs)) return true;
      const remaining = deadline - Date.now();
      if (remaining <= 0) return false;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(backoffMs, remaining)),
      );
      backoffMs = Math.min(backoffMs * 2, 1000);
    }
  }

  private async isHumanSilenceActive(
    userId: string,
    chatId: string,
  ): Promise<boolean> {
    const lastReply = await this.redis.getNumber(this.humanKey(userId, chatId));
    if (lastReply === null) return false;
    const silenceMs = envInt('AI_HUMAN_SILENCE_MINUTES', 20, 1) * 60 * 1000;
    return Date.now() - lastReply < silenceMs;
  }

  // The initial silence check happens before seconds of LLM awaits; re-check before each send
  private async humanTookOverSince(
    userId: string,
    chatId: string,
    flushStartedAt: number,
  ): Promise<boolean> {
    const lastReply = await this.redis.getNumber(this.humanKey(userId, chatId));
    if (lastReply === null) return false;
    const silenceMs = envInt('AI_HUMAN_SILENCE_MINUTES', 20, 1) * 60 * 1000;
    return Date.now() - lastReply < silenceMs || lastReply > flushStartedAt;
  }

  private async processMessage(
    text: string,
    chatId: string,
    companyId: string,
    userId: string,
    send: SendFn,
    pendingMessageIds: string[] = [],
    markRead?: MarkReadFn,
    isLockHeld: () => boolean = () => true,
  ): Promise<void> {
    // Re-checked at turn time: a queued turn can outlive AI being disabled, and must not spend a credit.
    if (!(await this.isEnabledFor(companyId))) {
      this.logger.log(
        `AI disabled for company ${companyId}; skipping queued turn for ${userId}:${chatId}`,
      );
      return;
    }
    if (await this.isHumanSilenceActive(userId, chatId)) return;

    // Baseline for detecting a human reply that lands mid-turn (after the awaits below).
    const flushStartedAt = Date.now();

    const { cleaned, needsDirectContact } = sanitizeInput(text);
    if (needsDirectContact) {
      // Same takeover guard other send paths use: skip if the operator jumped in mid-turn
      if (
        !isLockHeld() ||
        (await this.humanTookOverSince(userId, chatId, flushStartedAt))
      )
        return;
      await send(chatId, DIRECT_CONTACT_RESPONSE);
      return;
    }

    // Working copy: nothing writes back unless this turn replies, so a failed turn leaves history untouched.
    const stored = await this.redis.getJson<AiHistoryMessage[]>(
      this.histKey(userId, chatId),
    );
    const history =
      stored ??
      (await this.seedHistoryFromDb(
        companyId,
        userId,
        chatId,
        pendingMessageIds,
      ));

    let conversationId: string | null = null;
    let creditCharged = false;
    try {
      history.push({ role: 'user', content: cleaned });

      const [customPrompt, { company }] = await Promise.all([
        this.repo.getCompanyPrompt(companyId),
        this.repo.getCompanyAndUnits(companyId),
      ]);

      if (!company) {
        this.logger.error(`No company row for ${companyId}, AI turn refused`);
        return;
      }

      try {
        const resolved = await this.resolveLimitAndPeriod(company);
        const result = await this.repo.consumeConversationCredit(
          companyId,
          userId,
          chatId,
          resolved.limit,
          resolved.period,
        );

        if (!result.allowed) {
          this.logger.warn(
            `AI credits exhausted for company ${companyId} (allowance: ${resolved.limit})`,
          );
          void this.notifyCreditsExhausted(companyId, resolved.period.start);
          return;
        }

        conversationId = result.conversationId;
        creditCharged = result.charged;
      } catch (err) {
        // Fails closed: nothing was charged, running the turn anyway serves unmetered AI
        this.logger.error(
          'Credit check failed, refusing the AI turn',
          errorMessage(err),
        );
        return;
      }

      // Fire-and-forget: Meta requires the turn be certain to run before it shows typing at all.
      const newestInboundId = pendingMessageIds[pendingMessageIds.length - 1];
      if (markRead && newestInboundId) {
        void markRead(newestInboundId, true).catch((err: unknown) =>
          this.logger.debug(
            `Read receipt rider failed for ${userId}:${chatId}: ${errorMessage(err)}`,
          ),
        );
      }

      const { block: contextBlock, fallbackCurrency } =
        this.promptBuilder.buildContextBlock(company);
      const fullSystemPrompt = this.promptBuilder.buildFullPrompt(
        customPrompt,
        contextBlock,
      );
      const systemMessages: AiHistoryMessage[] = [
        { role: 'system', content: fullSystemPrompt },
      ];

      const firstRaw = await this.callLLM(
        [...systemMessages, ...history],
        TOOL_DEFINITIONS,
      );
      if (!firstRaw) return;
      const toolCall = parseToolCall(firstRaw);

      if (toolCall) {
        this.logger.log('Executing tool', {
          toolName: toolCall.name,
          companyId,
        });
        this.logger.debug('Tool args', {
          toolName: toolCall.name,
          args: toolCall.args,
        });
        const result = await executeTool(
          toolCall.name,
          toolCall.args,
          companyId,
          this.repo,
          this.promptBuilder,
          fallbackCurrency,
        );
        this.logger.log('Tool executed', {
          toolName: toolCall.name,
          resultSize: result.length,
        });
        this.logger.debug('Tool result', { toolName: toolCall.name, result });

        const firstMsg = firstRaw.choices[0].message;
        const assistantToolMsg: AiHistoryMessage = {
          role: 'assistant',
          content: firstMsg.content ?? null,
          tool_calls: firstMsg.tool_calls?.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: tc.function,
          })),
        };
        const toolResultMsg: AiHistoryMessage = {
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id,
        };

        const secondRaw = await this.callLLM([
          ...systemMessages,
          ...history,
          assistantToolMsg,
          toolResultMsg,
        ]);
        const reply = parseResponse(secondRaw);
        if (!reply) {
          this.logger.warn(
            'Second LLM call returned no text content after tool execution',
            { toolName: toolCall.name, companyId },
          );
          return;
        }

        if (
          !isLockHeld() ||
          (await this.humanTookOverSince(userId, chatId, flushStartedAt))
        ) {
          return;
        }

        history.push({ role: 'assistant', content: reply });
        await send(chatId, reply, { creditCharged });
        await this.recordDelivery(companyId, conversationId);
        if (!isLockHeld()) return;
        await this.persistHistory(userId, chatId, history);
        return;
      }

      const reply = parseResponse(firstRaw);
      if (!reply) return;

      if (
        !isLockHeld() ||
        (await this.humanTookOverSince(userId, chatId, flushStartedAt))
      ) {
        return;
      }

      history.push({ role: 'assistant', content: reply });
      await send(chatId, reply, { creditCharged });
      await this.recordDelivery(companyId, conversationId);
      if (!isLockHeld()) return;
      await this.persistHistory(userId, chatId, history);
    } catch (err) {
      const cause = errorCause(err);
      const causeStr =
        cause instanceof Error
          ? ` | cause: ${cause.name}: ${cause.message}`
          : '';
      this.logger.error(`AI call failed${causeStr}`, errorMessage(err, true));
    }
  }

  // Rebuilds history after restart or sweep; human-agent fromMe also maps to assistant
  private async seedHistoryFromDb(
    companyId: string,
    userId: string,
    chatId: string,
    excludeWaIds: string[],
  ): Promise<AiHistoryMessage[]> {
    // Zero is the documented way to disable seeding, so it is allowed through.
    const limit = envInt('AI_HISTORY_SEED_LIMIT', 20, 0);
    if (limit <= 0) return [];
    const maxChars = envInt('AI_HISTORY_SEED_MAX_CHARS', 8000, 1);

    try {
      const rows = await this.store.getChatHistory(
        companyId,
        userId,
        chatId,
        limit,
        excludeWaIds,
      );

      // Newest-first so the char budget drops the oldest, then restore chronological order.
      const seeded: AiHistoryMessage[] = [];
      let chars = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        const raw = (rows[i].body ?? '').trim();
        const content = rows[i].fromMe ? raw : sanitizeInput(raw).cleaned;
        if (!content) continue;
        if (chars + content.length > maxChars) break;
        chars += content.length;
        seeded.push({
          role: rows[i].fromMe ? 'assistant' : 'user',
          content,
        });
      }
      return seeded.reverse();
    } catch (err) {
      this.logger.error(
        'Failed to seed AI history from the database',
        errorMessage(err),
      );
      return [];
    }
  }

  private async notifyCreditsExhausted(
    companyId: string,
    periodStart: Date,
  ): Promise<void> {
    try {
      const claimed = await this.repo.claimExhaustedNotification(
        companyId,
        periodStart,
      );
      if (!claimed) return;
      await this.systemEmail.sendQuotaExceededToCompany(
        companyId,
        'AI credits',
        'The WhatsApp assistant has stopped replying to new conversations. Your agents can still reply manually, and the assistant resumes automatically when your credits reset.',
      );
    } catch (err) {
      this.logger.error(
        'Failed to send AI credits exhausted email',
        errorMessage(err),
      );
    }
  }

  private async recordDelivery(
    companyId: string,
    conversationId: string | null,
  ): Promise<void> {
    if (!conversationId) return;
    try {
      await this.repo.recordTurnDelivered(companyId, conversationId);
    } catch (err) {
      this.logger.error('Failed to record AI turn delivery', errorMessage(err));
    }
  }

  private async persistHistory(
    userId: string,
    chatId: string,
    history: AiHistoryMessage[],
  ): Promise<void> {
    const limit = envInt('AI_HISTORY_LIMIT', 40, 1);
    if (history.length > limit) history.splice(0, history.length - limit);
    await this.redis.setJson(
      this.histKey(userId, chatId),
      history,
      this.AI_STATE_TTL_MS,
    );
  }

  private async callLLM(
    messages: AiHistoryMessage[],
    tools?: ToolDefinition[],
  ): Promise<ChatCompletion | null> {
    const host = envString('OLLAMA_HOST');
    const key = envString('OLLAMA_API_KEY');
    const model = envString('OLLAMA_MODEL');
    if (!host || !key || !model) return null;

    const timeout = envInt('AI_REQUEST_TIMEOUT_MS', 300000, 1);
    // Zero means a single attempt, a legitimate setting.
    const maxRetries = envInt('AI_MAX_RETRIES', 2, 0);
    // Caps the whole call; per-attempt timeouts alone let retries x timeout hold the lock
    const budgetMs = envInt('AI_TOTAL_BUDGET_MS', 120000, 1);
    const deadline = Date.now() + budgetMs;
    const TRANSIENT_CODES = new Set([
      'EAI_AGAIN',
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
    ]);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const attemptMs = Math.min(timeout, Math.max(deadline - Date.now(), 1));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), attemptMs);

      try {
        const body: Record<string, unknown> = {
          model,
          messages,
          stream: true,
          temperature: envFloat('AI_TEMPERATURE', 0.7),
          top_p: envFloat('AI_TOP_P', 0.9),
        };
        if (tools && tools.length > 0) body['tools'] = tools;

        const res = await fetch(`${host}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const rawText = await res.text();
          this.logger.error(
            `LLM API error ${res.status} ${res.statusText}: ${rawText.slice(0, 500)}`,
          );
          return null;
        }

        return await this.readCompletionStream(res);
      } catch (err) {
        const cause = errorCause(err);
        const isTransient =
          cause?.code !== undefined && TRANSIENT_CODES.has(cause.code);
        const remaining = deadline - Date.now();

        if (isTransient && attempt < maxRetries && remaining > 0) {
          const delayMs = Math.min(500 * (attempt + 1), remaining);
          this.logger.warn(
            `LLM call failed (attempt ${attempt + 1}/${maxRetries + 1}): ${cause.message}, retrying in ${delayMs}ms`,
          );
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }
    return null;
  }

  // Tool-call ids and names arrive in the first delta; arguments stream across many.
  private async readCompletionStream(
    res: Response,
  ): Promise<ChatCompletion | null> {
    const reader = res.body?.getReader();
    if (!reader) return null;

    const decoder = new TextDecoder();
    let buf = '';
    let content = '';
    const toolCallMap: Record<
      number,
      {
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }
    > = {};

    try {
      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break outer;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;

            if (typeof delta.content === 'string') content += delta.content;

            if (Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const idx: number = tc.index ?? 0;
                if (!toolCallMap[idx]) {
                  toolCallMap[idx] = {
                    id: '',
                    type: 'function',
                    function: { name: '', arguments: '' },
                  };
                }
                if (tc.id && !toolCallMap[idx].id) toolCallMap[idx].id = tc.id;
                if (tc.function?.name && !toolCallMap[idx].function.name)
                  toolCallMap[idx].function.name = tc.function.name;
                if (tc.function?.arguments)
                  toolCallMap[idx].function.arguments += tc.function.arguments;
              }
            }
          } catch {
            /* malformed SSE chunk, skip */
          }
        }
      }
    } finally {
      // cancel(), not releaseLock(): body is not at EOF, an undrained body pins the socket
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }

    const tool_calls = Object.values(toolCallMap);
    return {
      choices: [
        {
          message: {
            role: 'assistant',
            content: content || null,
            ...(tool_calls.length > 0 ? { tool_calls } : {}),
          },
        },
      ],
    };
  }
}
