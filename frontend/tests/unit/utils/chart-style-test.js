import { module, test } from 'qunit';
import {
  compactFormatter,
  humanize,
  moneyFormatter,
  token,
  withAlpha,
} from 'land/utils/chart-style';

// Every chart reads its colours and number formats through here.
module('Unit | Utility | chart-style', function (hooks) {
  const PROBE = '--chart-style-test-probe';

  hooks.afterEach(function () {
    document.documentElement.style.removeProperty(PROBE);
  });

  // Captures console output the way the service tests do, and always restores it.
  function withConsole(method, body) {
    const original = console[method];
    const calls = [];
    console[method] = (...args) => calls.push(args);
    try {
      return body(calls);
    } finally {
      console[method] = original;
    }
  }

  test('token reads the custom property off the document root', function (assert) {
    document.documentElement.style.setProperty(PROBE, '  #123456  ');
    assert.strictEqual(token(PROBE), '#123456', 'trimmed');
  });

  test('token never hands Chart.js an empty colour', function (assert) {
    assert.strictEqual(token('--not-a-defined-token'), '#000000');
    for (const name of [
      '--primary',
      '--success',
      '--danger',
      '--text-muted',
      '--border-base',
    ]) {
      assert.true(
        token(name).length > 0,
        `${name} resolves to a colour or its fallback`,
      );
    }
  });

  test('withAlpha converts six-digit hex', function (assert) {
    assert.strictEqual(withAlpha('#1ab5a5', 0.14), 'rgba(26, 181, 165, 0.14)');
    assert.strictEqual(withAlpha('#FFFFFF', 0.5), 'rgba(255, 255, 255, 0.5)');
    assert.strictEqual(withAlpha('#000000', 1), 'rgba(0, 0, 0, 1)');
  });

  test('withAlpha expands three-digit hex', function (assert) {
    assert.strictEqual(withAlpha('#abc', 0.2), 'rgba(170, 187, 204, 0.2)');
    assert.strictEqual(withAlpha('#FFF', 0.2), 'rgba(255, 255, 255, 0.2)');
  });

  test('withAlpha accepts comma, space and slash separated rgb', function (assert) {
    const expected = 'rgba(26, 181, 165, 0.3)';
    assert.strictEqual(withAlpha('rgb(26, 181, 165)', 0.3), expected);
    assert.strictEqual(withAlpha('rgb(26 181 165)', 0.3), expected);
    assert.strictEqual(
      withAlpha('rgb(26 181 165 / 0.8)', 0.3),
      expected,
      'the requested alpha replaces the one already on the colour',
    );
    assert.strictEqual(withAlpha('rgba(26, 181, 165, 0.9)', 0.3), expected);
  });

  test('withAlpha returns an unsupported colour untouched and says so', function (assert) {
    withConsole('warn', (calls) => {
      assert.strictEqual(
        withAlpha('hsl(180 50% 40%)', 0.5),
        'hsl(180 50% 40%)',
      );
      assert.strictEqual(withAlpha('#12345', 0.5), '#12345');
      assert.strictEqual(withAlpha('teal', 0.5), 'teal');
      assert.strictEqual(calls.length, 3, 'each one is reported');
    });
  });

  test('moneyFormatter formats in the given currency', function (assert) {
    assert.strictEqual(moneyFormatter('en-US', 'USD')(1234.56), '$1,235');
    assert.strictEqual(
      moneyFormatter('en-US', 'USD', 2)(1234.5),
      '$1,234.50',
      'fraction digits are opt-in',
    );
  });

  test('moneyFormatter falls back instead of throwing on a bad currency', function (assert) {
    withConsole('error', (calls) => {
      const format = moneyFormatter('en-US', 'NOT_A_CURRENCY');
      assert.strictEqual(format(1234.56), 'NOT_A_CURRENCY 1,234.56');
      assert.strictEqual(calls.length, 1, 'the rejection is reported once');
    });
  });

  test('moneyFormatter drops the code entirely when there is no currency', function (assert) {
    withConsole('error', () => {
      // The live case: a stat card rendered before any region is active.
      const format = moneyFormatter('en-US', null);
      assert.strictEqual(format(1234.5), '1,234.5');
      assert.strictEqual(format('not a number'), '0');
    });
  });

  test('compactFormatter shortens large numbers', function (assert) {
    assert.strictEqual(compactFormatter('en-US')(1500), '1.5K');
    assert.strictEqual(compactFormatter('en-US')(0), '0');
  });

  test('compactFormatter falls back instead of throwing on a bad locale', function (assert) {
    withConsole('error', (calls) => {
      const format = compactFormatter('not a locale');
      assert.strictEqual(format(1500), '1500');
      assert.strictEqual(format('not a number'), '0');
      assert.strictEqual(calls.length, 1, 'the rejection is reported once');
    });
  });

  test('humanize title-cases an enum', function (assert) {
    assert.strictEqual(humanize('BANK_TRANSFER'), 'Bank Transfer');
    assert.strictEqual(humanize('OTHER'), 'Other');
    assert.strictEqual(humanize('rent'), 'Rent');
    assert.strictEqual(humanize('__maintenance__'), 'Maintenance');
  });

  test('humanize survives an empty value', function (assert) {
    assert.strictEqual(humanize(''), '');
    assert.strictEqual(humanize(null), '');
    assert.strictEqual(humanize(undefined), '');
    assert.strictEqual(humanize('_'), '');
  });
});
