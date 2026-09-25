import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export const SPEEDS = [1, 1.5, 2];
export const SEEK_STEP_SECONDS = 5;

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// m:ss, or h:mm:ss from one hour; unknown or streaming durations read 0:00.
export function formatClock(seconds) {
  const total =
    Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function nextSpeed(rate) {
  const index = SPEEDS.indexOf(rate);
  return SPEEDS[(index + 1) % SPEEDS.length];
}

export function speedLabel(rate) {
  return `${rate}x`;
}

let playingElement = null;

// One media element plays at a time on the page.
export function claimPlayback(element) {
  if (playingElement && playingElement !== element && !playingElement.paused) {
    playingElement.pause();
  }
  playingElement = element;
}

export function releasePlayback(element) {
  if (playingElement === element) playingElement = null;
}

// Re-requests the current source even when the URL string is unchanged.
export function reloadElement(element) {
  const src = element.getAttribute('src');
  if (!src) return;
  element.removeAttribute('src');
  element.setAttribute('src', src);
  if (typeof element.load === 'function') element.load();
}

// Tracked mirror of one <audio> or <video> element, shared by every custom control set.
export class PlaybackState {
  @tracked playing = false;
  @tracked current = 0;
  @tracked duration = 0;
  @tracked rate = SPEEDS[0];
  @tracked muted = false;
  // While the user drags the scrubber, timeupdate must not move the thumb back.
  @tracked seeking = false;
  element = null;

  get max() {
    return Number.isFinite(this.duration) && this.duration > 0
      ? this.duration
      : 0;
  }

  get currentLabel() {
    return formatClock(this.current);
  }

  get durationLabel() {
    return formatClock(this.duration);
  }

  get speedLabel() {
    return speedLabel(this.rate);
  }

  attach(element) {
    this.element = element;
    const sync = () => {
      if (!this.seeking) this.current = element.currentTime || 0;
      this.duration = element.duration || 0;
    };
    const handlers = {
      loadedmetadata: () => {
        element.defaultPlaybackRate = this.rate;
        element.playbackRate = this.rate;
        sync();
      },
      durationchange: sync,
      timeupdate: sync,
      play: () => {
        claimPlayback(element);
        this.playing = true;
      },
      pause: () => (this.playing = false),
      emptied: () => (this.playing = false),
      error: () => (this.playing = false),
      ended: () => {
        this.playing = false;
        sync();
      },
      volumechange: () => (this.muted = element.muted),
    };
    for (const [type, fn] of Object.entries(handlers)) {
      element.addEventListener(type, fn);
    }
    return () => {
      for (const [type, fn] of Object.entries(handlers)) {
        element.removeEventListener(type, fn);
      }
      if (!element.paused) element.pause();
      releasePlayback(element);
      if (this.element === element) this.element = null;
    };
  }

  play() {
    const element = this.element;
    if (!element) return;
    claimPlayback(element);
    const started = element.play();
    started?.catch?.((err) => {
      if (err?.name !== 'AbortError')
        console.error('Media playback failed', err);
      this.playing = false;
    });
  }

  @action
  toggle() {
    const element = this.element;
    if (!element) return;
    if (element.paused) this.play();
    else element.pause();
  }

  @action
  seekTo(seconds) {
    const element = this.element;
    if (!element) return;
    element.currentTime = clamp(seconds, 0, this.max);
    this.current = element.currentTime;
  }

  @action
  seekBy(delta) {
    this.seekTo((this.element?.currentTime ?? 0) + delta);
  }

  // The first input of a drag or a key press marks the seek; change or pointer release ends it.
  @action
  onSeekInput(event) {
    this.onSeekStart();
    this.seekTo(Number(event.target.value));
  }

  @action
  onSeekStart() {
    this.seeking = true;
  }

  @action
  onSeekEnd() {
    this.seeking = false;
    if (this.element) this.current = this.element.currentTime || 0;
  }

  @action
  cycleSpeed() {
    this.rate = nextSpeed(this.rate);
    const element = this.element;
    if (!element) return;
    element.defaultPlaybackRate = this.rate;
    element.playbackRate = this.rate;
  }

  @action
  toggleMute() {
    const element = this.element;
    if (!element) return;
    element.muted = !element.muted;
    this.muted = element.muted;
  }
}
