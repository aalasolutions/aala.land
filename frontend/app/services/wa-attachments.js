import Service, { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { canCaption, classifyOutboundFile } from 'land/utils/wa-outbound-media';

// Files queued in the WhatsApp composer. Each is sent as its own message, in queue order.
export default class WaAttachmentsService extends Service {
  @service whatsapp;
  @service notifications;

  // Replaced on write.
  @tracked items = [];
  @tracked isSending = false;
  // Receives each sent row so it takes the same path as a socket delivery.
  onSent = null;
  _seq = 0;
  // Bumped on clear so a send in flight never writes into the next chat's queue.
  _generation = 0;

  get sendableItems() {
    return this.items.filter(isSendable);
  }

  add(files) {
    const added = [...(files ?? [])].map((file) => {
      const { kind, error } = classifyOutboundFile(file);
      return {
        id: `att-${++this._seq}`,
        file,
        kind,
        caption: '',
        error,
        refused: Boolean(error),
        progress: 0,
        state: error ? 'failed' : 'queued',
      };
    });
    if (added.length) this.items = [...this.items, ...added];
    return added;
  }

  @action
  setCaption(id, caption) {
    this._patch(id, { caption });
  }

  @action
  remove(id) {
    this.items = this.items.filter((item) => item.id !== id);
  }

  @action
  clear() {
    this._generation++;
    this.isSending = false;
    if (this.items.length) this.items = [];
  }

  // Stops at the first refusal: the files after it keep their place for the next send.
  async sendAll(chatId) {
    if (this.isSending || !chatId) return;
    const generation = this._generation;
    const queue = this.sendableItems.map((item) => item.id);
    if (!queue.length) return;
    this.isSending = true;
    try {
      for (const id of queue) {
        const item = this.items.find((entry) => entry.id === id);
        if (!item) continue;
        this._patch(id, { state: 'uploading', progress: 0, error: null });
        let result;
        try {
          const options = {
            onProgress: (value) => {
              if (generation !== this._generation) return;
              const progress = Math.round(value);
              const current = this.items.find((entry) => entry.id === id);
              if (current && current.progress !== progress) {
                this._patch(id, { progress });
              }
            },
          };
          if (canCaption(item)) options.caption = item.caption.trim();
          result = await this.whatsapp.sendMediaFile(
            chatId,
            item.file,
            options,
          );
        } catch (err) {
          if (generation !== this._generation) return;
          const message = err?.message || 'Upload failed';
          this._patch(id, { state: 'failed', error: message, progress: 0 });
          this.notifications.error(message);
          return;
        }
        if (generation !== this._generation) return;
        // A row Meta refused still counts as sent: the thread shows its failed tick and Retry.
        this._patch(id, { state: 'sent', progress: 100 });
        const row = result?.data ?? result;
        if (row) this.onSent?.(row, chatId);
      }
    } finally {
      if (generation === this._generation) {
        this.isSending = false;
        this.items = this.items.filter((item) => item.state !== 'sent');
      }
    }
  }

  _patch(id, changes) {
    this.items = this.items.map((item) =>
      item.id === id ? { ...item, ...changes } : item,
    );
  }
}

function isSendable(item) {
  return !item.refused && item.state !== 'sent' && item.state !== 'uploading';
}
