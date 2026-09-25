import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import {
  render,
  click,
  settled,
  clearRender,
  waitUntil,
} from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';
import {
  PNG_URL,
  wavUrl,
  installFakeIntersectionObserver,
} from 'land/tests/helpers/media';

module('Integration | Component | whatsapp/message-media', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    const urlCalls = [];
    this.urlCalls = urlCalls;
    this.urls = [`${PNG_URL}#sig=1`];
    this.peeked = null;
    this.viewerOpened = [];
    const ctx = this;
    this.owner.register(
      'service:whatsapp',
      class extends Service {
        getMediaUrl(uuid, options) {
          urlCalls.push({ uuid, options });
          const next =
            ctx.urls[Math.min(urlCalls.length - 1, ctx.urls.length - 1)];
          return next instanceof Error
            ? Promise.reject(next)
            : Promise.resolve(next);
        }
        peekMediaUrl() {
          return ctx.peeked;
        }
        openMediaViewer(msg) {
          ctx.viewerOpened.push(msg);
        }
      },
    );
    this.io = installFakeIntersectionObserver();
    this.originalConsoleError = console.error;
    this.logged = [];
    console.error = (...args) => this.logged.push(args);
  });

  hooks.afterEach(function () {
    this.io.restore();
    console.error = this.originalConsoleError;
  });

  function media(overrides = {}) {
    return {
      id: 'wamid.1',
      uuid: 'row-1',
      hasMedia: true,
      mediaType: 'image',
      mediaMime: 'image/jpeg',
      mediaFileName: 'photo.jpg',
      mediaSizeBytes: 2048,
      mediaStatus: 'STORED',
      mediaStoredAt: '2026-09-25T10:00:00.000Z',
      mediaDeletedAt: null,
      mediaDeletedBy: null,
      body: '',
      fromMe: false,
      deletedAt: null,
      timestamp: Date.parse('2026-09-25T09:00:00.000Z'),
      ...overrides,
    };
  }

  // A real media error event does not bubble; a bubbling one would reach QUnit's window.onerror.
  async function mediaError(selector) {
    document.querySelector(selector).dispatchEvent(new Event('error'));
    await settled();
  }

  // Stands in for the attachments service holding local previews of just-sent files.
  function stubPlaceholders(ctx, placeholders) {
    const released = [];
    ctx.owner.register(
      'service:wa-attachments',
      class extends Service {
        placeholderFor(uuid) {
          return placeholders[uuid] ?? null;
        }
        releasePlaceholder(uuid) {
          released.push(uuid);
          delete placeholders[uuid];
        }
      },
    );
    return released;
  }

  function deferred() {
    let resolve;
    const promise = new Promise((done) => (resolve = done));
    return { promise, resolve };
  }

  async function renderMedia(ctx, message) {
    ctx.set('message', message);
    ctx.set('deleted', []);
    ctx.set('onDelete', (msg) => ctx.deleted.push(msg));
    await render(hbs`<Whatsapp::MessageMedia
      @message={{this.message}}
      @onDeleteMedia={{this.onDelete}}
    />`);
  }

  test('pending shows the type label, size and a receiving hint', async function (assert) {
    await renderMedia(
      this,
      media({
        mediaStatus: 'PENDING',
        mediaType: 'audio',
        mediaSizeBytes: 4096,
      }),
    );

    assert.dom('[data-test-wa-media-status="PENDING"]').exists();
    assert.dom('[data-test-wa-media-pending]').includesText('Voice message');
    assert.dom('[data-test-wa-media-size]').hasText('4 KB');
    assert.dom('[data-test-wa-media-pending]').includesText('Receiving');
    assert.dom('[data-test-wa-media-delete]').doesNotExist();
    assert.strictEqual(this.urlCalls.length, 0, 'no URL for pending media');
  });

  test('pending without a known size shows no size', async function (assert) {
    await renderMedia(
      this,
      media({ mediaStatus: 'PENDING', mediaSizeBytes: null }),
    );

    assert.dom('[data-test-wa-media-pending]').includesText('Photo');
    assert.dom('[data-test-wa-media-size]').doesNotExist();
  });

  test('failed and too large render text states with no image and no delete', async function (assert) {
    await renderMedia(this, media({ mediaStatus: 'FAILED' }));
    assert
      .dom('[data-test-wa-media-failed]')
      .hasText('Media could not be received');
    assert.dom('img').doesNotExist();
    assert.dom('[data-test-wa-media-delete]').doesNotExist();

    this.set('message', media({ mediaStatus: 'TOO_LARGE' }));
    assert
      .dom('[data-test-wa-media-too-large]')
      .hasText('File too large to receive');
    assert.dom('[data-test-wa-media-delete]').doesNotExist();
  });

  test('deleted inbound media shows one record line with an isolated file name', async function (assert) {
    await renderMedia(
      this,
      media({
        mediaStatus: 'DELETED',
        mediaFileName: 'lease.pdf',
        mediaType: 'document',
        mediaSizeBytes: 2 * 1024 * 1024,
        mediaDeletedAt: '2026-09-25T12:00:00.000Z',
      }),
    );

    const text = this.element
      .querySelector('[data-test-wa-media-record]')
      .textContent.replace(/\s+/g, ' ');
    assert.true(text.includes('lease.pdf'));
    assert.true(text.includes('2.0 MB'));
    assert.true(text.includes('Received on'));
    assert.true(text.includes('Media deleted on'));
    assert.dom('[data-test-wa-media-record] bdi').hasText('lease.pdf');
    assert.dom('[data-test-wa-media-delete]').doesNotExist();
    assert.dom('[data-test-wa-media-download]').doesNotExist();
  });

  test('deleted outbound media reads as sent', async function (assert) {
    await renderMedia(
      this,
      media({ mediaStatus: 'DELETED', fromMe: true, mediaDeletedAt: null }),
    );

    assert.dom('[data-test-wa-media-record]').includesText('Sent on');
    assert.dom('[data-test-wa-media-record]').doesNotIncludeText('Received');
  });

  test('a stored image loads its URL when observed, shows its size once and opens the viewer', async function (assert) {
    await renderMedia(this, media());

    assert.deepEqual(this.urlCalls, [{ uuid: 'row-1', options: undefined }]);
    assert.dom('[data-test-wa-media-image]').hasAttribute('src', this.urls[0]);
    assert.dom('[data-test-wa-media-size]').exists({ count: 1 });
    assert.dom('[data-test-wa-media-size]').hasText('2 KB');

    await click('[data-test-wa-media-open]');
    assert.strictEqual(this.viewerOpened.length, 1);
    assert.strictEqual(this.viewerOpened[0].uuid, 'row-1');
  });

  test('stored media shows the delete action, which hands the message up', async function (assert) {
    await renderMedia(this, media());

    assert
      .dom('[data-test-wa-media-delete]')
      .hasAttribute('aria-label', 'Delete media');
    await click('[data-test-wa-media-delete]');
    assert.strictEqual(this.deleted.length, 1);
    assert.strictEqual(this.deleted[0].uuid, 'row-1');
  });

  test('a sticker renders without a size line', async function (assert) {
    await renderMedia(this, media({ mediaType: 'sticker' }));
    assert.dom('[data-test-wa-media-sticker]').exists();
    assert.dom('[data-test-wa-media-size]').doesNotExist();
  });

  test('a video shows a paused preview with a play button and never plays inline', async function (assert) {
    this.urls = [wavUrl()];
    await renderMedia(this, media({ mediaType: 'video', uuid: 'row-2' }));

    assert
      .dom('[data-test-wa-media-video]')
      .hasAttribute('preload', 'metadata')
      .doesNotHaveAttribute('controls')
      .doesNotHaveAttribute('autoplay');
    assert.dom('[data-test-wa-media-size]').exists({ count: 1 });

    await click('[data-test-wa-media-video-open]');
    assert.strictEqual(this.viewerOpened.length, 1);
    assert.strictEqual(this.viewerOpened[0].uuid, 'row-2');
  });

  test('a just-sent image shows its local preview until the signed URL has loaded, then releases it', async function (assert) {
    const local = `${PNG_URL}#local`;
    const released = stubPlaceholders(this, { 'row-1': local });
    const signed = deferred();
    this.urls = [signed.promise];
    const OriginalImage = window.Image;
    const preloads = [];
    window.Image = class {
      set src(value) {
        this.url = value;
        preloads.push(this);
      }
    };
    try {
      await renderMedia(this, media());
      assert.dom('[data-test-wa-media-image]').hasAttribute('src', local);

      signed.resolve(`${PNG_URL}#sig=1`);
      await waitUntil(() => preloads.length === 1);
      assert.strictEqual(preloads[0].url, `${PNG_URL}#sig=1`);
      await settled();
      assert
        .dom('[data-test-wa-media-image]')
        .hasAttribute('src', local, 'preview stays while the signed URL loads');
      assert.deepEqual(released, []);

      preloads[0].onload();
      await waitUntil(() => released.length === 1);
      await settled();
      assert
        .dom('[data-test-wa-media-image]')
        .hasAttribute('src', `${PNG_URL}#sig=1`);
      assert.deepEqual(released, ['row-1']);
    } finally {
      window.Image = OriginalImage;
    }
  });

  test('a just-sent sticker shows its local preview until the signed URL resolves', async function (assert) {
    const local = `${PNG_URL}#local`;
    const released = stubPlaceholders(this, { 'row-1': local });
    const signed = deferred();
    this.urls = [signed.promise];
    await renderMedia(this, media({ mediaType: 'sticker' }));
    assert.dom('[data-test-wa-media-sticker]').hasAttribute('src', local);

    signed.resolve(`${PNG_URL}#sig=1`);
    await waitUntil(() => released.length === 1);
    await settled();
    assert
      .dom('[data-test-wa-media-sticker]')
      .hasAttribute('src', `${PNG_URL}#sig=1`);
  });

  test('a just-sent video shows its local first frame until the signed URL has loaded', async function (assert) {
    const local = wavUrl().replace(
      'data:audio/wav;',
      'data:audio/wav;name=local;',
    );
    const released = stubPlaceholders(this, { 'row-2': local });
    const signed = deferred();
    this.urls = [signed.promise];
    await renderMedia(this, media({ mediaType: 'video', uuid: 'row-2' }));

    const video = () => document.querySelector('[data-test-wa-media-video]');
    assert
      .dom('[data-test-wa-media-video]')
      .hasAttribute('src', `${local}#t=0.1`);
    await waitUntil(() => video().readyState >= 1, { timeout: 3000 });
    assert.deepEqual(released, [], 'the preview metadata releases nothing');

    signed.resolve(wavUrl());
    await waitUntil(() => released.length === 1, { timeout: 3000 });
    assert
      .dom('[data-test-wa-media-video]')
      .hasAttribute('src', `${wavUrl()}#t=0.1`);
    assert.deepEqual(released, ['row-2']);
  });

  test('a placeholder is released when the bubble goes away before its URL loads', async function (assert) {
    const released = stubPlaceholders(this, { 'row-1': `${PNG_URL}#local` });
    this.urls = [new Promise(() => {})];
    await renderMedia(this, media());
    assert.dom('[data-test-wa-media-image]').exists();

    await clearRender();
    assert.deepEqual(released, ['row-1']);
  });

  test('a failed URL fetch releases the placeholder', async function (assert) {
    const released = stubPlaceholders(this, { 'row-1': `${PNG_URL}#local` });
    this.urls = [new Error('boom')];
    await renderMedia(this, media());
    await settled();

    assert.dom('[data-test-wa-media-load-failed]').exists();
    assert.deepEqual(released, ['row-1']);
  });

  test('audio renders the custom player with its size inside it', async function (assert) {
    this.urls = [wavUrl()];
    await renderMedia(this, media({ mediaType: 'audio', uuid: 'row-3' }));

    assert.dom('[data-test-wa-audio-player]').exists();
    assert.dom('[data-test-wa-media-audio]').doesNotHaveAttribute('controls');
    assert.dom('[data-test-wa-media-size]').exists({ count: 1 });
    assert
      .dom('[data-test-wa-audio-player] [data-test-wa-media-size]')
      .exists();
  });

  test('a document is a real download link whose href loads on intersection', async function (assert) {
    this.urls = ['https://cdn.example.com/lease.pdf?sig=1'];
    await renderMedia(
      this,
      media({ mediaType: 'document', mediaFileName: 'lease.pdf' }),
    );

    assert.dom('[data-test-wa-media-file-name] bdi').hasText('lease.pdf');
    assert.dom('[data-test-wa-media-size]').exists({ count: 1 });
    assert.strictEqual(this.urlCalls.length, 1, 'fetched when visible');
    assert
      .dom('[data-test-wa-media-download]')
      .hasTagName('a')
      .hasAttribute('href', this.urls[0])
      .hasAttribute('download')
      .hasAttribute('target', '_blank')
      .hasAttribute('rel', 'noopener noreferrer');

    this.peeked = this.urls[0];
    const opened = [];
    const originalOpen = window.open;
    window.open = (...args) => opened.push(args);
    let prevented = null;
    const probe = (event) => {
      prevented = event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener('click', probe);
    try {
      await click('[data-test-wa-media-download]');
    } finally {
      document.removeEventListener('click', probe);
      window.open = originalOpen;
    }
    assert.false(prevented, 'a fresh href downloads natively');
    assert.strictEqual(opened.length, 0);
    assert.strictEqual(this.urlCalls.length, 1);
  });

  test('a document href near expiry opens a blank tab in the click, then points it at a new URL', async function (assert) {
    this.urls = [
      'https://cdn.example.com/lease.pdf?sig=1',
      'https://cdn.example.com/lease.pdf?sig=2',
    ];
    await renderMedia(this, media({ mediaType: 'document' }));

    this.peeked = null;
    const tab = { closed: false, opener: 'page', location: null };
    const opened = [];
    const originalOpen = window.open;
    window.open = (...args) => {
      opened.push(args);
      return tab;
    };
    try {
      await click('[data-test-wa-media-download]');
    } finally {
      window.open = originalOpen;
    }
    assert.deepEqual(
      opened,
      [['about:blank', '_blank']],
      'opened in the click',
    );
    assert.strictEqual(tab.opener, null);
    assert.strictEqual(tab.location, 'https://cdn.example.com/lease.pdf?sig=2');
    assert
      .dom('[data-test-wa-media-download]')
      .hasAttribute('href', 'https://cdn.example.com/lease.pdf?sig=2');
  });

  test('an image error fetches one fresh URL; a second error shows Could not load with Retry and Delete', async function (assert) {
    this.urls = [`${PNG_URL}#sig=1`, `${PNG_URL}#sig=2`];
    await renderMedia(this, media());

    await mediaError('[data-test-wa-media-image]');
    assert.deepEqual(this.urlCalls[1], {
      uuid: 'row-1',
      options: { fresh: true },
    });
    assert.dom('[data-test-wa-media-image]').hasAttribute('src', this.urls[1]);

    await mediaError('[data-test-wa-media-image]');
    assert.strictEqual(this.urlCalls.length, 2, 'no second refresh');
    assert.dom('[data-test-wa-media-image]').doesNotExist();
    assert.dom('[data-test-wa-media-failed]').doesNotExist();
    assert
      .dom('[data-test-wa-media-load-failed]')
      .includesText('Could not load');
    assert.dom('[data-test-wa-media-status="STORED"]').exists();
    assert.dom('[data-test-wa-media-delete]').exists('delete stays visible');
    assert.true(this.logged.length > 0, 'the failure is logged');
  });

  test('the retry reloads the element even when the fresh URL is identical', async function (assert) {
    this.urls = [`${PNG_URL}#same`];
    await renderMedia(this, media());
    const img = document.querySelector('[data-test-wa-media-image]');
    const writes = [];
    const originalSet = img.setAttribute.bind(img);
    img.setAttribute = (name, value) => {
      writes.push([name, value]);
      originalSet(name, value);
    };

    await mediaError('[data-test-wa-media-image]');

    assert.deepEqual(this.urlCalls[1].options, { fresh: true });
    assert.deepEqual(writes, [['src', this.urls[0]]], 'src re-applied');
  });

  test('a failed URL fetch shows Could not load; Retry observes a new element and loads again', async function (assert) {
    this.urls = [new Error('Network down'), `${PNG_URL}#sig=2`];
    await renderMedia(this, media());

    assert.dom('[data-test-wa-media-load-failed]').exists();
    assert.dom('[data-test-wa-media-delete]').exists();
    assert.strictEqual(this.logged.length, 1, 'logged');

    await click('[data-test-wa-media-retry]');
    assert.dom('[data-test-wa-media-load-failed]').doesNotExist();
    assert.strictEqual(this.urlCalls.length, 2);
    assert.dom('[data-test-wa-media-image]').hasAttribute('src', this.urls[1]);
  });

  test('the observer is one-shot per element and shared by one scroll root', async function (assert) {
    this.io.restore();
    this.io = installFakeIntersectionObserver({ autoFire: false });
    this.set('messages', [media(), media({ id: 'wamid.2', uuid: 'row-2' })]);
    await render(hbs`<div data-wa-media-root>
      {{#each this.messages key="id" as |m|}}
        <Whatsapp::MessageMedia @message={{m}} />
      {{/each}}
    </div>`);

    assert.strictEqual(this.io.instances.length, 1, 'one observer per root');
    const [observer] = this.io.instances;
    assert.strictEqual(
      observer.options.root,
      document.querySelector('[data-wa-media-root]'),
    );
    assert.strictEqual(observer.targets.size, 2);
    assert.strictEqual(this.urlCalls.length, 0, 'nothing loads unseen');

    const [first] = observer.targets;
    observer.fire(first);
    await settled();
    assert.strictEqual(this.urlCalls.length, 1);
    assert.strictEqual(observer.targets.size, 1, 'unobserved after firing');

    observer.fire(first);
    await settled();
    assert.strictEqual(this.urlCalls.length, 1, 'never fires twice');
    assert.false(observer.disconnected);
  });

  test('the observer disconnects when the chat goes away', async function (assert) {
    this.io.restore();
    this.io = installFakeIntersectionObserver({ autoFire: false });
    this.set('messages', [media(), media({ id: 'wamid.2', uuid: 'row-2' })]);
    await render(hbs`<div data-wa-media-root>
      {{#each this.messages key="id" as |m|}}
        <Whatsapp::MessageMedia @message={{m}} />
      {{/each}}
    </div>`);
    const [observer] = this.io.instances;

    this.set('messages', []);
    await settled();

    assert.true(observer.disconnected);
    assert.strictEqual(this.urlCalls.length, 0);
  });

  test('a caption renders under the media through the message text component', async function (assert) {
    await renderMedia(this, media({ body: 'Front *door*' }));

    assert.dom('[data-test-wa-media-caption]').hasText('Front door');
    assert.dom('[data-test-wa-media-caption] strong').hasText('door');
  });

  test('no caption element when the body is empty', async function (assert) {
    await renderMedia(this, media({ body: '' }));
    assert.dom('[data-test-wa-media-caption]').doesNotExist();
  });
});
