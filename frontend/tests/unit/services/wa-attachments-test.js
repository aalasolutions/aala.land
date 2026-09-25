import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import Service from '@ember/service';

function file(name, type = 'image/jpeg', body = 'x') {
  return new File([body], name, { type });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

module('Unit | Service | wa-attachments', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    const uploads = [];
    const toasts = [];
    this.uploads = uploads;
    this.toasts = toasts;
    // Each upload waits until the test settles it, so ordering is observable.
    this.owner.register(
      'service:whatsapp',
      class extends Service {
        sendMediaFile(chatId, sent, options) {
          return new Promise((resolve, reject) => {
            uploads.push({ chatId, file: sent, options, resolve, reject });
          });
        }
      },
    );
    this.owner.register(
      'service:notifications',
      class extends Service {
        error(message) {
          toasts.push(message);
        }
      },
    );
    this.service = this.owner.lookup('service:wa-attachments');
    this.sent = [];
    this.service.onSent = (row, chatId) => this.sent.push({ row, chatId });
  });

  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  test('add classifies each file and keeps refused ones with their error', function (assert) {
    const added = this.service.add([
      file('a.jpg'),
      file('a.zip', 'application/zip'),
    ]);

    assert.strictEqual(added.length, 2);
    assert.deepEqual(
      this.service.items.map((i) => [i.kind, i.state, i.refused, i.error]),
      [
        ['image', 'queued', false, null],
        [null, 'failed', true, 'This file type cannot be sent on WhatsApp.'],
      ],
    );
    assert.notStrictEqual(added[0].id, added[1].id, 'ids are unique');
  });

  test('setCaption, remove and clear edit the queue', function (assert) {
    const [a, b] = this.service.add([file('a.jpg'), file('b.jpg')]);
    this.service.setCaption(a.id, 'Kitchen');
    assert.strictEqual(this.service.items[0].caption, 'Kitchen');

    this.service.remove(a.id);
    assert.deepEqual(
      this.service.items.map((i) => i.id),
      [b.id],
    );

    this.service.clear();
    assert.deepEqual(this.service.items, []);
  });

  test('sendAll uploads one file at a time in queue order, with progress, and skips refused files', async function (assert) {
    const [a, , c] = this.service.add([
      file('a.jpg'),
      file('b.zip', 'application/zip'),
      file('c.pdf', 'application/pdf'),
    ]);
    this.service.setCaption(a.id, '  Kitchen  ');
    const run = this.service.sendAll('chat-1');

    assert.true(this.service.isSending);
    assert.strictEqual(
      this.uploads.length,
      1,
      'only the first file is uploading',
    );
    assert.strictEqual(this.uploads[0].file.name, 'a.jpg');
    assert.strictEqual(this.uploads[0].chatId, 'chat-1');
    assert.strictEqual(this.uploads[0].options.caption, 'Kitchen');
    assert.strictEqual(this.service.items[0].state, 'uploading');

    this.uploads[0].options.onProgress(40);
    assert.strictEqual(this.service.items[0].progress, 40);

    this.uploads[0].resolve({ success: true, data: { id: 'wamid.1' } });
    await tick();
    assert.strictEqual(this.uploads.length, 2);
    assert.strictEqual(this.uploads[1].file.name, 'c.pdf');
    assert.strictEqual(
      this.service.items.find((i) => i.id === a.id).state,
      'sent',
    );

    this.uploads[1].resolve({ success: true, data: { id: 'wamid.2' } });
    await run;

    assert.deepEqual(
      this.sent.map((s) => [s.row.id, s.chatId]),
      [
        ['wamid.1', 'chat-1'],
        ['wamid.2', 'chat-1'],
      ],
    );
    assert.false(this.service.isSending);
    assert.deepEqual(
      this.service.items.map((i) => i.file.name),
      ['b.zip'],
      'sent files leave the tray, the refused one stays',
    );
    assert.notOk(this.service.items.find((i) => i.id === c.id));
  });

  test('a 409 stops the queue, shows the server message on that file and toasts', async function (assert) {
    this.service.add([file('a.jpg'), file('b.jpg'), file('c.jpg')]);
    const run = this.service.sendAll('chat-1');

    this.uploads[0].resolve({ data: { id: 'wamid.1' } });
    await tick();
    this.uploads[1].reject(httpError(409, 'Reply window closed'));
    await run;

    assert.strictEqual(this.uploads.length, 2, 'the third file never uploads');
    assert.deepEqual(
      this.service.items.map((i) => [i.file.name, i.state, i.error]),
      [
        ['b.jpg', 'failed', 'Reply window closed'],
        ['c.jpg', 'queued', null],
      ],
    );
    assert.deepEqual(this.toasts, ['Reply window closed']);
    assert.false(this.service.isSending);
  });

  test('a file that failed on the server is sent again on the next send', async function (assert) {
    this.service.add([file('a.jpg')]);
    let run = this.service.sendAll('chat-1');
    this.uploads[0].reject(httpError(507, 'Storage quota exceeded'));
    await run;
    assert.strictEqual(this.service.items[0].state, 'failed');

    run = this.service.sendAll('chat-1');
    assert.strictEqual(this.service.items[0].error, null, 'error cleared');
    this.uploads[1].resolve({ data: { id: 'wamid.1' } });
    await run;
    assert.deepEqual(this.service.items, []);
  });

  test('a row Meta refused still counts as sent', async function (assert) {
    this.service.add([file('a.jpg'), file('b.jpg')]);
    const run = this.service.sendAll('chat-1');
    this.uploads[0].resolve({
      data: { id: 'local-u1', uuid: 'u1', status: 'failed', errorCode: 131053 },
    });
    await tick();
    assert.strictEqual(this.uploads.length, 2, 'the queue carries on');
    this.uploads[1].resolve({ data: { id: 'wamid.2' } });
    await run;

    assert.deepEqual(
      this.sent.map((s) => s.row.id),
      ['local-u1', 'wamid.2'],
    );
    assert.deepEqual(this.toasts, []);
    assert.deepEqual(this.service.items, []);
  });

  test('an audio or sticker file is sent without a caption even if one was set', async function (assert) {
    const [a, s] = this.service.add([
      file('a.mp3', 'audio/mpeg'),
      file('s.webp', 'image/webp'),
    ]);
    this.service.setCaption(a.id, 'Voice note');
    this.service.setCaption(s.id, 'Sticker');
    const run = this.service.sendAll('chat-1');
    assert.false('caption' in this.uploads[0].options, 'audio');
    this.uploads[0].resolve({ data: { id: 'wamid.1' } });
    await tick();
    assert.false('caption' in this.uploads[1].options, 'sticker');
    this.uploads[1].resolve({ data: { id: 'wamid.2' } });
    await run;
  });

  test('progress is rounded to a whole percent and patched only on change', async function (assert) {
    const [a] = this.service.add([file('a.jpg')]);
    const run = this.service.sendAll('chat-1');
    let patches = 0;
    const original = this.service._patch;
    this.service._patch = (...args) => {
      patches++;
      return original.apply(this.service, args);
    };
    const { onProgress } = this.uploads[0].options;
    onProgress(40.2);
    onProgress(40.4);
    onProgress(39.6);
    onProgress(40);
    assert.strictEqual(patches, 1, 'equal values patch once');
    assert.strictEqual(
      this.service.items.find((i) => i.id === a.id).progress,
      40,
    );
    onProgress(41.2);
    assert.strictEqual(patches, 2);
    this.service._patch = original;
    this.uploads[0].resolve({ data: { id: 'wamid.1' } });
    await run;
  });

  test('clear during a send drops the queue and ignores the late response', async function (assert) {
    this.service.add([file('a.jpg'), file('b.jpg')]);
    const run = this.service.sendAll('chat-1');
    this.service.clear();
    assert.false(this.service.isSending);

    this.uploads[0].resolve({ data: { id: 'wamid.1' } });
    await run;

    assert.strictEqual(this.uploads.length, 1, 'no further upload');
    assert.deepEqual(this.sent, [], 'late row not handed on');
    assert.deepEqual(this.service.items, []);
  });
});
