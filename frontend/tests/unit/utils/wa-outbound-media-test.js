import { module, test } from 'qunit';
import {
  canCaption,
  classifyOutboundFile,
  formatLimit,
  isRetryableSend,
  OUTBOUND_ACCEPT,
  UNSUPPORTED_TYPE_ERROR,
  VIDEO_TOO_LARGE_ERROR,
} from 'land/utils/wa-outbound-media';

const KB = 1024;
const MB = 1024 * 1024;

// A File whose reported size is fixed, so no test allocates megabytes.
function fakeFile(name, type, size) {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

module('Unit | Utility | wa-outbound-media', function () {
  test('formatLimit prints whole megabytes and kilobytes', function (assert) {
    assert.strictEqual(formatLimit(5 * MB), '5 MB');
    assert.strictEqual(formatLimit(100 * MB), '100 MB');
    assert.strictEqual(formatLimit(500 * KB), '500 KB');
  });

  test('each accepted type maps to its kind at the limit', function (assert) {
    const cases = [
      ['a.jpg', 'image/jpeg', 5 * MB, 'image'],
      ['a.png', 'image/png', 5 * MB, 'image'],
      ['a.mp4', 'video/mp4', 16 * MB, 'video'],
      ['a.3gp', 'video/3gpp', 16 * MB, 'video'],
      ['a.aac', 'audio/aac', 16 * MB, 'audio'],
      ['a.amr', 'audio/amr', 16 * MB, 'audio'],
      ['a.mp3', 'audio/mpeg', 16 * MB, 'audio'],
      ['a.m4a', 'audio/mp4', 16 * MB, 'audio'],
      ['a.ogg', 'audio/ogg', 16 * MB, 'audio'],
      ['a.webp', 'image/webp', 500 * KB, 'sticker'],
      ['a.pdf', 'application/pdf', 100 * MB, 'document'],
      [
        'a.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        MB,
        'document',
      ],
      ['a.xls', 'application/vnd.ms-excel', MB, 'document'],
      ['a.txt', 'text/plain', KB, 'document'],
      ['a.rtf', 'application/rtf', KB, 'document'],
      ['a.md', 'text/markdown', KB, 'document'],
      ['a.csv', 'text/csv', KB, 'document'],
      ['a.gif', 'image/gif', MB, 'document'],
    ];
    for (const [name, type, size, kind] of cases) {
      assert.deepEqual(
        classifyOutboundFile(fakeFile(name, type, size)),
        { kind, error: null },
        name,
      );
    }
  });

  test('a file one byte over its limit is refused with the type in the message', function (assert) {
    assert.deepEqual(
      classifyOutboundFile(fakeFile('a.jpg', 'image/jpeg', 5 * MB + 1)),
      { kind: 'image', error: 'Image is over 5 MB.' },
    );
    assert.deepEqual(
      classifyOutboundFile(fakeFile('a.mp3', 'audio/mpeg', 16 * MB + 1)),
      { kind: 'audio', error: 'Audio is over 16 MB.' },
    );
    assert.deepEqual(
      classifyOutboundFile(fakeFile('a.webp', 'image/webp', 500 * KB + 1)),
      { kind: 'sticker', error: 'Sticker is over 500 KB.' },
    );
    assert.deepEqual(
      classifyOutboundFile(fakeFile('a.pdf', 'application/pdf', 100 * MB + 1)),
      { kind: 'document', error: 'File is over 100 MB.' },
    );
  });

  test('a video over 16 MB gets the send-as-document message', function (assert) {
    const result = classifyOutboundFile(
      fakeFile('clip.mp4', 'video/mp4', 16 * MB + 1),
    );
    assert.strictEqual(result.kind, 'video');
    assert.strictEqual(result.error, VIDEO_TOO_LARGE_ERROR);
    assert.strictEqual(
      VIDEO_TOO_LARGE_ERROR,
      'Video is over 16 MB. Send it as a document instead.',
    );
  });

  test('an unknown or missing type is refused', function (assert) {
    for (const type of ['application/zip', 'video/webm', '']) {
      assert.deepEqual(
        classifyOutboundFile(fakeFile('a.bin', type, 10)),
        { kind: null, error: UNSUPPORTED_TYPE_ERROR },
        type || 'empty type',
      );
    }
    assert.strictEqual(
      UNSUPPORTED_TYPE_ERROR,
      'This file type cannot be sent on WhatsApp.',
    );
  });

  test('the picker accept list holds every accepted type', function (assert) {
    const accepted = OUTBOUND_ACCEPT.split(',');
    assert.true(accepted.includes('image/jpeg'));
    assert.true(accepted.includes('image/webp'));
    assert.true(accepted.includes('application/pdf'));
    for (const type of [
      'application/rtf',
      'text/markdown',
      'text/csv',
      'image/gif',
    ]) {
      assert.true(accepted.includes(type), type);
    }
    assert.false(accepted.includes('application/zip'));
  });

  test('an empty type with a text extension is a document', function (assert) {
    for (const name of [
      'a.txt',
      'notes.MD',
      'a.markdown',
      'a.csv',
      'a.log',
      'a.json',
    ]) {
      assert.deepEqual(
        classifyOutboundFile(fakeFile(name, '', KB)),
        { kind: 'document', error: null },
        name,
      );
    }
    assert.deepEqual(
      classifyOutboundFile(fakeFile('a.log', '', 100 * MB + 1)),
      { kind: 'document', error: 'File is over 100 MB.' },
    );
    for (const name of ['a.zip', 'a', 'md', 'a.exe']) {
      assert.deepEqual(
        classifyOutboundFile(fakeFile(name, '', KB)),
        { kind: null, error: UNSUPPORTED_TYPE_ERROR },
        name,
      );
    }
  });

  test('canCaption holds for image, video and document only', function (assert) {
    for (const kind of ['image', 'video', 'document']) {
      assert.true(canCaption(kind), kind);
      assert.true(canCaption({ kind }), `item ${kind}`);
    }
    for (const kind of ['audio', 'sticker', null, undefined]) {
      assert.false(canCaption(kind), String(kind));
      assert.false(canCaption({ kind }), `item ${kind}`);
    }
    assert.false(canCaption(null));
  });

  test('isRetryableSend needs a failed or unsettled media row with a local id', function (assert) {
    const row = {
      id: 'local-row-1',
      status: 'failed',
      hasMedia: true,
    };
    assert.true(isRetryableSend(row));
    assert.false(isRetryableSend({ ...row, status: 'sent' }), 'not failed');
    assert.true(isRetryableSend({ ...row, status: null }), 'abandoned retry');
    assert.false(isRetryableSend({ ...row, hasMedia: false }), 'text row');
    assert.false(isRetryableSend({ ...row, id: 'wamid.ABC' }), 'Meta id');
    assert.false(isRetryableSend(null));
  });
});
