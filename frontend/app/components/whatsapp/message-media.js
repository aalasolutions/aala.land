import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { isDestroying, isDestroyed } from '@ember/destroyable';
import { modifier } from 'ember-modifier';
import { formatBytes } from 'land/helpers/format-bytes';
import {
  mediaLabel,
  mediaTypeIcon,
  mediaTypeLabel,
} from 'land/utils/wa-media-label';
import { formatClock, reloadElement } from 'land/utils/media-playback';
import { openSignedDownload } from 'land/utils/media-download';

const INLINE_TYPES = new Set(['image', 'video', 'audio', 'sticker']);
const SIZE_BELOW_KINDS = new Set(['image', 'video']);
const PLACEHOLDER_KINDS = new Set(['image', 'sticker', 'video']);
// Requests a signed URL slightly before the bubble enters the viewport.
const PRELOAD_MARGIN = '200px 0px';
const ROOT_SELECTOR = '[data-wa-media-root]';

// Scroll root (or document for the viewport) to its one-shot observer and pending callbacks.
const observers = new WeakMap();

function releaseObserved(key, element) {
  const entry = observers.get(key);
  if (!entry?.callbacks.delete(element)) return;
  entry.observer.unobserve(element);
  if (entry.callbacks.size === 0) {
    entry.observer.disconnect();
    observers.delete(key);
  }
}

// The callback runs once, the first time the element nears the viewport of its scroll root.
function observeOnce(element, onVisible) {
  const Observer = window.IntersectionObserver;
  if (typeof Observer !== 'function') {
    onVisible();
    return () => {};
  }
  const root = element.closest(ROOT_SELECTOR);
  const key = root ?? document;
  let entry = observers.get(key);
  if (!entry) {
    const callbacks = new Map();
    const observer = new Observer(
      (entries) => {
        for (const item of entries) {
          if (!item.isIntersecting) continue;
          const callback = callbacks.get(item.target);
          releaseObserved(key, item.target);
          callback?.();
        }
      },
      { root, rootMargin: PRELOAD_MARGIN },
    );
    entry = { observer, callbacks };
    observers.set(key, entry);
  }
  entry.callbacks.set(element, onVisible);
  entry.observer.observe(element);
  return () => releaseObserved(key, element);
}

// Settles once the browser holds the image or gave up on it, so a swap to it never paints an empty frame.
function preloadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = image.onerror = () => resolve();
    image.src = url;
  });
}

export default class WhatsappMessageMediaComponent extends Component {
  @service whatsapp;
  @service notifications;
  @service waAttachments;

  @tracked url = null;
  // Local preview of a just-sent file, shown until the signed URL has loaded.
  @tracked placeholderUrl = null;
  @tracked loadFailed = false;
  @tracked videoDuration = 0;
  // One fresh URL per element after a load error; only a proactive refresh re-arms it.
  _retried = false;

  observeMedia = modifier((element, [onVisible]) =>
    observeOnce(element, onVisible),
  );

  constructor(owner, args) {
    super(owner, args);
    if (PLACEHOLDER_KINDS.has(this.kind)) {
      this.placeholderUrl = this.waAttachments.placeholderFor(
        this.message.uuid,
      );
    }
  }

  willDestroy() {
    super.willDestroy();
    if (this.placeholderUrl) {
      this.waAttachments.releasePlaceholder(this.message.uuid);
    }
  }

  get message() {
    return this.args.message;
  }

  get status() {
    return this.message.mediaStatus;
  }

  get type() {
    return this.message.mediaType;
  }

  // Unknown types are offered as a download, never inlined.
  get kind() {
    return INLINE_TYPES.has(this.type) ? this.type : 'document';
  }

  get typeLabel() {
    return mediaTypeLabel(this.type);
  }

  get typeIcon() {
    return mediaTypeIcon(this.type);
  }

  get fileName() {
    return mediaLabel(this.message);
  }

  get sizeLabel() {
    return Number.isFinite(this.message.mediaSizeBytes)
      ? formatBytes(this.message.mediaSizeBytes)
      : '';
  }

  get showsSizeBadge() {
    return (
      Boolean(this.sizeLabel) &&
      SIZE_BELOW_KINDS.has(this.kind) &&
      !this.loadFailed
    );
  }

  get isStored() {
    return this.status === 'STORED';
  }

  get canDelete() {
    return this.isStored && Boolean(this.args.onDeleteMedia);
  }

  get caption() {
    return this.message.body ?? '';
  }

  // The fragment makes Safari paint the first frame of a paused preview.
  get posterSrc() {
    return this.url ? `${this.url}#t=0.1` : null;
  }

  get imageSrc() {
    return this.url ?? this.placeholderUrl;
  }

  get videoSrc() {
    if (this.posterSrc) return this.posterSrc;
    return this.placeholderUrl ? `${this.placeholderUrl}#t=0.1` : null;
  }

  get videoDurationLabel() {
    return this.videoDuration ? formatClock(this.videoDuration) : '';
  }

  @action
  async loadUrl() {
    if (!this.isStored || this.url) return;
    try {
      const url = await this.whatsapp.getMediaUrl(this.message.uuid);
      if (this._isGone()) return;
      if (this.placeholderUrl && this.kind !== 'video') {
        await preloadImage(url);
        if (this._isGone()) return;
      }
      this.url = url;
      if (this.kind !== 'video') this._releasePlaceholder();
    } catch (err) {
      this._failLoad(err);
    }
  }

  // A new element is rendered and observed again, so it gets its own retry.
  @action
  retryLoad() {
    this.url = null;
    this._retried = false;
    this.loadFailed = false;
  }

  @action
  async onMediaError(event) {
    if (this._retried) {
      this._failLoad(event.target?.error ?? new Error('Media element error'));
      return;
    }
    this._retried = true;
    try {
      await this._reloadSource(event.target, { fresh: true });
    } catch (err) {
      this._failLoad(err);
    }
  }

  // Swaps a URL near expiry before playback starts; true while the swap is loading.
  @action
  onPlayIntent(element) {
    if (this.whatsapp.peekMediaUrl(this.message.uuid) === this.url) {
      return false;
    }
    this._retried = false;
    this._reloadSource(element, { fresh: false }).catch((err) =>
      this._failLoad(err),
    );
    return true;
  }

  @action
  onVideoMetadata(event) {
    this.videoDuration = event.target.duration || 0;
    if (this.url) this._releasePlaceholder();
  }

  @action
  openViewer() {
    this.whatsapp.openMediaViewer(this.message);
  }

  @action
  onDownloadClick(event) {
    openSignedDownload({
      whatsapp: this.whatsapp,
      uuid: this.message.uuid,
      currentUrl: this.url,
      event,
      onUrl: (url) => {
        if (!this._isGone()) this.url = url;
      },
      onError: (err) => {
        console.error('WhatsApp media download failed', this.message.uuid, err);
        this.notifications.error('Could not download the file');
      },
    });
  }

  @action
  deleteMedia() {
    this.args.onDeleteMedia?.(this.message);
  }

  async _reloadSource(element, { fresh }) {
    const resumeAt = element?.currentTime ?? 0;
    const url = await this.whatsapp.getMediaUrl(
      this.message.uuid,
      ...(fresh ? [{ fresh: true }] : []),
    );
    if (this._isGone()) return;
    if (resumeAt > 0) {
      element.addEventListener(
        'loadedmetadata',
        () => (element.currentTime = resumeAt),
        { once: true },
      );
    }
    if (url === this.url) reloadElement(element);
    else this.url = url;
  }

  _failLoad(err) {
    console.error('WhatsApp media load failed', this.message.uuid, err);
    if (this._isGone()) return;
    this.loadFailed = true;
    this._releasePlaceholder();
  }

  _releasePlaceholder() {
    if (!this.placeholderUrl) return;
    this.placeholderUrl = null;
    this.waAttachments.releasePlaceholder(this.message.uuid);
  }

  _isGone() {
    return isDestroying(this) || isDestroyed(this);
  }
}
