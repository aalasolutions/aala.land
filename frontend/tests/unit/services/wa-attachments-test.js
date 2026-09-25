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

    this.created = [];
    this.revoked = [];
    this.originalCreate = URL.createObjectURL;
    this.originalRevoke = URL.revokeObjectURL;
    let seq = 0;
    URL.createObjectURL = () => {
      const url = `blob:test/${++seq}`;
      this.created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => this.revoked.push(url);
  });

  hooks.afterEach(function () {
    this.service.reset();
    URL.createObjectURL = this.originalCreate;
    URL.revokeObjectURL = this.originalRevoke;
  });

  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const pendingNames = (service, chatId) =>
    service.pendingFor(chatId).map((p) => p.file.name);

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

  test('setCaption, remove and clear edit the tray', function (assert) {
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

  test('sendAll moves every sendable file to pending at once and leaves refused ones in the tray', function (assert) {
    const [a, , c] = this.service.add([
      file('a.jpg'),
      file('b.zip', 'application/zip'),
      file('c.pdf', 'application/pdf'),
    ]);
    this.service.setCaption(a.id, '  Kitchen  ');
    this.service.setCaption(c.id, 'Lease');

    const run = this.service.sendAll('chat-1');

    assert.ok(run, 'returns the upload run');
    assert.deepEqual(
      this.service.items.map((i) => i.file.name),
      ['b.zip'],
    );
    assert.deepEqual(
      this.service
        .pendingFor('chat-1')
        .map((p) => [p.id, p.chatId, p.state, p.progress, p.caption]),
      [
        [a.id, 'chat-1', 'uploading', 0, 'Kitchen'],
        [c.id, 'chat-1', 'uploading', 0, 'Lease'],
      ],
    );
    assert.strictEqual(
      this.service.pendingFor('chat-1')[0].previewUrl,
      'blob:test/1',
      'image gets an object URL',
    );
    assert.strictEqual(
      this.service.pendingFor('chat-1')[1].previewUrl,
      null,
      'document gets none',
    );
    assert.strictEqual(this.service.sendAll('chat-1'), null, 'nothing left');
  });

  test('uploads run one at a time in send order, with progress, and each response replaces its bubble', async function (assert) {
    this.service.add([file('a.jpg'), file('c.pdf', 'application/pdf')]);
    const run = this.service.sendAll('chat-1');

    assert.strictEqual(this.uploads.length, 1, 'only the first is uploading');
    assert.strictEqual(this.uploads[0].file.name, 'a.jpg');
    assert.strictEqual(this.uploads[0].chatId, 'chat-1');

    this.uploads[0].options.onProgress(40);
    assert.strictEqual(this.service.pendingFor('chat-1')[0].progress, 40);

    this.uploads[0].resolve({ success: true, data: { id: 'wamid.1' } });
    await tick();
    assert.deepEqual(pendingNames(this.service, 'chat-1'), ['c.pdf']);
    assert.deepEqual(this.revoked, ['blob:test/1'], 'preview released');
    assert.strictEqual(this.uploads.length, 2);
    assert.strictEqual(this.uploads[1].file.name, 'c.pdf');

    this.uploads[1].resolve({ success: true, data: { id: 'wamid.2' } });
    await run;

    assert.deepEqual(
      this.sent.map((s) => [s.row.id, s.chatId]),
      [
        ['wamid.1', 'chat-1'],
        ['wamid.2', 'chat-1'],
      ],
    );
    assert.deepEqual(this.service.pendingFor('chat-1'), []);
    assert.false(this.service.pendingByChat.has('chat-1'), 'empty chat pruned');
  });

  test('a second send queues after the running upload', async function (assert) {
    this.service.add([file('a.jpg')]);
    const first = this.service.sendAll('chat-1');
    this.service.add([file('b.jpg')]);
    const second = this.service.sendAll('chat-1');

    assert.strictEqual(second, first, 'joins the same run');
    assert.strictEqual(this.uploads.length, 1);
    assert.deepEqual(pendingNames(this.service, 'chat-1'), ['a.jpg', 'b.jpg']);

    this.uploads[0].resolve({ data: { id: 'wamid.1' } });
    await tick();
    assert.strictEqual(this.uploads[1].file.name, 'b.jpg');
    this.uploads[1].resolve({ data: { id: 'wamid.2' } });
    await first;
    assert.deepEqual(
      this.sent.map((s) => s.row.id),
      ['wamid.1', 'wamid.2'],
    );
  });

  test('a failure marks that bubble failed with the server message and the queue carries on', async function (assert) {
    this.service.add([file('a.jpg'), file('b.jpg')]);
    const run = this.service.sendAll('chat-1');

    this.uploads[0].reject(httpError(409, 'Reply window closed'));
    await tick();
    assert.deepEqual(
      this.service
        .pendingFor('chat-1')
        .map((p) => [p.file.name, p.state, p.error]),
      [
        ['a.jpg', 'failed', 'Reply window closed'],
        ['b.jpg', 'uploading', null],
      ],
    );
    assert.deepEqual(this.toasts, ['Reply window closed']);
    assert.strictEqual(this.uploads.length, 2);

    this.uploads[1].resolve({ data: { id: 'wamid.2' } });
    await run;
    assert.deepEqual(pendingNames(this.service, 'chat-1'), ['a.jpg']);
  });

  test('retry re-runs a failed upload and remove drops it', async function (assert) {
    const [a, b] = this.service.add([file('a.jpg'), file('b.jpg')]);
    let run = this.service.sendAll('chat-1');
    this.uploads[0].reject(httpError(507, 'Storage quota exceeded'));
    await tick();
    this.uploads[1].reject(new Error('Upload failed'));
    await run;

    run = this.service.retryPending(a.id);
    const retried = this.service.pendingFor('chat-1')[0];
    assert.strictEqual(retried.state, 'uploading');
    assert.strictEqual(retried.error, null, 'error cleared');
    assert.strictEqual(this.uploads.length, 3);
    assert.strictEqual(this.uploads[2].file.name, 'a.jpg');
    this.uploads[2].resolve({ data: { id: 'wamid.1' } });
    await run;

    this.service.removePending(b.id);
    assert.deepEqual(this.service.pendingFor('chat-1'), []);
    assert.deepEqual(this.revoked, ['blob:test/1', 'blob:test/2']);
    assert.deepEqual(
      this.sent.map((s) => s.row.id),
      ['wamid.1'],
    );
  });

  test('a video gets a preview URL too', function (assert) {
    this.service.add([file('tour.mp4', 'video/mp4')]);
    this.service.sendAll('chat-1');
    assert.strictEqual(
      this.service.pendingFor('chat-1')[0].previewUrl,
      'blob:test/1',
    );
  });

  test('a response row keeps the preview as its placeholder until released', async function (assert) {
    this.service.add([file('a.jpg'), file('c.pdf', 'application/pdf')]);
    const run = this.service.sendAll('chat-1');
    let seen = null;
    this.service.onSent = (row) =>
      (seen = this.service.placeholderFor(row.uuid));

    this.uploads[0].resolve({ data: { id: 'wamid.1', uuid: 'u1' } });
    await tick();
    this.uploads[1].resolve({ data: { id: 'wamid.2', uuid: 'u2' } });
    await run;

    assert.strictEqual(seen, null, 'a document hands on no placeholder');
    assert.deepEqual(this.revoked, [], 'nothing revoked on response');
    assert.strictEqual(this.service.placeholderFor('u1'), 'blob:test/1');
    assert.strictEqual(this.service.placeholderFor('u2'), null);
    assert.strictEqual(this.service.placeholderFor(null), null);

    this.service.releasePlaceholder('u1');
    assert.deepEqual(this.revoked, ['blob:test/1']);
    assert.strictEqual(this.service.placeholderFor('u1'), null);
    this.service.releasePlaceholder('u1');
    assert.deepEqual(this.revoked, ['blob:test/1'], 'release is idempotent');
  });

  test('the placeholder is set before the row is handed on', async function (assert) {
    this.service.add([file('a.jpg')]);
    const run = this.service.sendAll('chat-1');
    let seen = null;
    this.service.onSent = (row) =>
      (seen = this.service.placeholderFor(row.uuid));
    this.uploads[0].resolve({ data: { id: 'wamid.1', uuid: 'u1' } });
    await run;
    assert.strictEqual(seen, 'blob:test/1');
  });

  test('reset revokes every held placeholder', async function (assert) {
    this.service.add([file('a.jpg'), file('b.jpg')]);
    const run = this.service.sendAll('chat-1');
    this.uploads[0].resolve({ data: { id: 'wamid.1', uuid: 'u1' } });
    await tick();
    this.uploads[1].resolve({ data: { id: 'wamid.2', uuid: 'u2' } });
    await run;
    assert.deepEqual(this.revoked, []);

    this.service.reset();
    assert.deepEqual(this.revoked, ['blob:test/1', 'blob:test/2']);
    assert.strictEqual(this.service.placeholderFor('u1'), null);
    assert.strictEqual(this.service.placeholderByUuid.size, 0);
  });

  test('a row Meta refused still replaces its bubble', async function (assert) {
    this.service.add([file('a.jpg')]);
    const run = this.service.sendAll('chat-1');
    this.uploads[0].resolve({
      data: { id: 'local-u1', uuid: 'u1', status: 'failed', errorCode: 131053 },
    });
    await run;

    assert.deepEqual(
      this.sent.map((s) => s.row.id),
      ['local-u1'],
    );
    assert.deepEqual(this.toasts, []);
    assert.deepEqual(this.service.pendingFor('chat-1'), []);
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

  test('progress is rounded to a whole percent and written only on change', async function (assert) {
    this.service.add([file('a.jpg')]);
    const run = this.service.sendAll('chat-1');
    let writes = 0;
    const original = this.service._setPending;
    this.service._setPending = (...args) => {
      writes++;
      return original.apply(this.service, args);
    };
    const { onProgress } = this.uploads[0].options;
    onProgress(40.2);
    onProgress(40.4);
    onProgress(39.6);
    onProgress(40);
    assert.strictEqual(writes, 1, 'equal values write once');
    assert.strictEqual(this.service.pendingFor('chat-1')[0].progress, 40);
    onProgress(41.2);
    assert.strictEqual(writes, 2);
    this.service._setPending = original;
    this.uploads[0].resolve({ data: { id: 'wamid.1' } });
    await run;
  });

  test('pending uploads are kept per chat and keep running across a tray clear', async function (assert) {
    this.service.add([file('a.jpg')]);
    const runOne = this.service.sendAll('chat-1');
    this.service.clear();
    this.service.add([file('b.jpg')]);
    const runTwo = this.service.sendAll('chat-2');

    assert.deepEqual(pendingNames(this.service, 'chat-1'), ['a.jpg']);
    assert.deepEqual(pendingNames(this.service, 'chat-2'), ['b.jpg']);
    assert.deepEqual(this.service.pendingFor(null), []);
    assert.strictEqual(this.uploads.length, 2, 'each chat runs its own queue');

    this.uploads[0].resolve({ data: { id: 'wamid.1' } });
    this.uploads[1].resolve({ data: { id: 'wamid.2' } });
    await Promise.all([runOne, runTwo]);
    assert.deepEqual(
      this.sent.map((s) => [s.row.id, s.chatId]),
      [
        ['wamid.1', 'chat-1'],
        ['wamid.2', 'chat-2'],
      ],
    );
  });

  test('reset drops the tray and every pending upload, revokes previews and ignores late responses', async function (assert) {
    this.service.add([file('a.jpg'), file('b.jpg')]);
    const run = this.service.sendAll('chat-1');
    this.service.add([file('c.jpg')]);

    this.service.reset();
    assert.deepEqual(this.service.items, []);
    assert.strictEqual(this.service.pendingByChat.size, 0);
    assert.deepEqual(this.revoked, ['blob:test/1', 'blob:test/2']);

    this.uploads[0].options.onProgress(50);
    this.uploads[0].resolve({ data: { id: 'wamid.1' } });
    await run;

    assert.strictEqual(this.uploads.length, 1, 'no further upload');
    assert.deepEqual(this.sent, [], 'late row not handed on');
    assert.strictEqual(this.service.pendingByChat.size, 0);
  });
});
