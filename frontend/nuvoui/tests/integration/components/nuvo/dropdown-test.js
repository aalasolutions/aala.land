import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import {
  blur,
  render,
  click,
  fillIn,
  focus,
  settled,
  triggerKeyEvent,
  waitUntil,
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

  test('searchOnOpen loads results on open and pins the current pick on top', async function (assert) {
    this.terms = [];
    this.onSearch = async (term) => {
      this.terms.push(term);
      return [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
      ];
    };
    await render(hbs`
      <Nuvo::Dropdown
        @filterable={{true}}
        @remote={{true}}
        @searchOnOpen={{true}}
        @searchDebounce={{0}}
        @value="x"
        @selectedLabel="Picked"
        @placeholder="Search"
        @onSearch={{this.onSearch}}
        @onSelect={{this.onSelect}}
      />
    `);

    await focus('[data-test-nu-dropdown-filter]');

    assert.deepEqual(this.terms, [''], 'an empty search runs on open');
    const input = document.querySelector('[data-test-nu-dropdown-filter]');
    assert.strictEqual(input.value, '', 'the input is ready for typing');
    assert.strictEqual(
      input.placeholder,
      'Picked',
      'the current pick shows faded',
    );

    const items = menu().querySelectorAll('[data-test-nu-dropdown-item]');
    assert.deepEqual(
      [...items].map((i) => i.textContent.trim()),
      ['Picked', 'Alpha', 'Beta'],
    );
    assert.dom(items[0]).hasAttribute('aria-selected', 'true');

    await click(items[0]);
    assert.strictEqual(
      this.selected,
      null,
      'the current pick is not re-selected',
    );
    assert.notOk(menu(), 'picking the current value closes the menu');
    assert.notStrictEqual(
      document.activeElement,
      input,
      'the input lets go of focus after a pick',
    );
  });

  test('searchOnOpen ticks the current pick in place when the results hold it', async function (assert) {
    this.onSearch = async () => [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ];
    await render(hbs`
      <Nuvo::Dropdown
        @filterable={{true}}
        @remote={{true}}
        @searchOnOpen={{true}}
        @value="b"
        @selectedLabel="Beta"
        @onSearch={{this.onSearch}}
      />
    `);

    await focus('[data-test-nu-dropdown-filter]');

    const items = menu().querySelectorAll('[data-test-nu-dropdown-item]');
    assert.strictEqual(items.length, 2, 'no duplicate row');
    assert.dom(items[1]).hasAttribute('aria-selected', 'true');
  });

  test('a remote dropdown without searchOnOpen waits for typing', async function (assert) {
    let searched = false;
    this.onSearch = async () => {
      searched = true;
      return [];
    };
    await render(hbs`
      <Nuvo::Dropdown
        @filterable={{true}}
        @remote={{true}}
        @value="x"
        @selectedLabel="Picked"
        @promptText="Type to search"
        @onSearch={{this.onSearch}}
      />
    `);

    await focus('[data-test-nu-dropdown-filter]');

    assert.false(searched);
    assert.dom(menu()).hasText('Type to search');
  });

  test('searchOnOpen fetches the first page once while typed terms always search', async function (assert) {
    this.terms = [];
    this.onSearch = async (term) => {
      this.terms.push(term);
      return [{ value: 'a', label: 'Alpha' }];
    };
    await render(hbs`
      <Nuvo::Dropdown
        @filterable={{true}}
        @remote={{true}}
        @searchOnOpen={{true}}
        @searchDebounce={{0}}
        @onSearch={{this.onSearch}}
      />
    `);

    await focus('[data-test-nu-dropdown-filter]');
    await triggerKeyEvent(menu(), 'keydown', 'Escape');
    await blur('[data-test-nu-dropdown-filter]');
    await focus('[data-test-nu-dropdown-filter]');
    assert.dom(menu()).hasText('Alpha', 'the cached page is shown again');
    await fillIn('[data-test-nu-dropdown-filter]', 'al');
    await fillIn('[data-test-nu-dropdown-filter]', 'alp');

    assert.deepEqual(this.terms, ['', 'al', 'alp']);
  });

  test('closing during a remote search does not leave the menu searching', async function (assert) {
    let release;
    this.onSearch = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    await render(hbs`
      <Nuvo::Dropdown
        @filterable={{true}}
        @remote={{true}}
        @minChars={{2}}
        @searchDebounce={{0}}
        @promptText="Type to search"
        @onSearch={{this.onSearch}}
      />
    `);

    await fillIn('[data-test-nu-dropdown-filter]', 'ab');
    await waitUntil(() => release);
    assert.dom(menu()).hasText('Searching...');

    await triggerKeyEvent(menu(), 'keydown', 'Escape');
    release([]);
    await settled();

    await blur('[data-test-nu-dropdown-filter]');
    await focus('[data-test-nu-dropdown-filter]');
    assert.dom(menu()).hasText('Type to search');
  });
});
