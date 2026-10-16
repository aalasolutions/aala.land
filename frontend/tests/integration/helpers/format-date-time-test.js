import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

// A past year, so the year always shows whatever today is.
const VALUE = '2025-09-16T06:00:09Z';

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// Independent oracle: day, month and year parts plus the time, in timeZone (browser when undefined).
function parts(value, timeZone, withSeconds = false) {
  const date = new Date(value);
  const get = (options) =>
    Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { ...options, timeZone })
        .formatToParts(date)
        .map((p) => [p.type, p.value]),
    );
  const { day, month, year } = get({
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const time = date
    .toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      ...(withSeconds ? { second: '2-digit' } : {}),
      timeZone,
    })
    .replace(/\s/g, ' ');
  return {
    day: `${day} ${month} ${year}`,
    iso: `${year}-${month}-${day}`,
    time,
  };
}

function full(value, timeZone, withSeconds) {
  const p = parts(value, timeZone, withSeconds);
  return `${p.day}, ${p.time}`;
}

// Pick a zone far from the machine zone so the two renderings always differ.
function otherTimeZone() {
  const local = full(VALUE);
  return ['Pacific/Kiritimati', 'Pacific/Pago_Pago'].find(
    (tz) => full(VALUE, tz) !== local,
  );
}

function regionPart(value, timeZone) {
  const local = parts(value);
  const regional = parts(value, timeZone);
  return regional.iso === local.iso
    ? regional.time
    : `${regional.day}, ${regional.time}`;
}

module('Integration | Helper | format-date-time', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.local = full(VALUE);
    this.otherZone = otherTimeZone();
    this.owner.lookup('service:region').regions = [
      { code: 'same', name: 'Home', timezone: browserTimeZone() },
      { code: 'far', name: 'Faraway', timezone: this.otherZone },
      { code: 'utc', name: 'Greenwich', timezone: 'UTC' },
    ];
    this.set('value', VALUE);
  });

  test('without a region it renders browser-local time only, day first', async function (assert) {
    await render(
      hbs`<span data-test-out>{{format-date-time this.value}}</span>`,
    );
    assert.dom('[data-test-out]').hasText(this.local);
    assert
      .dom('[data-test-out]')
      .hasText(/^\d{1,2} Sep 2025, \d{1,2}:\d{2} [AP]M$/);
  });

  test('a current-year instant drops the year', async function (assert) {
    this.set('value', new Date().toISOString());
    await render(
      hbs`<span data-test-out>{{format-date-time this.value}}</span>`,
    );
    assert
      .dom('[data-test-out]')
      .hasText(/^\d{1,2} [A-Z][a-z]{2}, \d{1,2}:\d{2} [AP]M$/);
  });

  test('a region in another timezone appends the region time without a colon', async function (assert) {
    await render(
      hbs`<span data-test-out>{{format-date-time this.value region="far"}}</span>`,
    );
    assert
      .dom('[data-test-out]')
      .hasText(`${this.local} (Faraway ${regionPart(VALUE, this.otherZone)})`);
  });

  test('a UTC region renders plain spaces and appends only when the time differs', async function (assert) {
    await render(
      hbs`<span data-test-out>{{format-date-time this.value region="utc"}}</span>`,
    );
    const expected =
      full(VALUE, 'UTC') === this.local
        ? this.local
        : `${this.local} (Greenwich ${regionPart(VALUE, 'UTC')})`;
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
    assert.dom('[data-test-out]').hasText(full(VALUE, undefined, true));
  });
});
