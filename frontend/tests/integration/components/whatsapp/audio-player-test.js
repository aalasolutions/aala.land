import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import {
  render,
  click,
  settled,
  fillIn,
  find,
  waitUntil,
} from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { wavUrl, stubPlayback } from 'land/tests/helpers/media';

module('Integration | Component | whatsapp/audio-player', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.src = wavUrl();
    this.intents = [];
    this.errors = [];
    this.onPlayIntent = (element) => {
      this.intents.push(element);
      return false;
    };
    this.onError = (event) => this.errors.push(event);
  });

  async function renderPlayers(ctx, count = 1) {
    ctx.set(
      'players',
      Array.from({ length: count }, (_, i) => i),
    );
    await render(hbs`{{#each this.players as |i|}}
      <div data-test-player-slot={{i}}>
        <Whatsapp::AudioPlayer
          @src={{this.src}}
          @label="voice.ogg"
          @sizeLabel="12 KB"
          @onError={{this.onError}}
          @onPlayIntent={{this.onPlayIntent}}
        />
      </div>
    {{/each}}`);
    return [...document.querySelectorAll('[data-test-wa-media-audio]')].map(
      stubPlayback,
    );
  }

  test('renders a hidden native element under custom controls', async function (assert) {
    await renderPlayers(this);

    assert
      .dom('[data-test-wa-media-audio]')
      .hasAttribute('preload', 'metadata')
      .hasAttribute('hidden')
      .doesNotHaveAttribute('controls');
    assert.dom('[data-test-wa-play]').hasAttribute('aria-label', 'Play');
    assert.dom('[data-test-wa-seek]').hasAttribute('type', 'range');
    assert.dom('[data-test-wa-seek]').hasAttribute('aria-valuetext', '0:00');
    assert.dom('[data-test-wa-time]').hasText('0:00 / 0:00');
    assert.dom('[data-test-wa-speed]').hasText('1x');
    assert.dom('[data-test-wa-media-size]').hasText('12 KB');
  });

  test('play and pause toggle the element and the button state', async function (assert) {
    const [audio] = await renderPlayers(this);

    await click('[data-test-wa-play]');
    assert.false(audio.paused);
    assert.strictEqual(this.intents.length, 1, 'play intent reported');
    assert.dom('[data-test-wa-play]').hasAttribute('aria-label', 'Pause');

    await click('[data-test-wa-play]');
    assert.true(audio.paused);
    assert.dom('[data-test-wa-play]').hasAttribute('aria-label', 'Play');
  });

  test('a play intent that swaps the source defers play until metadata loads', async function (assert) {
    this.onPlayIntent = () => true;
    const [audio] = await renderPlayers(this);
    await waitUntil(() => audio.readyState >= 1);

    await click('[data-test-wa-play]');
    assert.true(audio.paused, 'not played on the stale source');

    audio.dispatchEvent(new Event('loadedmetadata'));
    await settled();
    assert.false(audio.paused, 'played once the new source is ready');
  });

  test('the speed toggle cycles 1x, 1.5x, 2x and sets playbackRate', async function (assert) {
    const [audio] = await renderPlayers(this);

    await click('[data-test-wa-speed]');
    assert.dom('[data-test-wa-speed]').hasText('1.5x');
    assert.strictEqual(audio.playbackRate, 1.5);

    await click('[data-test-wa-speed]');
    assert.dom('[data-test-wa-speed]').hasText('2x');
    assert.strictEqual(audio.playbackRate, 2);

    await click('[data-test-wa-speed]');
    assert.dom('[data-test-wa-speed]').hasText('1x');
    assert.strictEqual(audio.playbackRate, 1);
  });

  test('only one audio plays at a time on the page', async function (assert) {
    const [first, second] = await renderPlayers(this, 2);

    await click('[data-test-player-slot="0"] [data-test-wa-play]');
    assert.false(first.paused);

    await click('[data-test-player-slot="1"] [data-test-wa-play]');
    assert.false(second.paused);
    assert.true(first.paused, 'the previous one was paused');
    assert
      .dom('[data-test-player-slot="0"] [data-test-wa-play]')
      .hasAttribute('aria-label', 'Play');
  });

  test('the seek bar moves playback and reports mm:ss', async function (assert) {
    const [audio] = await renderPlayers(this);
    if (!(audio.duration > 0)) {
      await new Promise((resolve) =>
        audio.addEventListener('loadedmetadata', resolve, { once: true }),
      );
      await settled();
    }

    await fillIn('[data-test-wa-seek]', '1');
    assert.strictEqual(audio.currentTime, 1);
    assert.dom('[data-test-wa-seek]').hasAttribute('aria-valuetext', '0:01');
    assert.strictEqual(find('[data-test-wa-seek]').max, String(audio.duration));
    assert.dom('[data-test-wa-time]').hasText('0:01 / 0:02');
  });

  test('an element error is handed to the caller', async function (assert) {
    const [audio] = await renderPlayers(this);

    audio.dispatchEvent(new Event('error'));
    await settled();

    assert.strictEqual(this.errors.length, 1);
    assert.strictEqual(this.errors[0].target, audio);
  });
});
