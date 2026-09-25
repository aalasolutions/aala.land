import Component from '@glimmer/component';
import { action } from '@ember/object';
import { modifier } from 'ember-modifier';
import { PlaybackState } from 'land/utils/media-playback';

// Custom controls over a hidden native <audio>; the source URL and its retries belong to the caller.
export default class WhatsappAudioPlayerComponent extends Component {
  playback = new PlaybackState();
  // A requested play survives a source swap or a retry and starts once metadata loads.
  _wantsPlay = false;

  attach = modifier((element) => {
    const detach = this.playback.attach(element);
    const onLoaded = () => {
      if (this._wantsPlay) this.playback.play();
    };
    const onPlaying = () => (this._wantsPlay = false);
    const onEnded = () => (this._wantsPlay = false);
    const onError = (event) => this.args.onError?.(event);
    element.addEventListener('loadedmetadata', onLoaded);
    element.addEventListener('playing', onPlaying);
    element.addEventListener('ended', onEnded);
    element.addEventListener('error', onError);
    return () => {
      element.removeEventListener('loadedmetadata', onLoaded);
      element.removeEventListener('playing', onPlaying);
      element.removeEventListener('ended', onEnded);
      element.removeEventListener('error', onError);
      detach();
    };
  });

  get isReady() {
    return Boolean(this.args.src);
  }

  @action
  toggle() {
    const element = this.playback.element;
    if (!element) return;
    if (!element.paused) {
      this._wantsPlay = false;
      element.pause();
      return;
    }
    this._wantsPlay = true;
    if (this.args.onPlayIntent?.(element)) return;
    this.playback.play();
  }
}
