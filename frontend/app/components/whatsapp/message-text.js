import Component from '@glimmer/component';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { parseMessageText } from 'land/utils/message-format';

// Customer links open only after a confirm naming the real domain; our own links open directly.
export default class WhatsappMessageTextComponent extends Component {
  @service dialogs;

  // Nested formatting renders by recursion; @nodes is only passed by this component to itself.
  get nodes() {
    return this.args.nodes ?? parseMessageText(this.args.text ?? '');
  }

  // Bound to click and auxclick, so a middle-click cannot skip the confirm.
  @action
  async openLink(part, event) {
    if (!this.args.isExternal) return;
    if (event.type === 'auxclick' && event.button !== 1) return;
    event.preventDefault();
    let confirmed = false;
    try {
      confirmed = await this.dialogs.confirm({
        title: 'Open external link?',
        message: `You are leaving AALA.LAND for ${part.host}. Only open links you trust.`,
        confirmText: 'Open link',
      });
    } catch {
      // Another dialog is already open; this click is dropped.
      return;
    }
    if (confirmed) window.open(part.href, '_blank', 'noopener,noreferrer');
  }
}
