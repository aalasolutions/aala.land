import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render, click } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';

function pending(overrides = {}) {
  return {
    id: 'att-1',
    chatId: 'chat-1',
    file: new File(['12345'], 'photo.jpg', { type: 'image/jpeg' }),
    kind: 'image',
    caption: '',
    previewUrl: null,
    progress: 0,
    state: 'uploading',
    error: null,
    ...overrides,
  };
}

module('Integration | Component | whatsapp/pending-media', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.calls = [];
    this.onRetry = () => this.calls.push('retry');
    this.onRemove = () => this.calls.push('remove');
  });

  const renderPending = () =>
    render(hbs`<Whatsapp::PendingMedia
      @item={{this.item}}
      @onRetry={{this.onRetry}}
      @onRemove={{this.onRemove}}
    />`);

  test('an uploading image shows its preview in the photo frame with size, caption and progress', async function (assert) {
    this.item = pending({
      previewUrl: 'blob:test/1',
      progress: 45,
      caption: 'Kitchen',
    });
    await renderPending();

    assert
      .dom('[data-test-wa-pending="att-1"]')
      .hasClass('m-outgoing')
      .hasAttribute('data-test-wa-pending-state', 'uploading');
    assert
      .dom('.wa-media__frame:not(.m-video) [data-test-wa-pending-image]')
      .hasClass('wa-media__image')
      .hasAttribute('src', 'blob:test/1');
    assert.dom('[data-test-wa-pending-name]').doesNotExist();
    assert.dom('[data-test-wa-pending-size]').hasText('5 B');
    assert.dom('[data-test-wa-pending-caption]').hasText('Kitchen');
    assert
      .dom('[data-test-wa-pending-progress] [role="progressbar"]')
      .hasAttribute('aria-valuenow', '45');
    assert.dom('[data-test-wa-pending-uploading]').hasText('Uploading');
    assert.dom('[data-test-wa-pending-error]').doesNotExist();
    assert.dom('[data-test-wa-pending-retry]').doesNotExist();
    assert.dom('[data-test-wa-pending-remove]').doesNotExist();
  });

  test('an uploading video shows its first frame in the video frame with the play glyph and no duration', async function (assert) {
    this.item = pending({
      file: new File(['123'], 'tour.mp4', { type: 'video/mp4' }),
      kind: 'video',
      previewUrl: 'blob:test/2',
    });
    await renderPending();

    assert
      .dom('.wa-media__frame.m-video [data-test-wa-pending-video]')
      .hasClass('wa-media__video')
      .hasAttribute('src', 'blob:test/2#t=0.1')
      .hasAttribute('preload', 'metadata')
      .hasAttribute('aria-hidden', 'true');
    assert.dom('[data-test-wa-pending-video]').hasAttribute('muted');
    assert.dom('.wa-media__frame.m-video .wa-media__play').exists();
    assert.dom('.wa-media__badge').doesNotExist('no duration badge');
    assert.dom('[data-test-wa-pending-size]').hasText('3 B');
    assert.dom('[data-test-wa-pending-progress]').exists();
  });

  test('an uploading sticker renders at sticker size without bubble chrome or size', async function (assert) {
    this.item = pending({
      file: new File(['12'], 's.webp', { type: 'image/webp' }),
      kind: 'sticker',
      previewUrl: 'blob:test/3',
    });
    await renderPending();

    assert
      .dom('.wa-media__sticker [data-test-wa-pending-sticker]')
      .hasAttribute('src', 'blob:test/3');
    assert.dom('.wa-media__frame').doesNotExist();
    assert.dom('[data-test-wa-pending-size]').doesNotExist();
    assert.strictEqual(
      getComputedStyle(this.element.querySelector('.wa-media__sticker'))
        .inlineSize,
      '128px',
      'sticker size',
    );
    assert.strictEqual(
      getComputedStyle(this.element.querySelector('.wa-message')).boxShadow,
      'none',
      'bubble chrome removed',
    );
  });

  test('the pending photo and video frames match the real bubble frames in size', async function (assert) {
    this.owner.register(
      'service:whatsapp',
      class extends Service {
        getMediaUrl() {
          return new Promise(() => {});
        }
      },
    );
    const row = (mediaType) => ({
      id: `wamid.${mediaType}`,
      uuid: `row-${mediaType}`,
      hasMedia: true,
      mediaType,
      mediaStatus: 'STORED',
      mediaSizeBytes: 5,
      body: '',
      fromMe: true,
    });
    this.image = pending({ previewUrl: 'blob:test/1' });
    this.video = pending({
      id: 'att-2',
      kind: 'video',
      previewUrl: 'blob:test/2',
    });
    this.realImage = row('image');
    this.realVideo = row('video');
    await render(hbs`<div class="flex col">
      <div class="wa-message m-outgoing" data-real="image"><Whatsapp::MessageMedia @message={{this.realImage}} /></div>
      <Whatsapp::PendingMedia @item={{this.image}} data-pending="image" />
      <div class="wa-message m-outgoing" data-real="video"><Whatsapp::MessageMedia @message={{this.realVideo}} /></div>
      <Whatsapp::PendingMedia @item={{this.video}} data-pending="video" />
    </div>`);

    for (const kind of ['image', 'video']) {
      const real = this.element
        .querySelector(`[data-real="${kind}"] .wa-media__frame`)
        .getBoundingClientRect();
      const local = this.element
        .querySelector(`[data-pending="${kind}"] .wa-media__frame`)
        .getBoundingClientRect();
      assert.true(real.width > 0, `${kind} frame has a width`);
      assert.strictEqual(local.width, real.width, `${kind} width matches`);
      assert.strictEqual(local.height, real.height, `${kind} height matches`);
    }
  });

  test('a document keeps the list row with its kind icon, name and size', async function (assert) {
    this.item = pending({
      file: new File(['x'], 'lease.pdf', { type: 'application/pdf' }),
      kind: 'document',
    });
    await renderPending();

    assert.dom('.wa-media__frame').doesNotExist();
    assert.dom('[data-test-wa-pending-icon]').exists();
    assert.dom('[data-test-wa-pending-name]').hasText('lease.pdf');
    assert.dom('[data-test-wa-pending-size]').hasText('1 B');
    assert.dom('[data-test-wa-pending-caption]').doesNotExist();
  });

  test('a failed upload shows the server message with retry and remove', async function (assert) {
    this.item = pending({
      state: 'failed',
      error: 'Storage quota exceeded',
      previewUrl: 'blob:test/1',
    });
    await renderPending();

    assert
      .dom('[data-test-wa-pending]')
      .hasAttribute('data-test-wa-pending-state', 'failed');
    assert
      .dom('[data-test-wa-pending-error]')
      .hasText('Storage quota exceeded');
    assert.dom('[data-test-wa-pending-progress]').doesNotExist();

    await click('[data-test-wa-pending-retry]');
    await click('[data-test-wa-pending-remove]');
    assert.deepEqual(this.calls, ['retry', 'remove']);
  });
});
