import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import {
  render,
  click,
  fillIn,
  find,
  findAll,
  settled,
} from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

function item(overrides = {}) {
  return {
    id: 'att-1',
    file: new File(['12345'], 'photo.jpg', { type: 'image/jpeg' }),
    kind: 'image',
    caption: '',
    error: null,
    refused: false,
    progress: 0,
    state: 'queued',
    ...overrides,
  };
}

module('Integration | Component | whatsapp/attachment-tray', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.calls = [];
    this.onCaption = (id, value) => this.calls.push(['caption', id, value]);
    this.onRemove = (id) => this.calls.push(['remove', id]);
    this.onSend = () => this.calls.push(['send']);
    this.onClear = () => this.calls.push(['clear']);
    this.disabled = false;
  });

  const renderTray = () =>
    render(hbs`<Whatsapp::AttachmentTray
      @items={{this.items}}
      @disabled={{this.disabled}}
      @onCaption={{this.onCaption}}
      @onRemove={{this.onRemove}}
      @onSend={{this.onSend}}
      @onClear={{this.onClear}}
    />`);

  test('a queued image shows its thumbnail, name, size and an empty caption', async function (assert) {
    this.items = [item()];
    await renderTray();

    assert.dom('[data-test-wa-attachment]').exists({ count: 1 });
    assert
      .dom('[data-test-wa-attachment-thumb]')
      .hasAttribute('src', /^blob:/, 'object URL preview');
    assert.dom('[data-test-wa-attachment-name]').hasText('photo.jpg');
    assert.dom('[data-test-wa-attachment-size]').hasText('5 B');
    assert.dom('[data-test-wa-attachment-caption]').hasValue('');
    assert
      .dom('[data-test-wa-attachment-caption]')
      .hasAttribute('maxlength', '1024');
    assert.dom('[data-test-wa-attachment-progress]').doesNotExist();
    assert.dom('[data-test-wa-attachment-send]').hasText('Send 1 file');
    assert.dom('[data-test-wa-attachment-send]').isNotDisabled();
  });

  test('a document shows an icon instead of a thumbnail', async function (assert) {
    this.items = [
      item({
        file: new File(['x'], 'lease.pdf', { type: 'application/pdf' }),
        kind: 'document',
      }),
    ];
    await renderTray();

    assert.dom('[data-test-wa-attachment-thumb]').doesNotExist();
    assert.dom('[data-test-wa-attachment-icon]').exists();
  });

  test('an audio or sticker row has no caption field', async function (assert) {
    this.items = [
      item({
        file: new File(['x'], 'note.mp3', { type: 'audio/mpeg' }),
        kind: 'audio',
      }),
      item({
        id: 'att-2',
        file: new File(['x'], 's.webp', { type: 'image/webp' }),
        kind: 'sticker',
      }),
      item({ id: 'att-3' }),
    ];
    await renderTray();

    assert
      .dom(
        '[data-test-wa-attachment="att-1"] [data-test-wa-attachment-caption]',
      )
      .doesNotExist();
    assert
      .dom(
        '[data-test-wa-attachment="att-2"] [data-test-wa-attachment-caption]',
      )
      .doesNotExist();
    assert
      .dom(
        '[data-test-wa-attachment="att-3"] [data-test-wa-attachment-caption]',
      )
      .exists();
    assert.dom('[data-test-wa-attachment-send]').hasText('Send 3 files');
  });

  test('removing a row revokes its object URL', async function (assert) {
    const revoked = [];
    const original = URL.revokeObjectURL;
    URL.revokeObjectURL = (url) => {
      revoked.push(url);
      original.call(URL, url);
    };
    try {
      this.items = [item()];
      await renderTray();
      const src = find('[data-test-wa-attachment-thumb]').getAttribute('src');

      this.set('items', []);
      await settled();
      assert.deepEqual(revoked, [src]);
    } finally {
      URL.revokeObjectURL = original;
    }
  });

  test('caption, remove, clear and send call back with the item id', async function (assert) {
    this.items = [item(), item({ id: 'att-2' })];
    await renderTray();

    await fillIn(
      '[data-test-wa-attachment="att-2"] [data-test-wa-attachment-caption]',
      'Kitchen',
    );
    await click(
      '[data-test-wa-attachment="att-1"] [data-test-wa-attachment-remove]',
    );
    await click('[data-test-wa-attachment-clear]');
    await click('[data-test-wa-attachment-send]');

    assert.deepEqual(this.calls, [
      ['caption', 'att-2', 'Kitchen'],
      ['remove', 'att-1'],
      ['clear'],
      ['send'],
    ]);
    assert.dom('[data-test-wa-attachment-send]').hasText('Send 2 files');
  });

  test('an uploading file shows progress and locks the tray', async function (assert) {
    this.items = [
      item({ state: 'uploading', progress: 45 }),
      item({ id: 'att-2' }),
    ];
    await renderTray();

    assert
      .dom('[data-test-wa-attachment="att-1"]')
      .hasAttribute('data-test-wa-attachment-state', 'uploading');
    assert
      .dom('[data-test-wa-attachment-progress] [role="progressbar"]')
      .hasAttribute('aria-valuenow', '45');
    for (const button of findAll('[data-test-wa-attachment-remove]')) {
      assert.dom(button).isDisabled();
    }
    assert.dom('[data-test-wa-attachment-clear]').isDisabled();
    assert.dom('[data-test-wa-attachment-send]').isDisabled();
  });

  test('a refused file shows its error, no caption, and is not counted', async function (assert) {
    this.items = [
      item({
        state: 'failed',
        refused: true,
        kind: null,
        error: 'This file type cannot be sent on WhatsApp.',
      }),
    ];
    await renderTray();

    assert
      .dom('[data-test-wa-attachment-error]')
      .hasText('This file type cannot be sent on WhatsApp.');
    assert.dom('[data-test-wa-attachment-caption]').doesNotExist();
    assert.dom('[data-test-wa-attachment-remove]').isNotDisabled();
    assert.dom('[data-test-wa-attachment-send]').hasText('Send 0 files');
    assert.dom('[data-test-wa-attachment-send]').isDisabled();
  });

  test('a file the server refused keeps its caption and is sent again', async function (assert) {
    this.items = [
      item({ state: 'failed', error: 'Reply window closed', caption: 'Hi' }),
    ];
    await renderTray();

    assert
      .dom('[data-test-wa-attachment-error]')
      .hasText('Reply window closed');
    assert.dom('[data-test-wa-attachment-caption]').hasValue('Hi');
    assert.dom('[data-test-wa-attachment-send]').hasText('Send 1 file');
  });

  test('a sent file shows a check instead of remove', async function (assert) {
    this.items = [item({ state: 'sent', progress: 100 })];
    await renderTray();

    assert.dom('[data-test-wa-attachment-sent]').exists();
    assert.dom('[data-test-wa-attachment-remove]').doesNotExist();
    assert.dom('[data-test-wa-attachment-caption]').isDisabled();
  });

  test('@disabled disables send and captions but not remove', async function (assert) {
    this.items = [item()];
    this.disabled = true;
    await renderTray();

    assert.dom('[data-test-wa-attachment-send]').isDisabled();
    assert.dom('[data-test-wa-attachment-caption]').isDisabled();
    assert.dom('[data-test-wa-attachment-remove]').isNotDisabled();
  });
});
