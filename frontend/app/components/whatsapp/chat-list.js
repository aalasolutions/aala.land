import Component from '@glimmer/component';
import { service } from '@ember/service';
import { REPLY_WINDOW_MS, formatRemaining } from 'land/utils/reply-window';

const ESCALATION_REASON_LABELS = {
  request: 'Asked for a person',
  safety: 'Safety concern',
  payment: 'Payment or deposit question',
  complaint: 'Complaint',
  opt_out: 'Asked to stop messages',
  other: 'Needs the team',
};

export function escalationLabel(reason) {
  return Object.hasOwn(ESCALATION_REASON_LABELS, reason)
    ? ESCALATION_REASON_LABELS[reason]
    : ESCALATION_REASON_LABELS.other;
}

// @now is the page clock, so every row's window counts down without a timer of its own.
export default class WhatsappChatListComponent extends Component {
  @service whatsapp;

  escalationLabel = escalationLabel;

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
