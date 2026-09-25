import { module, test } from 'qunit';
import { mediaLabel, mediaTypeLabel } from 'land/utils/wa-media-label';

module('Unit | Utility | wa-media-label', function () {
  test('mediaTypeLabel names the known types and falls back to Attachment', function (assert) {
    assert.strictEqual(mediaTypeLabel('image'), 'Photo');
    assert.strictEqual(mediaTypeLabel('video'), 'Video');
    assert.strictEqual(mediaTypeLabel('audio'), 'Voice message');
    assert.strictEqual(mediaTypeLabel('document'), 'Document');
    assert.strictEqual(mediaTypeLabel('sticker'), 'Sticker');
    assert.strictEqual(mediaTypeLabel('media_placeholder'), 'Attachment');
    assert.strictEqual(mediaTypeLabel(undefined), 'Attachment');
  });

  test('mediaLabel prefers the file name and falls back to the type label', function (assert) {
    assert.strictEqual(
      mediaLabel({ mediaFileName: 'lease.pdf', mediaType: 'document' }),
      'lease.pdf',
    );
    assert.strictEqual(
      mediaLabel({ mediaFileName: '', mediaType: 'image' }),
      'Photo',
    );
    assert.strictEqual(mediaLabel({ mediaType: 'nope' }), 'Attachment');
    assert.strictEqual(mediaLabel(null), 'Attachment');
  });
});
