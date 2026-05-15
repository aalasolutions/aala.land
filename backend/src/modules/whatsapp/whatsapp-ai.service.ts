// backend/src/modules/whatsapp/whatsapp-ai.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { AiHistoryMessage } from './wa-types';

@Injectable()
export class WhatsappAiService {
  private readonly logger = new Logger(WhatsappAiService.name);
  private histories = new Map<string, AiHistoryMessage[]>();
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.AI_ENABLED !== 'false';
  }

  getConfig() {
    return {
      enabled: this.enabled,
      keyConfigured: !!(process.env.OLLAMA_API_KEY),
      model: process.env.OLLAMA_MODEL ?? '',
      host: process.env.OLLAMA_HOST ?? '',
    };
  }

  isEnabled(): boolean { return this.enabled; }

  setEnabled(value: boolean): boolean {
    this.enabled = value;
    return this.enabled;
  }

  getHistoryFor(chatId: string): AiHistoryMessage[] {
    return this.histories.get(chatId) ?? [];
  }

  clearHistory(chatId?: string): void {
    chatId ? this.histories.delete(chatId) : this.histories.clear();
  }

  recordAssistantTurn(chatId: string, content: string): void {
    const history = this.histories.get(chatId) ?? [];
    history.push({ role: 'assistant', content });
    this.trimHistory(chatId, history);
  }

  async handleIncomingMessage(
    evt: { chatId: string; body: string; fromMe: boolean; isGroup: boolean; timestamp: number; senderId: string },
    send: (chatId: string, message: string) => Promise<{ messageId?: string }>,
  ): Promise<void> {
    if (!this.enabled || !process.env.OLLAMA_API_KEY) return;
    if (evt.fromMe || evt.isGroup || !evt.body.trim()) return;

    const maxAge = parseInt(process.env.AI_MESSAGE_MAX_AGE_S ?? '120', 10);
    if (Math.floor(Date.now() / 1000) - evt.timestamp > maxAge) return;

    const history = this.histories.get(evt.chatId) ?? [];
    history.push({ role: 'user', content: evt.body });
    this.trimHistory(evt.chatId, history);

    try {
      const systemPrompt = process.env.AI_SYSTEM_PROMPT ?? this.defaultPrompt();
      const reply = await this.callLLM([{ role: 'system', content: systemPrompt }, ...history]);
      if (!reply) return;

      history.push({ role: 'assistant', content: reply });
      this.trimHistory(evt.chatId, history);

      await send(evt.chatId, reply);
    } catch (err) {
      this.logger.error('AI call failed', err instanceof Error ? err.message : err);
    }
  }

  private trimHistory(chatId: string, history: AiHistoryMessage[]): void {
    const limit = parseInt(process.env.AI_HISTORY_LIMIT ?? '40', 10);
    if (history.length > limit) history.splice(0, history.length - limit);
    this.histories.set(chatId, history);
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
