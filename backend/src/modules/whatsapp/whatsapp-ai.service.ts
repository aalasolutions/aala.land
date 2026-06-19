import { Injectable, Logger } from '@nestjs/common';
import { AiHistoryMessage } from './wa-types';
import { WhatsappAiRepositoryService } from './whatsapp-ai-repository.service';
import { WhatsappAiPromptBuilderService } from './whatsapp-ai-prompt-builder.service';
import { sanitizeInput, parseResponse, DIRECT_CONTACT_RESPONSE } from './whatsapp-ai-filter';
import { SubscriptionTier, TIER_LIMITS } from '../companies/entities/company.entity';

type SendFn = (chatId: string, message: string) => Promise<{ messageId?: string }>;

interface PendingChat {
  messages: string[];
  chatId: string;
  companyId: string;
  userId: string;
  send: SendFn;
  timer: ReturnType<typeof setTimeout>;
}

@Injectable()
export class WhatsappAiService {
  private readonly logger = new Logger(WhatsappAiService.name);
  private histories = new Map<string, AiHistoryMessage[]>();
  private enabledByUser = new Map<string, boolean>();
  private pendingByChat = new Map<string, PendingChat>();
  private humanReplyAt = new Map<string, number>();

  constructor(
    private readonly repo: WhatsappAiRepositoryService,
    private readonly promptBuilder: WhatsappAiPromptBuilderService,
  ) {}

  getConfig(userId: string) {
    return {
      enabled: this.isEnabled(userId),
      keyConfigured: !!(process.env.OLLAMA_API_KEY),
      model: process.env.OLLAMA_MODEL ?? '',
      host: process.env.OLLAMA_HOST ?? '',
    };
  }

  async getWeeklyCount(companyId: string): Promise<{ used: number; limit: number } | null> {
    const { company } = await this.repo.getCompanyAndListings(companyId);
    const tier = company?.subscriptionTier ?? SubscriptionTier.FREE;
    const weeklyLimit = TIER_LIMITS[tier].aiWeeklyMessages;
    if (weeklyLimit === Infinity) return null;
    const { count } = await this.repo.getWeeklyUsage(companyId);
    return { used: count, limit: weeklyLimit };
  }

  async getConfigWithUsage(userId: string, companyId: string) {
    const base = this.getConfig(userId);
    const { company } = await this.repo.getCompanyAndListings(companyId);
    const tier = company?.subscriptionTier ?? SubscriptionTier.FREE;
    const weeklyLimit = TIER_LIMITS[tier].aiWeeklyMessages;

    if (weeklyLimit === Infinity) {
      return { ...base, weeklyLimit: null, weeklyUsed: null, weeklyResetsAt: null };
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

  async persistEnabled(userId: string, companyId: string, value: boolean): Promise<void> {
    this.enabledByUser.set(userId, value);
    try {
      await this.repo.persistAiEnabled(companyId, value);
    } catch (err) {
      this.logger.error('Failed to persist aiEnabled', err instanceof Error ? err.message : err);
    }
  }

  async loadEnabledState(userId: string, companyId: string): Promise<void> {
    if (this.enabledByUser.has(userId)) return;
    try {
      const enabled = await this.repo.loadAiEnabled(companyId);
      if (enabled !== null) this.enabledByUser.set(userId, enabled);
    } catch { /* non-fatal — env default applies */ }
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
    evt: { chatId: string; body: string; fromMe: boolean; isGroup: boolean; timestamp: number; senderId: string },
    companyId: string,
    userId: string,
    send: SendFn,
  ): Promise<void> {
    if (!this.isEnabled(userId) || !process.env.OLLAMA_API_KEY) return;
    if (evt.fromMe || evt.isGroup || !evt.body.trim()) return;

    const maxAge = parseInt(process.env.AI_MESSAGE_MAX_AGE_S ?? '120', 10);
    if (Math.floor(Date.now() / 1000) - evt.timestamp > maxAge) return;

    const debounceMs = parseInt(process.env.AI_DEBOUNCE_MS ?? '5000', 10);
    const pendingKey = `${userId}:${evt.chatId}`;

    const existing = this.pendingByChat.get(pendingKey);
    if (existing) {
      clearTimeout(existing.timer);
      existing.messages.push(evt.body);
      existing.timer = setTimeout(() => { void this.flushPending(pendingKey); }, debounceMs);
    } else {
      const timer = setTimeout(() => { void this.flushPending(pendingKey); }, debounceMs);
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
    await this.processMessage(combinedText, pending.chatId, pending.companyId, pending.userId, pending.send);
  }

  private isHumanSilenceActive(userId: string, chatId: string): boolean {
    const lastReply = this.humanReplyAt.get(`${userId}:${chatId}`);
    if (lastReply === undefined) return false;
    const silenceMs = parseInt(process.env.AI_HUMAN_SILENCE_MINUTES ?? '20', 10) * 60 * 1000;
    return Date.now() - lastReply < silenceMs;
  }

  private async processMessage(
    text: string,
    chatId: string,
    companyId: string,
    userId: string,
    send: SendFn,
  ): Promise<void> {
    if (this.isHumanSilenceActive(userId, chatId)) return;

    const { cleaned, needsDirectContact } = sanitizeInput(text);
    if (needsDirectContact) {
      await send(chatId, DIRECT_CONTACT_RESPONSE);
      return;
    }

    const histKey = `${userId}:${chatId}`;
    let history = this.histories.get(histKey);
    if (!history) { history = []; this.histories.set(histKey, history); }

    let assistantPushed = false;
    try {
      history.push({ role: 'user', content: cleaned });

      const [customPrompt, { company, listings }] = await Promise.all([
        this.repo.getCompanyPrompt(companyId),
        this.repo.getCompanyAndListings(companyId),
      ]);

      const tier = company?.subscriptionTier ?? SubscriptionTier.FREE;
      const weeklyLimit = TIER_LIMITS[tier].aiWeeklyMessages;
      if (weeklyLimit !== Infinity) {
        try {
          const { allowed } = await this.repo.checkLimitAndIncrement(companyId, weeklyLimit);
          if (!allowed) {
            history.pop();
            return;
          }
        } catch (err) {
          this.logger.error('Weekly limit check failed — allowing message', err instanceof Error ? err.message : err);
        }
      }
      const units = listings.length === 0 ? await this.repo.getAvailableUnits(companyId) : [];
      const contextBlock = this.promptBuilder.buildContextBlock(company, listings, units);
      const fullSystemPrompt = this.promptBuilder.buildFullPrompt(customPrompt, contextBlock);

      const rawResponse = await this.callLLM([{ role: 'system', content: fullSystemPrompt }, ...history]);
      const reply = parseResponse(rawResponse);
      if (!reply) {
        history.pop();
        return;
      }

      history.push({ role: 'assistant', content: reply });
      this.trimHistory(userId, chatId, history);
      assistantPushed = true;

      await send(chatId, reply);
    } catch (err) {
      if (assistantPushed) history.splice(-2, 2);
      else history.pop();
      this.logger.error('AI call failed', err instanceof Error ? err.message : err);
    }
  }

  private trimHistory(userId: string, chatId: string, history: AiHistoryMessage[]): void {
    const limit = parseInt(process.env.AI_HISTORY_LIMIT ?? '40', 10);
    if (history.length > limit) history.splice(0, history.length - limit);
    this.histories.set(`${userId}:${chatId}`, history);
  }

  private async callLLM(messages: AiHistoryMessage[]): Promise<any> {
    const { OLLAMA_HOST: host, OLLAMA_API_KEY: key, OLLAMA_MODEL: model } = process.env;
    if (!host || !key || !model) return null;

    const timeout = parseInt(process.env.AI_REQUEST_TIMEOUT_MS ?? '30000', 10);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(`${host}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model, messages,
          temperature: parseFloat(process.env.AI_TEMPERATURE ?? '0.7'),
          top_p: parseFloat(process.env.AI_TOP_P ?? '0.9'),
        }),
        signal: controller.signal,
      });
      const data = await res.json() as any;
      if (!res.ok) {
        this.logger.error(`LLM API error ${res.status}: ${data?.error?.message ?? JSON.stringify(data)}`);
        return null;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }
}
