// backend/src/modules/whatsapp/message-store.service.ts
import { Injectable } from '@nestjs/common';
import { WaMessage, WaChat } from './wa-types';

@Injectable()
export class MessageStoreService {
  private messages: WaMessage[] = [];
  private chats = new Map<string, WaChat>();

  addMessage(msg: WaMessage): void {
    if (this.messages.some(m => m.id === msg.id)) return;
    this.messages.push(msg);
    if (this.messages.length > 2000) this.messages.shift();

    const existing = this.chats.get(msg.chatId);
    const isNewer = (msg.timestamp ?? 0) >= (existing?.lastTs ?? 0);
    this.chats.set(msg.chatId, {
      chatId: msg.chatId,
      chatName: msg.chatName || existing?.chatName || msg.chatId,
      isGroup: msg.isGroup ?? existing?.isGroup ?? false,
      lastBody: isNewer ? msg.body : (existing?.lastBody ?? ''),
      lastTs: isNewer ? msg.timestamp : (existing?.lastTs ?? 0),
      lastFromMe: isNewer ? msg.fromMe : (existing?.lastFromMe ?? false),
    });
  }

  getAllMessages(limit = 500): WaMessage[] {
    return this.messages.slice(-limit);
  }

  getMessagesForChat(chatId: string, limit = 200): WaMessage[] {
    return this.messages.filter(m => m.chatId === chatId).slice(-limit);
  }

  getChatList(): WaChat[] {
    return Array.from(this.chats.values()).sort((a, b) => b.lastTs - a.lastTs);
  }
}
