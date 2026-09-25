import { module, test } from 'qunit';
import { splitMessageLinks } from 'land/utils/message-links';

module('Unit | Utility | message-links', function () {
  test('splits text around an https link', function (assert) {
    assert.deepEqual(splitMessageLinks('See https://aala.land/units now'), [
      { isLink: false, value: 'See ' },
      {
        isLink: true,
        value: 'https://aala.land/units',
        href: 'https://aala.land/units',
        host: 'aala.land',
      },
      { isLink: false, value: ' now' },
    ]);
  });

  test('a www link opens over https', function (assert) {
    const [part] = splitMessageLinks('www.example.com');
    assert.strictEqual(part.href, 'https://www.example.com/');
  });

  test('never makes a non-web scheme clickable', function (assert) {
    for (const text of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'mailto:a@example.com',
    ]) {
      assert.true(
        splitMessageLinks(text).every((part) => !part.isLink),
        text,
      );
    }
  });

  test('trailing punctuation stays outside the link', function (assert) {
    const parts = splitMessageLinks('Open https://example.com/a. Thanks!');
    assert.strictEqual(parts[1].value, 'https://example.com/a');
    assert.strictEqual(parts[2].value, '. Thanks!');
  });

  test('a closing bracket belongs to the link only when it opened one', function (assert) {
    assert.strictEqual(
      splitMessageLinks('(see https://example.com/x)')[1].value,
      'https://example.com/x',
    );
    assert.strictEqual(
      splitMessageLinks('https://en.wikipedia.org/wiki/A_(b)')[0].value,
      'https://en.wikipedia.org/wiki/A_(b)',
    );
  });

  test('a lookalike domain is shown in punycode', function (assert) {
    const [part] = splitMessageLinks('https://аpple.com/login');
    assert.true(part.host.startsWith('xn--'));
  });

  test('empty or missing text gives no parts', function (assert) {
    assert.deepEqual(splitMessageLinks(''), []);
    assert.deepEqual(splitMessageLinks(null), []);
  });

  test('markdown-style emphasis and balanced brackets are handled', function (assert) {
    assert.strictEqual(
      splitMessageLinks('*https://x.com*')[1].value,
      'https://x.com',
    );
    assert.strictEqual(
      splitMessageLinks('https://en.wikipedia.org/wiki/Foo_(bar))')[0].value,
      'https://en.wikipedia.org/wiki/Foo_(bar)',
    );
  });

  test('www inside another word is not a link', function (assert) {
    assert.true(
      splitMessageLinks('foo.www.x.com and a@www.x.com').every(
        (part) => !part.isLink,
      ),
    );
  });

  test('a link right after an underscore is still found', function (assert) {
    const parts = splitMessageLinks('_https://x.co_');
    assert.deepEqual(
      parts.map((part) => part.value),
      ['_', 'https://x.co', '_'],
    );
    assert.true(parts[1].isLink);
  });
});
