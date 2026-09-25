import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { isDestroying, isDestroyed } from '@ember/destroyable';
import { modifier } from 'ember-modifier';
import { isTopmostDialog } from '@nuvoui/ember/utils/dialog-focus';
import { formatBytes } from 'land/helpers/format-bytes';
import { mediaLabel } from 'land/utils/wa-media-label';
import { openSignedDownload } from 'land/utils/media-download';
import {
  PlaybackState,
  SEEK_STEP_SECONDS,
  reloadElement,
} from 'land/utils/media-playback';

const DIALOG_SELECTOR = '[role="dialog"]';
const CONTROL_TAGS = new Set(['BUTTON', 'INPUT', 'A', 'TEXTAREA', 'SELECT']);

function fullscreenElement() {
  return document.fullscreenElement ?? document.webkitFullscreenElement ?? null;
}

// Full-screen Nuvo::Modal for one image or video; the open message lives on the whatsapp service.
export default class WhatsappMediaViewerComponent extends Component {
  @service whatsapp;
  @service notifications;

  @tracked url = null;
  @tracked loadFailed = false;
  @tracked isFullscreen = false;
  @tracked playback = new PlaybackState();
  _loadSeq = 0;
  _retried = false;

  // Runs on open; the service's cache refreshes a URL with under a minute left before it is assigned.
  load = modifier((element, [message]) => {
    this._load(message);
    return () => this._reset();
  });

  attachPlayback = modifier((element) => this.playback.attach(element));

  // Bound to the modal's dialog element so shortcuts work wherever focus sits inside it.
  keys = modifier((element) => {
    const dialog = element.closest(DIALOG_SELECTOR) ?? element;
    const onKeydown = (event) => this._onKeydown(dialog, event);
    const onFullscreenChange = () =>
      (this.isFullscreen = fullscreenElement() === dialog);
    dialog.addEventListener('keydown', onKeydown);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      dialog.removeEventListener('keydown', onKeydown);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener(
        'webkitfullscreenchange',
        onFullscreenChange,
      );
      if (fullscreenElement() === dialog) this._exitFullscreen();
    };
  });

  get message() {
    return this.whatsapp.viewerMessage;
  }

  get isVideo() {
    return this.message?.mediaType === 'video';
  }

  get title() {
    return mediaLabel(this.message);
  }

  get sizeLabel() {
    return Number.isFinite(this.message?.mediaSizeBytes)
      ? formatBytes(this.message.mediaSizeBytes)
      : '';
  }

  @action
  close() {
    this.whatsapp.closeMediaViewer();
  }

  @action
  retry() {
    this.loadFailed = false;
    this._retried = false;
    this._fetch(this.message, { fresh: true });
  }

  @action
  async onMediaError(event) {
    const element = event.target;
    if (this._retried) {
      this._fail(element?.error ?? new Error('Media element error'));
      return;
    }
    this._retried = true;
    const resumeAt = element?.currentTime ?? 0;
    const seq = this._loadSeq;
    try {
      const url = await this.whatsapp.getMediaUrl(this.message.uuid, {
        fresh: true,
      });
      if (seq !== this._loadSeq || this._isGone()) return;
      if (resumeAt > 0) {
        element.addEventListener(
          'loadedmetadata',
          () => (element.currentTime = resumeAt),
          { once: true },
        );
      }
      if (url === this.url) reloadElement(element);
      else this.url = url;
    } catch (err) {
      this._fail(err);
    }
  }

  // The signed URL may have expired while the viewer stayed open.
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
        console.error(
          'WhatsApp media download failed',
          this.message?.uuid,
          err,
        );
        this.notifications.error('Could not download the file');
      },
    });
  }

  @action
  toggleFullscreen(event) {
    const root = event?.currentTarget?.closest(DIALOG_SELECTOR);
    if (fullscreenElement()) {
      this._exitFullscreen();
      return;
    }
    const request =
      root?.requestFullscreen?.bind(root) ??
      root?.webkitRequestFullscreen?.bind(root);
    if (request) {
      request()?.catch?.((err) => console.error('Full screen refused', err));
      return;
    }
    // iPhone Safari offers full screen on the video element only.
    root?.querySelector('video')?.webkitEnterFullscreen?.();
  }

  _load(message) {
    if (!message) return;
    this._fetch(message, { fresh: false });
  }

  async _fetch(message, { fresh }) {
    const seq = ++this._loadSeq;
    try {
      const url = await this.whatsapp.getMediaUrl(
        message.uuid,
        ...(fresh ? [{ fresh: true }] : []),
      );
      if (seq === this._loadSeq && !this._isGone()) this.url = url;
    } catch (err) {
      if (seq === this._loadSeq) this._fail(err);
    }
  }

  _fail(err) {
    console.error('WhatsApp media viewer load failed', this.message?.uuid, err);
    if (!this._isGone()) this.loadFailed = true;
  }

  // Runs while the overlay is torn down; state is replaced, never mutated in place.
  _reset() {
    this._loadSeq++;
    this._retried = false;
    this.url = null;
    this.loadFailed = false;
    this.isFullscreen = false;
    this.playback = new PlaybackState();
  }

  _onKeydown(element, event) {
    if (!isTopmostDialog(element) || !this.isVideo) return;
    const tag = event.target?.tagName;
    const inControl = CONTROL_TAGS.has(tag);
    switch (event.key) {
      case ' ':
        if (inControl) return;
        this.playback.toggle();
        break;
      case 'ArrowLeft':
      case 'ArrowRight': {
        if (tag === 'INPUT') return;
        const forward =
          (event.key === 'ArrowRight') !==
          (getComputedStyle(element).direction === 'rtl');
        this.playback.seekBy(forward ? SEEK_STEP_SECONDS : -SEEK_STEP_SECONDS);
        break;
      }
      case 'm':
      case 'M':
        this.playback.toggleMute();
        break;
      case 'f':
      case 'F':
        this.toggleFullscreen({ currentTarget: element });
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  _exitFullscreen() {
    const exit =
      document.exitFullscreen?.bind(document) ??
      document.webkitExitFullscreen?.bind(document);
    const result = exit?.();
    result?.catch?.(() => {});
  }

  _isGone() {
    return isDestroying(this) || isDestroyed(this);
  }
}
