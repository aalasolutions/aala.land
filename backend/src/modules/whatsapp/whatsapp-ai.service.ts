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
import { SystemEmailService } from '@modules/email/system-email.service';
import { Company } from '@modules/companies/entities/company.entity';

export type SendFn = (
  chatId: string,
  message: string,
  meta?: { creditCharged: boolean },
) => Promise<{ messageId?: string }>;

// Read receipt plus the typing indicator that rides on it. Resolved by the processor
// alongside SendFn, so the AI service stays free of any transport dependency.
export type MarkReadFn = (
  messageId: string,
  withTyping: boolean,
) => Promise<void>;

// Conversation state lives in Redis so every replica sees the same history and the
// same human-takeover stamps. The debounce is a delayed BullMQ job per chat, so a
// pending turn survives a replica restart instead of dying with the process.
@Injectable()
export class WhatsappAiService {
  private readonly logger = new Logger(WhatsappAiService.name);
  private enabledByUser = new Map<string, boolean>();
  private readonly AI_STATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

  // Holds one turn's claimed messages until that turn ends, so a turn that dies before
  // replying can hand them back instead of eating them.
  private takeKey(userId: string, chatId: string): string {
    return `${this.pendKey(userId, chatId)}:take`;
  }

  // Turn counter for one chat. The job id carries it so a message arriving while a
  // turn is already running schedules the NEXT turn instead of colliding with the
  // job id of the one in flight (BullMQ dedupes same-id adds, which would have
  // silently dropped that reply).
  private seqKey(userId: string, chatId: string): string {
    return `wa:ai:seq:${userId}:${chatId}`;
  }

  private jobIdFor(userId: string, chatId: string, seq: number): string {
    return `${userId}:${chatId}:${seq}`;
  }

  private async currentSeq(userId: string, chatId: string): Promise<number> {
    return (await this.redis.getNumber(this.seqKey(userId, chatId))) ?? 0;
  }

  getConfig(userId: string) {
    return {
      enabled: this.isEnabled(userId),
      keyConfigured: !!process.env.OLLAMA_API_KEY,
      model: process.env.OLLAMA_MODEL ?? '',
      host: process.env.OLLAMA_HOST ?? '',
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

  async getConfigWithUsage(userId: string, companyId: string) {
    const base = {
      ...this.getConfig(userId),
      enabled: await this.isEnabledFor(userId, companyId),
    };
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

  isEnabled(userId: string): boolean {
    if (this.enabledByUser.has(userId)) return this.enabledByUser.get(userId)!;
    return process.env.AI_ENABLED !== 'false';
  }

  // Map miss means a fresh replica: load the stored toggle before gating, or a restart re-enables AI
  async isEnabledFor(userId: string, companyId: string): Promise<boolean> {
    if (!this.enabledByUser.has(userId)) {
      await this.loadEnabledState(userId, companyId);
    }
    return this.isEnabled(userId);
  }

  setEnabled(userId: string, value: boolean): boolean {
    this.enabledByUser.set(userId, value);
    return value;
  }

  async persistEnabled(
    userId: string,
    companyId: string,
    value: boolean,
  ): Promise<void> {
    this.enabledByUser.set(userId, value);
    try {
      await this.repo.persistAiEnabled(companyId, value);
    } catch (err) {
      this.logger.error(
        'Failed to persist aiEnabled',
        err instanceof Error ? err.message : err,
      );
    }
  }

  async loadEnabledState(userId: string, companyId: string): Promise<void> {
    if (this.enabledByUser.has(userId)) return;
    try {
      const enabled = await this.repo.loadAiEnabled(companyId);
      if (enabled !== null) this.enabledByUser.set(userId, enabled);
    } catch {
      /* non-fatal, the env default applies */
    }
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

  async clearUserState(userId: string): Promise<void> {
    const jobIds = await this.redis.setMembers(this.pendIdxKey(userId));
    for (const jobId of jobIds) {
      const job = await this.debounceQueue.getJob(jobId);
      if (job) await job.remove().catch(() => undefined);
    }
    await this.redis.del(this.pendIdxKey(userId));
    this.enabledByUser.delete(userId);
    await this.redis.delByPattern(this.pendKey(userId, '*'));
    await this.redis.delByPattern(this.seqKey(userId, '*'));
    await this.redis.delByPattern(this.histKey(userId, '*'));
    await this.redis.delByPattern(this.humanKey(userId, '*'));
  }

  // Called by whatsapp.service when the human operator manually sends a message.
  // Cancels any pending debounced AI response for that chat and starts a silence window.
  async recordHumanReply(userId: string, chatId: string): Promise<void> {
    await this.redis.setNumber(
      this.humanKey(userId, chatId),
      Date.now(),
      this.AI_STATE_TTL_MS,
    );
    await this.cancelPending(userId, chatId);
  }

  private async cancelPending(userId: string, chatId: string): Promise<void> {
    const jobId = this.jobIdFor(
      userId,
      chatId,
      await this.currentSeq(userId, chatId),
    );
    const job = await this.debounceQueue.getJob(jobId);
    if (job) await job.remove().catch(() => undefined);
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
    if (!process.env.OLLAMA_API_KEY) return;
    if (!(await this.isEnabledFor(userId, companyId))) return;
    if (evt.fromMe || evt.isGroup || !(evt.body ?? '').trim()) return;

    const maxAge = parseInt(process.env.AI_MESSAGE_MAX_AGE_S ?? '120', 10);
    if (Math.floor(Date.now() / 1000) - evt.timestamp > maxAge) return;

    const debounceMs = parseInt(process.env.AI_DEBOUNCE_MS ?? '10000', 10);
    const maxDebounceMs = parseInt(
      process.env.AI_DEBOUNCE_MAX_MS ?? '60000',
      10,
    );
    const maxPending = parseInt(process.env.AI_PENDING_MAX ?? '20', 10);
    const maxBodyChars = parseInt(
      process.env.AI_MESSAGE_MAX_CHARS ?? '4000',
      10,
    );
    const pendKey = this.pendKey(userId, evt.chatId);
    const body = evt.body.slice(0, maxBodyChars);

    // Buffer FIRST, then resolve the job id. If a turn claims the buffer in between,
    // the claim has already advanced the sequence, so this message schedules a fresh
    // turn rather than attaching to the one being flushed.
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

    if (existing) {
      // Deadline caps the extension: messaging faster than debounceMs would
      // otherwise restart the countdown forever and the turn would never run.
      const remaining = existing.data.deadlineAt - Date.now();
      try {
        if (remaining <= 0) await existing.promote();
        else await existing.changeDelay(Math.min(debounceMs, remaining));
        return;
      } catch {
        // The job left the delayed state between the sequence read and now, so it is
        // running or gone. Adding with that id would be deduped by BullMQ into a silent
        // no-op and strand this message, and merely re-reading the sequence still races
        // the claim's own increment. Advance it here instead: the id is then guaranteed
        // fresh. If the running claim also increments, the extra job finds an empty
        // buffer and no-ops.
        jobId = this.jobIdFor(
          userId,
          evt.chatId,
          await this.redis.incrCounter(
            this.seqKey(userId, evt.chatId),
            this.AI_STATE_TTL_MS,
          ),
        );
      }
    }

    await this.redis.setAdd(this.pendIdxKey(userId), jobId, this.AI_STATE_TTL_MS);
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

  // Atomically claims the buffered messages for one chat. RENAME means a message
  // arriving mid-flush starts a fresh buffer instead of being lost between the
  // read and the delete. The scratch key survives the read: only releaseClaimedBuffer
  // or restoreClaimedBuffer retires it, so a turn that throws can give the messages back.
  async takeDebouncedBuffer(
    data: Pick<DebounceJobData, 'userId' | 'chatId'>,
  ): Promise<DebouncedBuffer | null> {
    const source = this.pendKey(data.userId, data.chatId);
    const scratch = this.takeKey(data.userId, data.chatId);
    // Sequence first: a message landing between here and the rename either joins the
    // buffer this turn is about to claim, or schedules the next turn. Never both, never
    // neither. Incrementing after the rename leaves a window where it reads the id of
    // the job already running.
    const claimed = await this.redis.incrCounter(
      this.seqKey(data.userId, data.chatId),
      this.AI_STATE_TTL_MS,
    );
    if (!(await this.redis.renameKey(source, scratch))) return null;
    await this.redis.setRemove(
      this.pendIdxKey(data.userId),
      this.jobIdFor(data.userId, data.chatId, claimed - 1),
    );
    const raw = await this.redis.getList(scratch);
    if (raw.length === 0) {
      await this.redis.del(scratch);
      return null;
    }
    const parsed = raw.map(
      (entry) => JSON.parse(entry) as { body: string; id: string },
    );
    return {
      combinedText: parsed.map((p) => p.body).join('\n'),
      messageIds: parsed.map((p) => p.id),
    };
  }

  // The turn finished with the claim consumed: nothing left to hand back.
  async releaseClaimedBuffer(
    data: Pick<DebounceJobData, 'userId' | 'chatId'>,
  ): Promise<void> {
    await this.redis.del(this.takeKey(data.userId, data.chatId));
  }

  // The turn threw before it could reply, so the claimed messages go back into the
  // pending buffer and a fresh turn is armed for them.
  async restoreClaimedBuffer(data: DebounceJobData): Promise<void> {
    const scratch = this.takeKey(data.userId, data.chatId);
    const raw = await this.redis.getList(scratch);
    await this.redis.del(scratch);
    if (raw.length === 0) return;

    const pendKey = this.pendKey(data.userId, data.chatId);
    const maxPending = parseInt(process.env.AI_PENDING_MAX ?? '20', 10);
    // Appended, so a message that arrived while the turn was failing reads before these.
    for (const entry of raw) {
      if ((await this.redis.listLength(pendKey)) >= maxPending) {
        this.logger.warn(
          `Pending buffer full while restoring a failed turn for ${data.userId}:${data.chatId}`,
        );
        break;
      }
      await this.redis.pushList(pendKey, entry, this.AI_STATE_TTL_MS);
    }
    await this.scheduleRestoredTurn(data);
    this.logger.warn(
      `Restored ${raw.length} buffered message(s) for ${data.userId}:${data.chatId} after a failed turn`,
    );
  }

  private async scheduleRestoredTurn(data: DebounceJobData): Promise<void> {
    const debounceMs = parseInt(process.env.AI_DEBOUNCE_MS ?? '10000', 10);
    const maxDebounceMs = parseInt(
      process.env.AI_DEBOUNCE_MAX_MS ?? '60000',
      10,
    );
    // The claim already advanced the sequence, so this id is fresh. A job under it means
    // a message landed during the failure and has scheduled the turn already.
    const jobId = this.jobIdFor(
      data.userId,
      data.chatId,
      await this.currentSeq(data.userId, data.chatId),
    );
    if (await this.debounceQueue.getJob(jobId)) return;

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
    await this.runSerializedPerChat(`${userId}:${chatId}`, () =>
      this.processMessage(
        combinedText,
        chatId,
        companyId,
        userId,
        send,
        messageIds,
        markRead,
      ),
    );
  }

  // Runs `task` only while holding the chat's distributed lock, so turns for one chat
  // never overlap across replicas. Waiting rather than rejecting preserves the queueing
  // the in-process Promise chain used to give us: a follow-up message still gets answered.
  private async runSerializedPerChat(
    key: string,
    task: () => Promise<void>,
  ): Promise<void> {
    const lockKey = `wa:ai:lock:${key}`;
    const token = randomUUID();
    const ttlMs = parseInt(process.env.AI_LOCK_TTL_MS ?? '30000', 10);
    const waitMs = parseInt(process.env.AI_LOCK_WAIT_MS ?? '300000', 10);

    if (!(await this.acquireChatLock(lockKey, token, ttlMs, waitMs))) {
      this.logger.error(
        `Timed out waiting ${waitMs}ms for the AI chat lock on ${key}; this turn is dropped`,
      );
      return;
    }

    // A turn can outlive ttlMs (two LLM calls plus tool execution), so keep extending
    // while this replica is alive. If it dies the lock expires instead of wedging.
    const renewEveryMs = Math.max(Math.floor(ttlMs / 3), 1000);
    const renew = setInterval(() => {
      void this.redis
        .renewLock(lockKey, token, ttlMs)
        .then((ok) => {
          if (!ok)
            this.logger.error(
              `Lost the AI chat lock on ${key}; a concurrent turn is now possible`,
            );
        })
        .catch((err: unknown) =>
          this.logger.error(
            `Lock renewal failed on ${key}: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }, renewEveryMs);

    try {
      await task();
    } finally {
      clearInterval(renew);
      await this.redis.releaseLock(lockKey, token).catch(() => undefined);
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
    const silenceMs =
      parseInt(process.env.AI_HUMAN_SILENCE_MINUTES ?? '20', 10) * 60 * 1000;
    return Date.now() - lastReply < silenceMs;
  }

  // A human reply that landed AFTER this AI turn started reading the chat means the
  // operator has taken over mid-stream. The initial isHumanSilenceActive() check at the
  // top of processMessage happens before several seconds of LLM awaits, so we must
  // re-check immediately before each send() and abort if the human jumped in.
  private async humanTookOverSince(
    userId: string,
    chatId: string,
    flushStartedAt: number,
  ): Promise<boolean> {
    const lastReply = await this.redis.getNumber(this.humanKey(userId, chatId));
    if (lastReply === null) return false;
    const silenceMs =
      parseInt(process.env.AI_HUMAN_SILENCE_MINUTES ?? '20', 10) * 60 * 1000;
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
  ): Promise<void> {
    if (await this.isHumanSilenceActive(userId, chatId)) return;

    // Baseline for detecting a human reply that lands mid-turn (after the awaits below).
    const flushStartedAt = Date.now();

    const { cleaned, needsDirectContact } = sanitizeInput(text);
    if (needsDirectContact) {
      // Same mid-turn human-takeover guard the other send paths use: if the operator
      // jumped in after this turn started, do not send the canned direct-contact reply.
      if (await this.humanTookOverSince(userId, chatId, flushStartedAt)) return;
      await send(chatId, DIRECT_CONTACT_RESPONSE);
      return;
    }

    // Working copy only. Nothing is written back unless this turn delivers a reply,
    // so an aborted or failed turn leaves the stored history exactly as it was.
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
        // Fail closed. The transaction rolled back so nothing was charged, and running
        // the turn anyway would serve unmetered AI for as long as the fault lasts.
        this.logger.error(
          'Credit check failed, refusing the AI turn',
          err instanceof Error ? err.message : err,
        );
        return;
      }

      // The turn is now certain to run, which is Meta's condition for showing typing at
      // all. The rider marks the newest claimed inbound message read; a one-to-one chat
      // marks every earlier message with it. Fire and forget: markRead logs its own
      // failures and a missing indicator is never worth losing the reply over.
      const newestInboundId = pendingMessageIds[pendingMessageIds.length - 1];
      if (markRead && newestInboundId) {
        void markRead(newestInboundId, true).catch(() => undefined);
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
          tool_calls: firstMsg.tool_calls,
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

        if (await this.humanTookOverSince(userId, chatId, flushStartedAt)) {
          return;
        }

        history.push({ role: 'assistant', content: reply });
        await send(chatId, reply, { creditCharged });
        await this.recordDelivery(companyId, conversationId);
        await this.persistHistory(userId, chatId, history);
        return;
      }

      const reply = parseResponse(firstRaw);
      if (!reply) return;

      if (await this.humanTookOverSince(userId, chatId, flushStartedAt)) {
        return;
      }

      history.push({ role: 'assistant', content: reply });
      await send(chatId, reply, { creditCharged });
      await this.recordDelivery(companyId, conversationId);
      await this.persistHistory(userId, chatId, history);
    } catch (err) {
      const cause = (err as any)?.cause;
      const causeStr =
        cause instanceof Error
          ? ` | cause: ${cause.name}: ${cause.message}`
          : '';
      this.logger.error(
        `AI call failed${causeStr}`,
        err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
      );
    }
  }

  // Rebuilds history after a restart or the 24h sweep. fromMe maps to `assistant` for
  // human-agent messages too, so the AI inherits what an agent promised.
  private async seedHistoryFromDb(
    companyId: string,
    userId: string,
    chatId: string,
    excludeWaIds: string[],
  ): Promise<AiHistoryMessage[]> {
    const limit = parseInt(process.env.AI_HISTORY_SEED_LIMIT ?? '20', 10);
    if (!Number.isFinite(limit) || limit <= 0) return [];
    const parsedMaxChars = parseInt(
      process.env.AI_HISTORY_SEED_MAX_CHARS ?? '8000',
      10,
    );
    const maxChars =
      Number.isFinite(parsedMaxChars) && parsedMaxChars > 0
        ? parsedMaxChars
        : 8000;

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
        const content = (rows[i].body ?? '').trim();
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
        err instanceof Error ? err.message : err,
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
        err instanceof Error ? err.message : err,
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
      this.logger.error(
        'Failed to record AI turn delivery',
        err instanceof Error ? err.message : err,
      );
    }
  }

  private async persistHistory(
    userId: string,
    chatId: string,
    history: AiHistoryMessage[],
  ): Promise<void> {
    const limit = parseInt(process.env.AI_HISTORY_LIMIT ?? '40', 10);
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
    const {
      OLLAMA_HOST: host,
      OLLAMA_API_KEY: key,
      OLLAMA_MODEL: model,
    } = process.env;
    if (!host || !key || !model) return null;

    const timeout = parseInt(process.env.AI_REQUEST_TIMEOUT_MS ?? '300000', 10);
    const maxRetries = parseInt(process.env.AI_MAX_RETRIES ?? '2', 10);
    // Per-attempt timeouts alone let one turn hold a spent credit and the chat lock for
    // retries x timeout, so cap the whole call instead.
    const budgetMs = parseInt(process.env.AI_TOTAL_BUDGET_MS ?? '120000', 10);
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
        const body: Record<string, any> = {
          model,
          messages,
          stream: true,
          temperature: parseFloat(process.env.AI_TEMPERATURE ?? '0.7'),
          top_p: parseFloat(process.env.AI_TOP_P ?? '0.9'),
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
        const cause = (err as any)?.cause;
        const isTransient = cause && TRANSIENT_CODES.has((cause as any).code);
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
      // cancel(), not just releaseLock(): after `break outer` the body is not at EOF
      // and an undrained body pins its undici socket until GC.
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
