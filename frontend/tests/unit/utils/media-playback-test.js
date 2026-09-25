import { module, test } from 'qunit';
import {
  PlaybackState,
  SPEEDS,
  claimPlayback,
  clamp,
  formatClock,
  nextSpeed,
  releasePlayback,
} from 'land/utils/media-playback';

// A media element stand-in: an event target with the few properties the state reads.
function fakeMedia(overrides = {}) {
  const target = new EventTarget();
  return Object.assign(target, {
    currentTime: 0,
    duration: 0,
    paused: true,
    muted: false,
    playbackRate: 1,
    defaultPlaybackRate: 1,
    pause() {
      this.paused = true;
    },
    play() {
      this.paused = false;
      return Promise.resolve();
    },
    ...overrides,
  });
}

module('Unit | Utility | media-playback', function () {
  test('formatClock renders m:ss, h:mm:ss, and 0:00 for unknown durations', function (assert) {
    assert.strictEqual(formatClock(0), '0:00');
    assert.strictEqual(formatClock(NaN), '0:00');
    assert.strictEqual(formatClock(Infinity), '0:00');
    assert.strictEqual(formatClock(-3), '0:00');
    assert.strictEqual(formatClock(7.9), '0:07');
    assert.strictEqual(formatClock(65), '1:05');
    assert.strictEqual(formatClock(3600), '1:00:00');
    assert.strictEqual(formatClock(3725), '1:02:05');
  });

  test('nextSpeed cycles through the speeds and wraps to the first', function (assert) {
    assert.strictEqual(nextSpeed(1), 1.5);
    assert.strictEqual(nextSpeed(1.5), 2);
    assert.strictEqual(nextSpeed(2), SPEEDS[0]);
    assert.strictEqual(nextSpeed(3), SPEEDS[0], 'an unknown rate restarts');
  });

  test('clamp keeps a value inside its bounds', function (assert) {
    assert.strictEqual(clamp(5, 0, 10), 5);
    assert.strictEqual(clamp(-1, 0, 10), 0);
    assert.strictEqual(clamp(11, 0, 10), 10);
  });

  test('claimPlayback pauses the previously playing element only', function (assert) {
    const first = fakeMedia({ paused: false });
    const second = fakeMedia({ paused: false });
    claimPlayback(first);
    assert.false(first.paused, 'the first claim pauses nothing');
    claimPlayback(second);
    assert.true(first.paused, 'a second element pauses the first');
    assert.false(second.paused);
    claimPlayback(second);
    assert.false(second.paused, 'reclaiming the same element pauses nothing');
    releasePlayback(second);
    releasePlayback(first);
  });

  test('seekTo clamps to the known duration and mirrors the element', function (assert) {
    const state = new PlaybackState();
    const media = fakeMedia({ duration: 30 });
    const detach = state.attach(media);
    media.dispatchEvent(new Event('loadedmetadata'));
    assert.strictEqual(state.max, 30);

    state.seekTo(45);
    assert.strictEqual(media.currentTime, 30);
    assert.strictEqual(state.current, 30);

    state.seekBy(-40);
    assert.strictEqual(media.currentTime, 0);
    detach();
  });

  test('timeupdate does not move the thumb while the user is seeking', function (assert) {
    const state = new PlaybackState();
    const media = fakeMedia({ duration: 100 });
    const detach = state.attach(media);

    media.currentTime = 10;
    media.dispatchEvent(new Event('timeupdate'));
    assert.strictEqual(state.current, 10);

    state.onSeekStart();
    media.currentTime = 12;
    media.dispatchEvent(new Event('timeupdate'));
    assert.strictEqual(state.current, 10, 'held while seeking');

    media.currentTime = 40;
    state.onSeekEnd();
    assert.false(state.seeking);
    assert.strictEqual(state.current, 40, 'synced from the element on release');
    detach();
  });

  test('cycleSpeed applies the rate to the element and its label', function (assert) {
    const state = new PlaybackState();
    const media = fakeMedia();
    const detach = state.attach(media);
    state.cycleSpeed();
    assert.strictEqual(media.playbackRate, 1.5);
    assert.strictEqual(media.defaultPlaybackRate, 1.5);
    assert.strictEqual(state.speedLabel, '1.5x');
    detach();
  });

  test('detaching pauses a playing element and clears the reference', function (assert) {
    const state = new PlaybackState();
    const media = fakeMedia({ paused: false });
    const detach = state.attach(media);
    assert.strictEqual(state.element, media);
    detach();
    assert.true(media.paused);
    assert.strictEqual(state.element, null);
  });
});
