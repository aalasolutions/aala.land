import Component from '@glimmer/component';
import { service } from '@ember/service';
import { REPLY_WINDOW_MS, formatRemaining } from 'land/utils/reply-window';

// @now is the page clock, so every row's window counts down without a timer of its own.
export default class WhatsappChatListComponent extends Component {
  @service whatsapp;

  unreadCountFor = (chatId) =>
    this.whatsapp.unread.get(chatId)?.unreadCount ?? 0;

  // Null for groups: the Cloud API has no reply window there.
  windowFor = (chat) => {
    if (chat.isGroup) return null;
    const remainingMs = chat.lastInboundAt
      ? chat.lastInboundAt + REPLY_WINDOW_MS - (this.args.now ?? Date.now())
      : 0;
    if (remainingMs > 0) {
      return {
        open: true,
        tooltip: `Reply window: ${formatRemaining(remainingMs)} remaining`,
      };
    }
    return {
      open: false,
      tooltip: "Reply window closed. Can't reply from web.",
    };
  };
}
