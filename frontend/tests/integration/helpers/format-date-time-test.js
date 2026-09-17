import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

const VALUE = '2026-09-16T06:00:00Z';
const OPTIONS = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

// Native Intl may emit U+202F before AM/PM; the helper renders plain spaces.
function native(value, options) {
  return new Date(value).toLocaleString('en-US', options).replace(/\s/g, ' ');
}

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// Pick a zone far from the machine zone so the two renderings always differ.
function otherTimeZone() {
  const local = native(VALUE, OPTIONS);
  return ['Pacific/Kiritimati', 'Pacific/Pago_Pago'].find(
    (tz) => native(VALUE, { ...OPTIONS, timeZone: tz }) !== local,
  );
}

module('Integration | Helper | format-date-time', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.local = native(VALUE, OPTIONS);
    this.otherZone = otherTimeZone();
    this.owner.lookup('service:region').regions = [
      { code: 'same', name: 'Home', timezone: browserTimeZone() },
      { code: 'far', name: 'Faraway', timezone: this.otherZone },
      { code: 'utc', name: 'Greenwich', timezone: 'UTC' },
    ];
    this.set('value', VALUE);
  });

  test('without a region it renders browser-local time only', async function (assert) {
    await render(
      hbs`<span data-test-out>{{format-date-time this.value}}</span>`,
    );
    assert.dom('[data-test-out]').hasText(this.local);
  });

  test('a region in another timezone appends the region time', async function (assert) {
    await render(
      hbs`<span data-test-out>{{format-date-time this.value region="far"}}</span>`,
    );
    const regional = native(VALUE, { ...OPTIONS, timeZone: this.otherZone });
    assert
      .dom('[data-test-out]')
      .hasText(`${this.local} (Faraway: ${regional})`);
  });

  test('a UTC region renders plain spaces and appends only when the time differs', async function (assert) {
    await render(
      hbs`<span data-test-out>{{format-date-time this.value region="utc"}}</span>`,
    );
    const regional = native(VALUE, { ...OPTIONS, timeZone: 'UTC' });
    const expected =
      regional === this.local
        ? this.local
        : `${this.local} (Greenwich: ${regional})`;
    assert.dom('[data-test-out]').hasText(expected);
    assert.false(/\u202f/.test(this.element.textContent));
  });

  test('a region in the browser timezone renders local time only', async function (assert) {
    await render(
      hbs`<span data-test-out>{{format-date-time this.value region="same"}}</span>`,
    );
    assert.dom('[data-test-out]').hasText(this.local);
  });

  test('an unknown or empty region renders local time only', async function (assert) {
    await render(
      hbs`<span data-test-a>{{format-date-time this.value region="missing"}}</span><span data-test-b>{{format-date-time this.value region=null}}</span>`,
    );
    assert.dom('[data-test-a]').hasText(this.local);
    assert.dom('[data-test-b]').hasText(this.local);
  });

  test('withSeconds adds seconds', async function (assert) {
    await render(
      hbs`<span data-test-out>{{format-date-time this.value withSeconds=true}}</span>`,
    );
    const expected = native(VALUE, { ...OPTIONS, second: '2-digit' });
    assert.dom('[data-test-out]').hasText(expected);
  });
});
