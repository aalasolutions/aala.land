import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiHistoryMessage } from './wa-types';
import { WhatsappSettings } from './entities/whatsapp-settings.entity';
import { WhatsappContextService } from './whatsapp-context.service';

interface PromptCacheEntry {
  prompt: string | null;
  cachedAt: number;
  ttl: number;
}

@Injectable()
export class WhatsappAiService {
  private readonly logger = new Logger(WhatsappAiService.name);
  private histories = new Map<string, AiHistoryMessage[]>();
  private promptCache = new Map<string, PromptCacheEntry>();
  private readonly CACHE_TTL_MS = 2 * 60 * 1000;
  private readonly NULL_CACHE_TTL_MS = 30 * 1000;
  private enabledByUser = new Map<string, boolean>();

  constructor(
    @InjectRepository(WhatsappSettings)
    private readonly settingsRepo: Repository<WhatsappSettings>,
    private readonly contextService: WhatsappContextService,
  ) {}

  getConfig(userId: string) {
    return {
      enabled: this.isEnabled(userId),
      keyConfigured: !!(process.env.OLLAMA_API_KEY),
      model: process.env.OLLAMA_MODEL ?? '',
      host: process.env.OLLAMA_HOST ?? '',
    };
  }

  isEnabled(userId: string): boolean {
    if (this.enabledByUser.has(userId)) return this.enabledByUser.get(userId)!;
    return process.env.AI_ENABLED !== 'false';
  }

  setEnabled(userId: string, value: boolean): boolean {
    this.enabledByUser.set(userId, value);
    return value;
  }

  getHistoryFor(userId: string, chatId: string): AiHistoryMessage[] {
    return this.histories.get(`${userId}:${chatId}`) ?? [];
  }

  clearPromptCache(companyId?: string): void {
    companyId ? this.promptCache.delete(companyId) : this.promptCache.clear();
    this.contextService.clearCache(companyId);
  }

  clearUserState(userId: string): void {
    for (const key of this.histories.keys()) {
      if (key.startsWith(`${userId}:`)) this.histories.delete(key);
    }
    this.enabledByUser.delete(userId);
  }

  async handleIncomingMessage(
    evt: { chatId: string; body: string; fromMe: boolean; isGroup: boolean; timestamp: number; senderId: string },
    companyId: string,
    userId: string,
    send: (chatId: string, message: string) => Promise<{ messageId?: string }>,
  ): Promise<void> {
    if (!this.isEnabled(userId) || !process.env.OLLAMA_API_KEY) return;
    if (evt.fromMe || evt.isGroup || !evt.body.trim()) return;

    const maxAge = parseInt(process.env.AI_MESSAGE_MAX_AGE_S ?? '120', 10);
    if (Math.floor(Date.now() / 1000) - evt.timestamp > maxAge) return;

    const histKey = `${userId}:${evt.chatId}`;
    let history = this.histories.get(histKey);
    if (!history) { history = []; this.histories.set(histKey, history); }

    let assistantPushed = false;
    try {
      history.push({ role: 'user', content: evt.body });

      const [systemPrompt, contextBlock] = await Promise.all([
        this.getCompanyPrompt(companyId),
        this.contextService.getContextBlock(companyId),
      ]);
      const fullSystemPrompt = contextBlock
        ? `${systemPrompt}\n\n${contextBlock}`
        : systemPrompt;
      const reply = await this.callLLM([{ role: 'system', content: fullSystemPrompt }, ...history]);
      if (!reply) {
        history.pop();  // remove orphaned user turn
        return;
      }

      history.push({ role: 'assistant', content: reply });
      this.trimHistory(userId, evt.chatId, history);  // single trim after both pushes
      assistantPushed = true;

      await send(evt.chatId, reply);
    } catch (err) {
      if (assistantPushed) history.splice(-2, 2); // remove user + assistant
      else history.pop();                          // remove user only
      this.logger.error('AI call failed', err instanceof Error ? err.message : err);
    }
  }

  private async getCompanyPrompt(companyId: string): Promise<string> {
    const cached = this.promptCache.get(companyId);
    if (cached && Date.now() - cached.cachedAt < cached.ttl) {
      return cached.prompt ?? this.defaultPrompt();
    }
    const settings = await this.settingsRepo.findOne({ where: { companyId } });
    const prompt = settings?.aiPrompt || null;
    const ttl = prompt ? this.CACHE_TTL_MS : this.NULL_CACHE_TTL_MS;
    this.promptCache.set(companyId, { prompt, cachedAt: Date.now(), ttl });
    return prompt ?? this.defaultPrompt();
  }

  private trimHistory(userId: string, chatId: string, history: AiHistoryMessage[]): void {
    const limit = parseInt(process.env.AI_HISTORY_LIMIT ?? '40', 10);
    if (history.length > limit) history.splice(0, history.length - limit);
    this.histories.set(`${userId}:${chatId}`, history);
  }

  private async callLLM(messages: AiHistoryMessage[]): Promise<string | null> {
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
          model,
          messages,
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
      return data?.choices?.[0]?.message?.content ?? null;
    } finally {
      clearTimeout(timer);
    }
  }

  private defaultPrompt(): string {
    return `You are a helpful customer service assistant for AALA.LAND, a property management platform.
      Reply briefly and professionally.
      Reply in the same language the user writes in.
    `;
  }
}
