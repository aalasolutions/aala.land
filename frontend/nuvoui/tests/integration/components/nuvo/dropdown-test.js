import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import {
  render,
  click,
  settled,
  triggerKeyEvent,
} from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
];

function menu() {
  return document.querySelector('.nu-menu.is-open');
}

module('Integration | Component | nuvo/dropdown', function (hooks) {
  setupRenderingTest(hooks);

  // The test container is scaled down by default, which would distort every
  // rectangle this suite measures.
  hooks.beforeEach(function () {
    this.container = document.getElementById('ember-testing');
    this.containerTransform = this.container.style.transform;
    this.containerWidth = this.container.style.width;
    this.container.style.transform = 'none';
    this.container.style.width = '100%';
    this.options = OPTIONS;
    this.selected = null;
    this.onSelect = (value) => {
      this.selected = value;
    };
  });

  hooks.afterEach(async function () {
    this.container.style.transform = this.containerTransform;
    this.container.style.width = this.containerWidth;
    document.documentElement.removeAttribute('dir');
    await settled();
  });

  test('the open menu is hosted outside a clipping ancestor and sits under the trigger', async function (assert) {
    await render(hbs`
      <div style="overflow: hidden; width: 240px; height: 48px;" data-test-clip>
        <Nuvo::Dropdown
          @options={{this.options}}
          @placeholder="Pick"
          @onSelect={{this.onSelect}}
        />
      </div>
    `);

    assert.notOk(menu(), 'menu is not mounted while closed');

    await click('[data-test-nu-dropdown-trigger]');
    const open = menu();
    assert.ok(open, 'menu mounts on open');
    assert.notOk(
      open.closest('[data-test-clip]'),
      'menu is not a descendant of the clipping box',
    );
    assert.ok(open.closest('.nu-layer'), 'menu is hosted on .nu-layer');
    assert.strictEqual(getComputedStyle(open).position, 'fixed');
    assert.strictEqual(open.dataset.placement, 'bottom');

    const trigger = document
      .querySelector('[data-test-nu-dropdown-trigger]')
      .getBoundingClientRect();
    const box = open.getBoundingClientRect();
    assert.ok(box.top >= trigger.bottom, 'menu opens below the trigger');
    assert.ok(
      Math.abs(box.left - trigger.left) < 1,
      'inline-start edges meet in LTR',
    );
    assert.ok(
      box.right <= window.innerWidth && box.bottom <= window.innerHeight,
      'menu stays inside the viewport',
    );
  });

  test('RTL aligns the menu to the trigger end edge and mirrors the direction', async function (assert) {
    document.documentElement.setAttribute('dir', 'rtl');
    await render(hbs`
      <Nuvo::Dropdown
        @options={{this.options}}
        @placeholder="Pick"
        @onSelect={{this.onSelect}}
      />
    `);

    await click('[data-test-nu-dropdown-trigger]');
    const open = menu();
    const trigger = document
      .querySelector('[data-test-nu-dropdown-trigger]')
      .getBoundingClientRect();
    const box = open.getBoundingClientRect();
    assert.ok(
      Math.abs(box.right - trigger.right) < 1,
      'inline-start edges meet in RTL',
    );
    assert.strictEqual(open.getAttribute('dir'), 'rtl');
  });

  test('selecting an item reports the value, closes and returns focus to the trigger', async function (assert) {
    await render(hbs`
      <Nuvo::Dropdown
        @options={{this.options}}
        @placeholder="Pick"
        @onSelect={{this.onSelect}}
      />
    `);

    await click('[data-test-nu-dropdown-trigger]');
    const items = menu().querySelectorAll('[data-test-nu-dropdown-item]');
    assert.strictEqual(items.length, 3);
    items[1].focus();
    await click(items[1]);

    assert.strictEqual(this.selected, 'b');
    assert.notOk(menu(), 'menu unmounts after select');
    assert.strictEqual(
      document.activeElement,
      document.querySelector('[data-test-nu-dropdown-trigger]'),
      'focus returns to the trigger',
    );
  });

  test('Escape closes the menu without reaching document listeners', async function (assert) {
    let reachedDocument = false;
    const spy = (event) => {
      if (event.key === 'Escape') reachedDocument = true;
    };
    document.addEventListener('keydown', spy);

    await render(hbs`
      <Nuvo::Dropdown @options={{this.options}} @placeholder="Pick" />
    `);
    await click('[data-test-nu-dropdown-trigger]');
    assert.ok(menu());

    await triggerKeyEvent(menu(), 'keydown', 'Escape');
    assert.notOk(menu(), 'Escape closes the menu');
    assert.false(reachedDocument, 'Escape is stopped at the menu');

    document.removeEventListener('keydown', spy);
  });
});
