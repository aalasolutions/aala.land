import Service, { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { canCaption, classifyOutboundFile } from 'land/utils/wa-outbound-media';

const PREVIEW_KINDS = new Set(['image', 'sticker', 'video']);

// Files staged in the WhatsApp composer, and the uploads sent from it, kept per chat.
export default class WaAttachmentsService extends Service {
  @service whatsapp;
  @service notifications;

  // Replaced on write.
  @tracked items = [];
  @tracked pendingByChat = new Map();
  // Receives each sent row so it takes the same path as a socket delivery.
  onSent = null;
  _seq = 0;
  // Bumped on reset so an upload in flight never writes into the next session.
  _generation = 0;
  _runs = new Map();
  // Returned row uuid to the preview object URL its real bubble shows until the signed URL loads.
  placeholderByUuid = new Map();

  get sendableItems() {
    return this.items.filter((item) => !item.refused);
  }

  pendingFor(chatId) {
    return (chatId && this.pendingByChat.get(chatId)) || [];
  }

  placeholderFor(uuid) {
    return (uuid && this.placeholderByUuid.get(uuid)) || null;
  }

  releasePlaceholder(uuid) {
    const url = this.placeholderFor(uuid);
    if (!url) return;
    this.placeholderByUuid.delete(uuid);
    URL.revokeObjectURL(url);
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
        state: error ? 'failed' : 'queued',
      };
    });
    if (added.length) this.items = [...this.items, ...added];
    return added;
  }

  @action
  setCaption(id, caption) {
    this.items = this.items.map((item) =>
      item.id === id ? { ...item, caption } : item,
    );
  }

  @action
  remove(id) {
    this.items = this.items.filter((item) => item.id !== id);
  }

  @action
  clear() {
    if (this.items.length) this.items = [];
  }

  // Moves every sendable file out of the tray at once; returns the chat's upload run, or null.
  sendAll(chatId) {
    if (!chatId) return null;
    const moving = this.sendableItems;
    if (!moving.length) return null;
    this.items = this.items.filter((item) => item.refused);
    const pending = moving.map((item) => ({
      id: item.id,
      chatId,
      file: item.file,
      kind: item.kind,
      caption: canCaption(item) ? item.caption.trim() : '',
      previewUrl: PREVIEW_KINDS.has(item.kind)
        ? URL.createObjectURL(item.file)
        : null,
      progress: 0,
      state: 'uploading',
      error: null,
      generation: this._generation,
    }));
    this._setPending(chatId, [...this.pendingFor(chatId), ...pending]);
    return this._run(chatId);
  }

  @action
  retryPending(id) {
    const item = this._findPending(id);
    if (!item || item.state !== 'failed') return null;
    this._patchPending(item.chatId, id, {
      state: 'uploading',
      progress: 0,
      error: null,
    });
    return this._run(item.chatId);
  }

  @action
  removePending(id) {
    const item = this._findPending(id);
    if (!item || item.state !== 'failed') return;
    this._dropPending(item.chatId, id);
  }

  // Teardown and user change: drops the tray and every pending upload.
  reset() {
    this._generation++;
    this._runs.clear();
    for (const list of this.pendingByChat.values()) {
      for (const item of list) revokePreview(item);
    }
    for (const url of this.placeholderByUuid.values()) URL.revokeObjectURL(url);
    this.placeholderByUuid.clear();
    if (this.pendingByChat.size) this.pendingByChat = new Map();
    this.clear();
  }

  _run(chatId) {
    const running = this._runs.get(chatId);
    if (running) return running;
    const run = this._drain(chatId).finally(() => {
      if (this._runs.get(chatId) === run) this._runs.delete(chatId);
    });
    this._runs.set(chatId, run);
    return run;
  }

  async _drain(chatId) {
    const generation = this._generation;
    for (;;) {
      if (generation !== this._generation) return;
      const item = this.pendingFor(chatId).find(
        (entry) => entry.state === 'uploading',
      );
      if (!item) return;
      await this._upload(item);
    }
  }

  async _upload(item) {
    const { id, chatId, generation } = item;
    const isLive = () =>
      generation === this._generation && Boolean(this._findPending(id));
    const options = {
      onProgress: (value) => {
        if (!isLive()) return;
        const progress = Math.round(value);
        if (this._findPending(id).progress !== progress) {
          this._patchPending(chatId, id, { progress });
        }
      },
    };
    if (item.caption) options.caption = item.caption;
    let result;
    try {
      result = await this.whatsapp.sendMediaFile(chatId, item.file, options);
    } catch (err) {
      if (!isLive()) return;
      const message = err?.message || 'Upload failed';
      this._patchPending(chatId, id, { state: 'failed', error: message });
      this.notifications.error(message);
      return;
    }
    if (!isLive()) return;
    // A row Meta refused still counts as sent: the thread shows its failed tick and Retry.
    const row = result?.data ?? result;
    this._dropPending(chatId, id, row?.uuid);
    if (row) this.onSent?.(row, chatId);
  }

  _findPending(id) {
    for (const list of this.pendingByChat.values()) {
      const item = list.find((entry) => entry.id === id);
      if (item) return item;
    }
    return null;
  }

  _setPending(chatId, list) {
    const next = new Map(this.pendingByChat);
    if (list.length) next.set(chatId, list);
    else next.delete(chatId);
    this.pendingByChat = next;
  }

  _patchPending(chatId, id, changes) {
    this._setPending(
      chatId,
      this.pendingFor(chatId).map((item) =>
        item.id === id ? { ...item, ...changes } : item,
      ),
    );
  }

  // With `keepAs`, the preview becomes that row's placeholder instead of being revoked.
  _dropPending(chatId, id, keepAs = null) {
    const list = this.pendingFor(chatId);
    const item = list.find((entry) => entry.id === id);
    if (!item) return;
    if (keepAs && item.previewUrl) {
      this.releasePlaceholder(keepAs);
      this.placeholderByUuid.set(keepAs, item.previewUrl);
    } else {
      revokePreview(item);
    }
    this._setPending(
      chatId,
      list.filter((entry) => entry !== item),
    );
  }
}

function revokePreview(item) {
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
}
