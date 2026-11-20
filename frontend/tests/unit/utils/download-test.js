import { module, test } from 'qunit';
import {
  filenameFromDisposition,
  saveResponseAsFile,
} from 'land/utils/download';

module('Unit | Utility | download', function () {
  test('filenameFromDisposition reads both header spellings', function (assert) {
    assert.strictEqual(filenameFromDisposition(null), null);
    assert.strictEqual(filenameFromDisposition('attachment'), null);
    assert.strictEqual(
      filenameFromDisposition('attachment; filename="contacts.csv"'),
      'contacts.csv',
    );
    assert.strictEqual(
      filenameFromDisposition('attachment; filename=contacts.xlsx'),
      'contacts.xlsx',
    );
    assert.strictEqual(
      filenameFromDisposition(
        "attachment; filename*=UTF-8''contacts%202026.csv",
      ),
      'contacts 2026.csv',
      'the encoded spelling is decoded',
    );
    assert.strictEqual(
      filenameFromDisposition(
        'attachment; filename*=UTF-8\'\'contacts%202026.csv; filename="contacts.csv"',
      ),
      'contacts 2026.csv',
      'the encoded spelling wins when both are present',
    );
    assert.strictEqual(
      filenameFromDisposition("attachment; filename*=UTF-8''bad%E0%A4%A"),
      'bad%E0%A4%A',
      'a value that fails decoding is kept as sent',
    );
  });

  test('saveResponseAsFile names the file from the header and falls back', async function (assert) {
    const clicked = [];
    const realCreate = URL.createObjectURL;
    const realRevoke = URL.revokeObjectURL;
    const realClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function () {
      clicked.push(this.download);
    };
    const response = (disposition) => ({
      headers: new Headers(
        disposition ? { 'Content-Disposition': disposition } : {},
      ),
      async blob() {
        return new Blob(['a']);
      },
    });
    try {
      assert.strictEqual(
        await saveResponseAsFile(
          response('attachment; filename="from-server.csv"'),
          'fallback.csv',
        ),
        'from-server.csv',
      );
      assert.strictEqual(
        await saveResponseAsFile(response(null), 'fallback.csv'),
        'fallback.csv',
      );
    } finally {
      URL.createObjectURL = realCreate;
      URL.revokeObjectURL = realRevoke;
      HTMLAnchorElement.prototype.click = realClick;
    }
    assert.deepEqual(clicked, ['from-server.csv', 'fallback.csv']);
  });
});
