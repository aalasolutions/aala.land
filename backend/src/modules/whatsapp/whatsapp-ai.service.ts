import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AiHistoryMessage } from './wa-types';
import { WhatsappAiRepositoryService } from './whatsapp-ai-repository.service';
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
  SubscriptionTier,
  TIER_LIMITS,
} from '../companies/entities/company.entity';

type SendFn = (
  chatId: string,
  message: string,
) => Promise<{ messageId?: string }>;

interface PendingChat {
  messages: string[];
  chatId: string;
  companyId: string;
  userId: string;
  send: SendFn;
  timer: ReturnType<typeof setTimeout>;
}

// NOTE: Single-instance only — all Maps below are process-local and not shared across replicas.
// If horizontal scaling is needed, move histories/humanReplyAt to the shared Redis store.
@Injectable()
export class WhatsappAiService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappAiService.name);
  private histories = new Map<string, AiHistoryMessage[]>();
  private enabledByUser = new Map<string, boolean>();
  private pendingByChat = new Map<string, PendingChat>();
  private humanReplyAt = new Map<string, number>();
  private lastActivityAt = new Map<string, number>();
  // Serializes AI turns per chat (keyed by `${userId}:${chatId}`). Each turn chains
  // after the previous one for the same key, so only ONE processMessage runs at a time
  // per chat. This prevents two concurrent turns from interleaving push/pop/splice on the
  // shared history array or double-counting the weekly quota when a follow-up message
  // arrives mid-turn (after the pending entry was already flushed).
  private chatLocks = new Map<string, Promise<void>>();
  private readonly AI_STATE_TTL_MS = 24 * 60 * 60 * 1000;
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly repo: WhatsappAiRepositoryService,
    private readonly promptBuilder: WhatsappAiPromptBuilderService,
  ) {}

  onModuleInit(): void {
    this.sweepInterval = setInterval(
      () => this.sweepStaleState(),
      60 * 60 * 1000,
    );
  }

  onModuleDestroy(): void {
    if (this.sweepInterval) clearInterval(this.sweepInterval);
  }

  private sweepStaleState(): void {
    const cutoff = Date.now() - this.AI_STATE_TTL_MS;
    for (const [key, lastActive] of this.lastActivityAt.entries()) {
      if (lastActive < cutoff) {
        this.histories.delete(key);
        this.humanReplyAt.delete(key);
        this.lastActivityAt.delete(key);
      }
    }
  }

  getConfig(userId: string) {
    return {
      enabled: this.isEnabled(userId),
      keyConfigured: !!process.env.OLLAMA_API_KEY,
      model: process.env.OLLAMA_MODEL ?? '',
      host: process.env.OLLAMA_HOST ?? '',
    };
  }

  async getWeeklyCount(
    companyId: string,
  ): Promise<{ used: number; limit: number } | null> {
    const { company } = await this.repo.getCompanyAndUnits(companyId);
    const tier = company?.subscriptionTier ?? SubscriptionTier.FREE;
    const weeklyLimit = TIER_LIMITS[tier].aiWeeklyMessages;
    if (weeklyLimit === Infinity) return null;
    const { count } = await this.repo.getWeeklyUsage(companyId);
    return { used: count, limit: weeklyLimit };
  }

  async getConfigWithUsage(userId: string, companyId: string) {
    const base = this.getConfig(userId);
    const { company } = await this.repo.getCompanyAndUnits(companyId);
    const tier = company?.subscriptionTier ?? SubscriptionTier.FREE;
    const weeklyLimit = TIER_LIMITS[tier].aiWeeklyMessages;

    if (weeklyLimit === Infinity) {
      return {
        ...base,
        weeklyLimit: null,
        weeklyUsed: null,
        weeklyResetsAt: null,
      };
    }

    const { count, windowStart } = await this.repo.getWeeklyUsage(companyId);
    const weeklyResetsAt = windowStart
      ? new Date(windowStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    return { ...base, weeklyLimit, weeklyUsed: count, weeklyResetsAt };
  }

  isEnabled(userId: string): boolean {
    if (this.enabledByUser.has(userId)) return this.enabledByUser.get(userId)!;
    return process.env.AI_ENABLED !== 'false';
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
      /* non-fatal — env default applies */
    }
  }

  getHistoryFor(userId: string, chatId: string): AiHistoryMessage[] {
    return this.histories.get(`${userId}:${chatId}`) ?? [];
  }

  clearPromptCache(companyId?: string): void {
    this.repo.clearPromptCache(companyId);
    this.repo.clearContextCache(companyId);
  }

  clearUserState(userId: string): void {
    for (const key of this.histories.keys()) {
      if (key.startsWith(`${userId}:`)) this.histories.delete(key);
    }
    for (const [key, pending] of this.pendingByChat.entries()) {
      if (key.startsWith(`${userId}:`)) {
        clearTimeout(pending.timer);
        this.pendingByChat.delete(key);
      }
    }
    for (const key of this.humanReplyAt.keys()) {
      if (key.startsWith(`${userId}:`)) this.humanReplyAt.delete(key);
    }
    this.enabledByUser.delete(userId);
  }

  // Called by whatsapp.service when the human operator manually sends a message.
  // Cancels any pending debounced AI response for that chat and starts a silence window.
  recordHumanReply(userId: string, chatId: string): void {
    this.humanReplyAt.set(`${userId}:${chatId}`, Date.now());
    const pendingKey = `${userId}:${chatId}`;
    const pending = this.pendingByChat.get(pendingKey);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingByChat.delete(pendingKey);
    }
  }

  async handleIncomingMessage(
    evt: {
      chatId: string;
      body: string;
      fromMe: boolean;
      isGroup: boolean;
      timestamp: number;
      senderId: string;
    },
    companyId: string,
    userId: string,
    send: SendFn,
  ): Promise<void> {
    if (!this.isEnabled(userId) || !process.env.OLLAMA_API_KEY) return;
    if (evt.fromMe || evt.isGroup || !(evt.body ?? '').trim()) return;

    const maxAge = parseInt(process.env.AI_MESSAGE_MAX_AGE_S ?? '120', 10);
    if (Math.floor(Date.now() / 1000) - evt.timestamp > maxAge) return;

    const debounceMs = parseInt(process.env.AI_DEBOUNCE_MS ?? '5000', 10);
    const pendingKey = `${userId}:${evt.chatId}`;

    const existing = this.pendingByChat.get(pendingKey);
    if (existing) {
      clearTimeout(existing.timer);
      existing.messages.push(evt.body);
      existing.timer = setTimeout(() => {
        void this.flushPending(pendingKey);
      }, debounceMs);
    } else {
      const timer = setTimeout(() => {
        void this.flushPending(pendingKey);
      }, debounceMs);
      this.pendingByChat.set(pendingKey, {
        messages: [evt.body],
        chatId: evt.chatId,
        companyId,
        userId,
        send,
        timer,
      });
    }
  }

  private async flushPending(pendingKey: string): Promise<void> {
    const pending = this.pendingByChat.get(pendingKey);
    this.pendingByChat.delete(pendingKey);
    if (!pending) return;

    const combinedText = pending.messages.join('\n');
    await this.runSerializedPerChat(`${pending.userId}:${pending.chatId}`, () =>
      this.processMessage(
        combinedText,
        pending.chatId,
        pending.companyId,
        pending.userId,
        pending.send,
      ),
    );
  }

  // Runs `task` after any in-flight turn for the same chat key has settled, so turns for
  // one chat never overlap. The chain link is stored back in `chatLocks`; the map entry is
  // cleaned up once this link is the tail (nothing else queued behind it).
  private runSerializedPerChat(
    key: string,
    task: () => Promise<void>,
  ): Promise<void> {
    const prior = this.chatLocks.get(key) ?? Promise.resolve();
    // Wait for the prior turn to finish (regardless of its outcome), then run this one.
    const run = prior.catch(() => undefined).then(task);
    // Never let a rejection poison the chain for the next turn.
    const link = run.catch(() => undefined);
    this.chatLocks.set(key, link);
    void link.then(() => {
      // Only clear if no newer turn has replaced us as the tail.
      if (this.chatLocks.get(key) === link) this.chatLocks.delete(key);
    });
    return run;
  }

  private isHumanSilenceActive(userId: string, chatId: string): boolean {
    const lastReply = this.humanReplyAt.get(`${userId}:${chatId}`);
    if (lastReply === undefined) return false;
    const silenceMs =
      parseInt(process.env.AI_HUMAN_SILENCE_MINUTES ?? '20', 10) * 60 * 1000;
    return Date.now() - lastReply < silenceMs;
  }

  // A human reply that landed AFTER this AI turn started reading the chat means the
  // operator has taken over mid-stream. The initial isHumanSilenceActive() check at the
  // top of processMessage happens before several seconds of LLM awaits, so we must
  // re-check immediately before each send() and abort if the human jumped in.
  private humanTookOverSince(
    userId: string,
    chatId: string,
    flushStartedAt: number,
  ): boolean {
    if (this.isHumanSilenceActive(userId, chatId)) return true;
    const lastReply = this.humanReplyAt.get(`${userId}:${chatId}`);
    return lastReply !== undefined && lastReply > flushStartedAt;
  }

  private async processMessage(
    text: string,
    chatId: string,
    companyId: string,
    userId: string,
    send: SendFn,
  ): Promise<void> {
    if (this.isHumanSilenceActive(userId, chatId)) return;

    // Baseline for detecting a human reply that lands mid-turn (after the awaits below).
    const flushStartedAt = Date.now();

    const { cleaned, needsDirectContact } = sanitizeInput(text);
    if (needsDirectContact) {
      // Same mid-turn human-takeover guard the other send paths use: if the operator
      // jumped in after this turn started, do not send the canned direct-contact reply.
      if (this.humanTookOverSince(userId, chatId, flushStartedAt)) return;
      await send(chatId, DIRECT_CONTACT_RESPONSE);
      return;
    }

    const histKey = `${userId}:${chatId}`;
    let history = this.histories.get(histKey);
    if (!history) {
      history = [];
      this.histories.set(histKey, history);
    }

    // Index-safe recovery baseline: the number of messages present BEFORE this turn
    // appended anything. On any early-return or error we truncate back to exactly this
    // length, removing only what this turn added — never the "last N" (which a concurrent
    // turn could have contributed). Serialization already prevents overlap, but this makes
    // the recovery correct even if the assumption is ever violated.
    const historyLenBefore = history.length;

    let assistantPushed = false;
    let quotaIncremented = false;
    try {
      history.push({ role: 'user', content: cleaned });

      const [customPrompt, { company }] = await Promise.all([
        this.repo.getCompanyPrompt(companyId),
        this.repo.getCompanyAndUnits(companyId),
      ]);

      const tier = company?.subscriptionTier ?? SubscriptionTier.FREE;
      const weeklyLimit = TIER_LIMITS[tier].aiWeeklyMessages;
      if (weeklyLimit !== Infinity) {
        try {
          const { allowed } = await this.repo.checkLimitAndIncrement(
            companyId,
            weeklyLimit,
          );
          if (allowed) quotaIncremented = true;
          if (!allowed) {
            this.logger.warn(
              `Weekly AI limit exceeded for company ${companyId} (limit: ${weeklyLimit})`,
            );
            this.rollbackTurn(history, historyLenBefore);
            return;
          }
        } catch (err) {
          this.logger.error(
            'Weekly limit check failed — allowing message',
            err instanceof Error ? err.message : err,
          );
        }
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
      if (!firstRaw) {
        this.revertQuotaIfNeeded(companyId, quotaIncremented);
        this.rollbackTurn(history, historyLenBefore);
        return;
      }
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
          this.revertQuotaIfNeeded(companyId, quotaIncremented);
          this.rollbackTurn(history, historyLenBefore);
          return;
        }

        if (this.humanTookOverSince(userId, chatId, flushStartedAt)) {
          this.revertQuotaIfNeeded(companyId, quotaIncremented);
          this.rollbackTurn(history, historyLenBefore);
          return;
        }

        history.push({ role: 'assistant', content: reply });
        assistantPushed = true;
        await send(chatId, reply);
        this.trimHistory(userId, chatId, history);
        return;
      }

      const reply = parseResponse(firstRaw);
      if (!reply) {
        this.revertQuotaIfNeeded(companyId, quotaIncremented);
        this.rollbackTurn(history, historyLenBefore);
        return;
      }

      if (this.humanTookOverSince(userId, chatId, flushStartedAt)) {
        this.revertQuotaIfNeeded(companyId, quotaIncremented);
        this.rollbackTurn(history, historyLenBefore);
        return;
      }

      history.push({ role: 'assistant', content: reply });
      assistantPushed = true;
      await send(chatId, reply);
      this.trimHistory(userId, chatId, history);
    } catch (err) {
      // On failure, the quota is only reverted if the send never happened.
      if (!assistantPushed)
        this.revertQuotaIfNeeded(companyId, quotaIncremented);
      // Index-safe rollback: remove exactly what this turn appended (the user message, and
      // the assistant reply if it was pushed) by truncating to the captured baseline,
      // instead of assuming this turn's messages are the last -2 entries.
      this.rollbackTurn(history, historyLenBefore);
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

  private rollbackTurn(history: AiHistoryMessage[], lenBefore: number): void {
    if (history.length > lenBefore) history.length = lenBefore;
  }

  private revertQuotaIfNeeded(
    companyId: string,
    quotaIncremented: boolean,
  ): void {
    if (!quotaIncremented) return;
    this.repo
      .decrementWeeklyCount(companyId)
      .catch((err) =>
        this.logger.error(
          'Failed to revert weekly quota',
          err instanceof Error ? err.message : err,
        ),
      );
  }

  private trimHistory(
    userId: string,
    chatId: string,
    history: AiHistoryMessage[],
  ): void {
    const limit = parseInt(process.env.AI_HISTORY_LIMIT ?? '40', 10);
    if (history.length > limit) history.splice(0, history.length - limit);
    const key = `${userId}:${chatId}`;
    this.histories.set(key, history);
    this.lastActivityAt.set(key, Date.now());
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
    const maxRetries = 5;
    const TRANSIENT_CODES = new Set([
      'EAI_AGAIN',
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
    ]);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

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
          clearTimeout(timer);
          const rawText = await res.text();
          this.logger.error(
            `LLM API error ${res.status} ${res.statusText}: ${rawText.slice(0, 500)}`,
          );
          return null;
        }

        // Stream SSE chunks and accumulate into a single response object
        const reader = res.body?.getReader();
        if (!reader) {
          clearTimeout(timer);
          return null;
        }

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
                    // id and name arrive only in the first delta chunk — assign once
                    if (tc.id && !toolCallMap[idx].id)
                      toolCallMap[idx].id = tc.id;
                    if (tc.function?.name && !toolCallMap[idx].function.name)
                      toolCallMap[idx].function.name = tc.function.name;
                    // arguments are streamed across multiple chunks — concatenate
                    if (tc.function?.arguments)
                      toolCallMap[idx].function.arguments +=
                        tc.function.arguments;
                  }
                }
              } catch {
                /* malformed SSE chunk — skip */
              }
            }
          }
        } finally {
          clearTimeout(timer);
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
      } catch (err) {
        clearTimeout(timer);
        const cause = (err as any)?.cause;
        const isTransient = cause && TRANSIENT_CODES.has((cause as any).code);

        if (isTransient && attempt < maxRetries) {
          const delayMs = 500 * (attempt + 1);
          this.logger.warn(
            `LLM call failed (attempt ${attempt + 1}/${maxRetries + 1}): ${cause.message} — retrying in ${delayMs}ms`,
          );
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        throw err;
      }
    }
    return null;
  }
}
