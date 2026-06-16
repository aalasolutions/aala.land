// backend/src/modules/whatsapp/message-store.service.ts
import { Injectable } from '@nestjs/common';
import { WaMessage, WaChat } from './wa-types';

@Injectable()
// Messages are kept in a bounded in-memory ring buffer (max 2000/user).
// They are intentionally NOT persisted to the database because the WhatsappMessage
// entity schema (designed for a prior Twilio integration) does not match the
// Baileys WaMessage shape. Re-wiring requires a schema migration; tracked as tech-debt.
export class MessageStoreService {
  private stores = new Map<string, { messages: WaMessage[]; chats: Map<string, WaChat> }>();

  private getStore(userId: string) {
    if (!this.stores.has(userId)) {
      this.stores.set(userId, { messages: [], chats: new Map() });
    }
    return this.stores.get(userId)!;
  }

  addMessage(userId: string, msg: WaMessage): void {
    const store = this.getStore(userId);
    if (store.messages.some(m => m.id === msg.id)) return;
    store.messages.push(msg);
    if (store.messages.length > 2000) store.messages.shift();

    const existing = store.chats.get(msg.chatId);
    const isNewer = (msg.timestamp ?? 0) >= (existing?.lastTs ?? 0);
    store.chats.set(msg.chatId, {
      chatId: msg.chatId,
      chatName: msg.chatName || existing?.chatName || msg.chatId,
      isGroup: msg.isGroup ?? existing?.isGroup ?? false,
      lastBody: isNewer ? msg.body : (existing?.lastBody ?? ''),
      lastTs: isNewer ? msg.timestamp : (existing?.lastTs ?? 0),
      lastFromMe: isNewer ? msg.fromMe : (existing?.lastFromMe ?? false),
    });
  }

  getAllMessages(userId: string, limit = 500): WaMessage[] {
    return this.getStore(userId).messages.slice(-limit);
  }

  getMessagesForChat(userId: string, chatId: string, limit = 200): WaMessage[] {
    return this.getStore(userId).messages.filter(m => m.chatId === chatId).slice(-limit);
  }

  getChatList(userId: string): WaChat[] {
    return Array.from(this.getStore(userId).chats.values())
      .filter(c => !c.isGroup)
      .sort((a, b) => b.lastTs - a.lastTs);
  }

  clearAll(userId: string): void {
    this.stores.delete(userId);
  }
}
