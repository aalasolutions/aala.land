import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import {
  render,
  click,
  settled,
  triggerKeyEvent,
  waitUntil,
} from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { resetDialogStateForTesting } from '@nuvoui/ember/utils/dialog-focus';
import { PNG_URL, wavUrl, stubPlayback } from 'land/tests/helpers/media';

module('Integration | Component | whatsapp/media-viewer', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.whatsapp = this.owner.lookup('service:whatsapp');
    this.urlCalls = [];
    this.urls = [`${PNG_URL}#sig=1`];
    this.whatsapp.getMediaUrl = (uuid, options) => {
      this.urlCalls.push({ uuid, options });
      const next =
        this.urls[Math.min(this.urlCalls.length - 1, this.urls.length - 1)];
      return next instanceof Error
        ? Promise.reject(next)
        : Promise.resolve(next);
    };
    this.originalConsoleError = console.error;
    this.logged = [];
    console.error = (...args) => this.logged.push(args);
  });

  hooks.afterEach(function () {
    this.whatsapp.closeMediaViewer();
    console.error = this.originalConsoleError;
    resetDialogStateForTesting();
  });

  function media(overrides = {}) {
    return {
      id: 'wamid.1',
      uuid: 'row-1',
      mediaType: 'image',
      mediaFileName: 'front-door.jpg',
      mediaSizeBytes: 2048,
      mediaStatus: 'STORED',
      ...overrides,
    };
  }

  async function renderWithTrigger(ctx) {
    ctx.set('open', (msg) => ctx.whatsapp.openMediaViewer(msg));
    ctx.set('message', media());
    await render(hbs`
      <button type="button" data-test-trigger {{on "click" (fn this.open this.message)}}>open</button>
      <Whatsapp::MediaViewer />
    `);
  }

  test('renders nothing while closed', async function (assert) {
    await render(hbs`<Whatsapp::MediaViewer />`);
    assert.dom('[data-test-wa-viewer]').doesNotExist();
  });

  test('opening an image shows it fit to screen with title, size and download', async function (assert) {
    await render(hbs`<Whatsapp::MediaViewer />`);
    this.whatsapp.openMediaViewer(media());
    await settled();

    assert.dom('[data-test-wa-viewer="image"]').exists();
    assert.dom('[role="dialog"]').hasAttribute('aria-modal', 'true');
    assert.dom('[data-test-wa-viewer-title] bdi').hasText('front-door.jpg');
    assert.dom('[data-test-wa-viewer-size]').hasText('2 KB');
    assert.dom('[data-test-wa-viewer-image]').hasAttribute('src', this.urls[0]);
    assert
      .dom('[data-test-wa-viewer-download]')
      .hasAttribute('href', this.urls[0])
      .hasAttribute('rel', 'noopener noreferrer');
    assert.deepEqual(this.urlCalls, [{ uuid: 'row-1', options: undefined }]);
    assert
      .dom('[data-test-wa-controls]')
      .doesNotExist('no controls for a photo');
  });

  test('a photo without a file name is titled by its type', async function (assert) {
    await render(hbs`<Whatsapp::MediaViewer />`);
    this.whatsapp.openMediaViewer(media({ mediaFileName: null }));
    await settled();

    assert.dom('[data-test-wa-viewer-title]').hasText('Photo');
  });

  test('opening a video shows custom controls with mute and full screen; keys drive playback', async function (assert) {
    this.urls = [wavUrl()];
    await render(hbs`<Whatsapp::MediaViewer />`);
    this.whatsapp.openMediaViewer(
      media({ mediaType: 'video', mediaFileName: 'tour.mp4' }),
    );
    await settled();

    const video = stubPlayback(
      document.querySelector('[data-test-wa-viewer-video]'),
    );
    assert.dom('[data-test-wa-viewer-video]').doesNotHaveAttribute('controls');
    assert.dom('[data-test-wa-play]').exists();
    assert.dom('[data-test-wa-seek]').exists();
    assert.dom('[data-test-wa-speed]').hasText('1x');
    assert.dom('[data-test-wa-mute]').exists();
    assert.dom('[data-test-wa-fullscreen]').exists();

    await waitUntil(() => video.duration > 0);
    const dialog = '[role="dialog"]';
    await triggerKeyEvent(dialog, 'keydown', ' ');
    assert.false(video.paused, 'Space plays');
    await triggerKeyEvent(dialog, 'keydown', ' ');
    assert.true(video.paused, 'Space pauses');

    await triggerKeyEvent(dialog, 'keydown', 'ArrowRight');
    assert.strictEqual(video.currentTime, 2, 'seek clamps to the end');
    await triggerKeyEvent(dialog, 'keydown', 'ArrowLeft');
    assert.strictEqual(video.currentTime, 0);

    await triggerKeyEvent(dialog, 'keydown', 'M');
    assert.true(video.muted);
    assert.dom('[data-test-wa-mute]').hasAttribute('aria-label', 'Unmute');

    await click('[data-test-wa-speed]');
    assert.strictEqual(video.playbackRate, 1.5);
  });

  test('Escape closes and focus returns to the trigger', async function (assert) {
    await renderWithTrigger(this);
    document.querySelector('[data-test-trigger]').focus();
    await click('[data-test-trigger]');

    assert.dom('[data-test-wa-viewer]').exists();
    assert.true(
      document
        .querySelector('[role="dialog"]')
        .contains(document.activeElement),
      'focus moved into the viewer',
    );

    await triggerKeyEvent('[role="dialog"]', 'keydown', 'Escape');

    assert.dom('[data-test-wa-viewer]').doesNotExist();
    assert.strictEqual(this.whatsapp.viewerMessage, null);
    assert.dom('[data-test-trigger]').isFocused();
  });

  test('the close button and the backdrop both close', async function (assert) {
    await renderWithTrigger(this);
    await click('[data-test-trigger]');
    await click('[data-test-wa-viewer-close]');
    assert.dom('[data-test-wa-viewer]').doesNotExist();

    await click('[data-test-trigger]');
    await click('[data-test-nu-modal-backdrop-dismiss]');
    assert.dom('[data-test-wa-viewer]').doesNotExist();
  });

  test('a failed load shows Could not load with a Retry that fetches a fresh URL', async function (assert) {
    this.urls = [new Error('Network down'), `${PNG_URL}#sig=2`];
    await render(hbs`<Whatsapp::MediaViewer />`);
    this.whatsapp.openMediaViewer(media());
    await settled();

    assert
      .dom('[data-test-wa-viewer-load-failed]')
      .includesText('Could not load');
    assert.strictEqual(this.logged.length, 1);

    await click('[data-test-wa-viewer-retry]');
    assert.deepEqual(this.urlCalls[1].options, { fresh: true });
    assert.dom('[data-test-wa-viewer-image]').hasAttribute('src', this.urls[1]);
  });

  test('an element error retries once with a fresh URL, then fails', async function (assert) {
    this.urls = [`${PNG_URL}#sig=1`, `${PNG_URL}#sig=2`];
    await render(hbs`<Whatsapp::MediaViewer />`);
    this.whatsapp.openMediaViewer(media());
    await settled();

    const fire = async () => {
      document
        .querySelector('[data-test-wa-viewer-image]')
        .dispatchEvent(new Event('error'));
      await settled();
    };
    await fire();
    assert.deepEqual(this.urlCalls[1].options, { fresh: true });
    assert.dom('[data-test-wa-viewer-image]').hasAttribute('src', this.urls[1]);

    await fire();
    assert.strictEqual(this.urlCalls.length, 2);
    assert.dom('[data-test-wa-viewer-load-failed]').exists();
  });

  test('reopening starts clean, with no URL left from the last open', async function (assert) {
    this.urls = [`${PNG_URL}#sig=1`, `${PNG_URL}#sig=2`];
    await render(hbs`<Whatsapp::MediaViewer />`);
    this.whatsapp.openMediaViewer(media());
    await settled();
    this.whatsapp.closeMediaViewer();
    await settled();

    this.whatsapp.openMediaViewer(media({ id: 'wamid.2', uuid: 'row-2' }));
    await settled();

    assert.deepEqual(
      this.urlCalls.map((c) => c.uuid),
      ['row-1', 'row-2'],
    );
    assert.dom('[data-test-wa-viewer-image]').hasAttribute('src', this.urls[1]);
  });
});
