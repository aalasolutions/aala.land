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
  return document.querySelector('[data-test-wu-dropdown-menu]');
}

module('Integration | Component | woven/dropdown', function (hooks) {
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
        <Woven::Dropdown
          @options={{this.options}}
          @placeholder="Pick"
          @onSelect={{this.onSelect}}
        />
      </div>
    `);

    assert.notOk(menu(), 'menu is not mounted while closed');

    await click('[data-test-wu-dropdown-trigger]');
    const open = menu();
    assert.ok(open, 'menu mounts on open');
    assert.notOk(
      open.closest('[data-test-clip]'),
      'menu is not a descendant of the clipping box',
    );
    assert.ok(open.closest('.wu-layer'), 'menu is hosted on .wu-layer');
    assert.strictEqual(getComputedStyle(open).position, 'fixed');
    assert.strictEqual(open.dataset.placement, 'bottom');

    const trigger = document
      .querySelector('[data-test-wu-dropdown-trigger]')
      .getBoundingClientRect();
    const box = open.getBoundingClientRect();
    assert.ok(box.top >= trigger.bottom, 'menu opens below the trigger');
    assert.ok(
      Math.abs(box.left - trigger.left) < 1,
      'inline-start edges meet in LTR',
    );
    assert.ok(
      box.right <= window.innerWidth,
      'menu stays inside the viewport width',
    );
    assert.ok(
      box.bottom <= window.innerHeight,
      'menu stays inside the viewport height',
    );
  });

  test('RTL aligns the menu to the trigger end edge and mirrors the direction', async function (assert) {
    document.documentElement.setAttribute('dir', 'rtl');
    await render(hbs`
      <Woven::Dropdown
        @options={{this.options}}
        @placeholder="Pick"
        @onSelect={{this.onSelect}}
      />
    `);

    await click('[data-test-wu-dropdown-trigger]');
    const open = menu();
    const trigger = document
      .querySelector('[data-test-wu-dropdown-trigger]')
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
      <Woven::Dropdown
        @options={{this.options}}
        @placeholder="Pick"
        @onSelect={{this.onSelect}}
      />
    `);

    await click('[data-test-wu-dropdown-trigger]');
    const items = menu().querySelectorAll('[data-test-wu-dropdown-item]');
    assert.strictEqual(items.length, 3);
    items[1].focus();
    await click(items[1]);

    assert.strictEqual(this.selected, 'b');
    assert.notOk(menu(), 'menu unmounts after select');
    assert.strictEqual(
      document.activeElement,
      document.querySelector('[data-test-wu-dropdown-trigger]'),
      'focus returns to the trigger',
    );
  });

  test('a menu block yields its own items, runs onOpen and closes after an item handler', async function (assert) {
    this.opened = 0;
    this.onOpen = () => (this.opened += 1);
    this.picked = [];
    this.pick = (value) => this.picked.push(value);
    this.mark = () => this.picked.push('mark');
    await render(hbs`
      <Woven::Dropdown @onOpen={{this.onOpen}}>
        <:trigger as |toggle|>
          <button type="button" data-test-trigger {{on "click" toggle}}>Menu</button>
        </:trigger>
        <:menu>
          <button type="button" data-test-mark {{on "click" this.mark}}>Mark</button>
          <button type="button" class="wu-dropdown-item" role="menuitem" data-test-first {{on "click" (fn this.pick "a")}}>A</button>
          <button type="button" class="wu-dropdown-item" role="menuitem" data-test-second {{on "click" (fn this.pick "b")}}>B</button>
        </:menu>
      </Woven::Dropdown>
    `);

    await click('[data-test-trigger]');
    assert.strictEqual(this.opened, 1, 'onOpen runs on open');
    assert.dom(menu()).hasAttribute('role', 'menu');

    await triggerKeyEvent('[data-test-trigger]', 'keydown', 'ArrowDown');
    assert.strictEqual(
      document.activeElement,
      menu().querySelector('[data-test-first]'),
      'arrows move focus to the items',
    );
    await triggerKeyEvent(menu(), 'keydown', 'ArrowUp');
    assert.strictEqual(
      document.activeElement,
      menu().querySelector('[data-test-second]'),
      'arrows wrap',
    );

    await click(menu().querySelector('[data-test-mark]'));
    assert.ok(menu(), 'a plain button inside the menu keeps it open');

    await click(menu().querySelector('[data-test-second]'));
    assert.deepEqual(this.picked, ['mark', 'b'], 'item handlers run');
    assert.notOk(menu(), 'a menu item click closes the menu');
  });

  test('Escape closes the menu without reaching document listeners', async function (assert) {
    let reachedDocument = false;
    const spy = (event) => {
      if (event.key === 'Escape') reachedDocument = true;
    };
    document.addEventListener('keydown', spy);

    await render(hbs`
      <Woven::Dropdown @options={{this.options}} @placeholder="Pick" />
    `);
    await click('[data-test-wu-dropdown-trigger]');
    assert.ok(menu());

    await triggerKeyEvent(menu(), 'keydown', 'Escape');
    assert.notOk(menu(), 'Escape closes the menu');
    assert.false(reachedDocument, 'Escape is stopped at the menu');

    document.removeEventListener('keydown', spy);
  });

  test('Escape with focus off the trigger closes only the menu and returns focus', async function (assert) {
    let reachedDocument = false;
    const spy = (event) => {
      if (event.key === 'Escape') reachedDocument = true;
    };
    document.addEventListener('keydown', spy);

    await render(hbs`
      <input type="radio" name="pick" data-test-radio />
      <Woven::Dropdown @options={{this.options}} @placeholder="Pick" />
    `);
    await click('[data-test-wu-dropdown-trigger]');
    await focus('[data-test-radio]');
    assert.ok(menu(), 'the menu stays open with focus elsewhere');

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.querySelector('[data-test-radio]').dispatchEvent(event);
    await settled();
    assert.notOk(menu(), 'Escape closes the menu');
    assert.true(event.defaultPrevented, 'no dialog cancel follows');
    assert.false(reachedDocument, 'Escape stops before any dialog listener');
    assert
      .dom('[data-test-wu-dropdown-trigger]')
      .isFocused('focus returns to the trigger');

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
      <Woven::Dropdown
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

    await focus('[data-test-wu-dropdown-filter]');

    assert.deepEqual(this.terms, [''], 'an empty search runs on open');
    const input = document.querySelector('[data-test-wu-dropdown-filter]');
    assert.strictEqual(input.value, '', 'the input is ready for typing');
    assert.strictEqual(
      input.placeholder,
      'Picked',
      'the current pick shows faded',
    );

    const items = menu().querySelectorAll('[data-test-wu-dropdown-item]');
    assert.deepEqual(
      [...items].map((i) => i.textContent.trim()),
      ['Picked', 'Alpha', 'Beta'],
    );
    assert.dom(items[0]).hasAttribute('aria-checked', 'true');

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
      <Woven::Dropdown
        @filterable={{true}}
        @remote={{true}}
        @searchOnOpen={{true}}
        @value="b"
        @selectedLabel="Beta"
        @onSearch={{this.onSearch}}
      />
    `);

    await focus('[data-test-wu-dropdown-filter]');

    const items = menu().querySelectorAll('[data-test-wu-dropdown-item]');
    assert.strictEqual(items.length, 2, 'no duplicate row');
    assert.dom(items[1]).hasAttribute('aria-checked', 'true');
  });

  test('a remote dropdown without searchOnOpen waits for typing', async function (assert) {
    let searched = false;
    this.onSearch = async () => {
      searched = true;
      return [];
    };
    await render(hbs`
      <Woven::Dropdown
        @filterable={{true}}
        @remote={{true}}
        @value="x"
        @selectedLabel="Picked"
        @promptText="Type to search"
        @onSearch={{this.onSearch}}
      />
    `);

    await focus('[data-test-wu-dropdown-filter]');

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
      <Woven::Dropdown
        @filterable={{true}}
        @remote={{true}}
        @searchOnOpen={{true}}
        @searchDebounce={{0}}
        @onSearch={{this.onSearch}}
      />
    `);

    await focus('[data-test-wu-dropdown-filter]');
    await triggerKeyEvent(menu(), 'keydown', 'Escape');
    await blur('[data-test-wu-dropdown-filter]');
    await focus('[data-test-wu-dropdown-filter]');
    assert.dom(menu()).hasText('Alpha', 'the cached page is shown again');
    await fillIn('[data-test-wu-dropdown-filter]', 'al');
    await fillIn('[data-test-wu-dropdown-filter]', 'alp');

    assert.deepEqual(this.terms, ['', 'al', 'alp']);
  });

  test('closing during a remote search does not leave the menu searching', async function (assert) {
    let release;
    this.onSearch = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    await render(hbs`
      <Woven::Dropdown
        @filterable={{true}}
        @remote={{true}}
        @minChars={{2}}
        @searchDebounce={{0}}
        @promptText="Type to search"
        @onSearch={{this.onSearch}}
      />
    `);

    await fillIn('[data-test-wu-dropdown-filter]', 'ab');
    await waitUntil(() => release);
    assert.dom(menu()).hasText('Searching...');

    await triggerKeyEvent(menu(), 'keydown', 'Escape');
    release([]);
    await settled();

    await blur('[data-test-wu-dropdown-filter]');
    await focus('[data-test-wu-dropdown-filter]');
    assert.dom(menu()).hasText('Type to search');
  });

  test('a long selected label truncates inside its container and keeps the full text in title', async function (assert) {
    const label = 'QA2 Vendor Plumbing (PLUMBING, STRUCTURAL, CLEANING)';
    this.longOptions = [{ value: 'v', label }, ...OPTIONS];
    await render(hbs`
      <div style="inline-size: 160px" data-test-box>
        <Woven::Dropdown @align="start" @options={{this.longOptions}} @value="v" />
      </div>
    `);

    const trigger = document.querySelector('[data-test-wu-dropdown-trigger]');
    const value = trigger.querySelector('[data-test-wu-dropdown-value]');
    const box = document
      .querySelector('[data-test-box]')
      .getBoundingClientRect();

    assert.dom(trigger).hasAttribute('title', label);
    assert.dom(value).hasClass('wu-dropdown-value').hasText(label);
    assert.strictEqual(getComputedStyle(value).textOverflow, 'ellipsis');
    assert.ok(value.scrollWidth > value.clientWidth, 'label is clipped');
    assert.ok(
      trigger.getBoundingClientRect().right <= box.right + 0.5,
      'trigger stays inside its container',
    );

    await click(trigger);
    assert
      .dom(menu().querySelector('[data-test-wu-dropdown-item]'))
      .hasAttribute('title', label);
  });

  test('the trigger has no title until something is selected', async function (assert) {
    await render(
      hbs`<Woven::Dropdown @options={{this.options}} @placeholder="Pick" />`,
    );
    assert.dom('[data-test-wu-dropdown-trigger]').doesNotHaveAttribute('title');
  });

  test('an empty-valued "All" option sets no trigger title', async function (assert) {
    this.allOptions = [{ value: '', label: 'All Statuses' }, ...OPTIONS];
    await render(
      hbs`<Woven::Dropdown @options={{this.allOptions}} @value="" />`,
    );
    assert.dom('[data-test-wu-dropdown-value]').hasText('All Statuses');
    assert.dom('[data-test-wu-dropdown-trigger]').doesNotHaveAttribute('title');
  });

  test('the trigger is a kit select button and keyboard highlight uses aria-selected', async function (assert) {
    await render(hbs`
      <Woven::Dropdown @options={{this.options}} @placeholder="Pick" @size="xs" @status="error" />
    `);

    const trigger = document.querySelector('[data-test-wu-dropdown-trigger]');
    assert.dom(trigger).hasClass('wu-select').hasClass('sm');
    assert.dom(trigger).hasAttribute('aria-invalid', 'true');
    assert
      .dom('[data-test-wu-dropdown-value]')
      .hasAttribute('data-placeholder');

    await click(trigger);
    assert.dom(menu()).hasClass('wu-autocomplete-list');
    assert.ok(
      menu().parentElement.matches('.wu-layer > .wu-autocomplete'),
      'the list is a child of .wu-autocomplete, where the kit animates it',
    );
    await triggerKeyEvent(trigger, 'keydown', 'ArrowDown');
    await triggerKeyEvent(trigger, 'keydown', 'ArrowDown');

    const options = menu().querySelectorAll('.wu-autocomplete-option');
    assert.dom(options[1]).hasAttribute('aria-selected', 'true');
    assert.dom(options[0]).hasAttribute('aria-selected', 'false');
    assert.dom(trigger).hasAttribute('aria-activedescendant', options[1].id);
  });

  test('aria-controls names the listbox only while it exists, and search mode has one combobox', async function (assert) {
    await render(
      hbs`<Woven::Dropdown @options={{this.options}} @placeholder="Pick" />`,
    );
    const trigger = document.querySelector('[data-test-wu-dropdown-trigger]');
    assert.dom(trigger).hasAttribute('role', 'combobox');
    assert
      .dom(trigger)
      .doesNotHaveAttribute('aria-controls', 'closed: no listbox to point at');
    await click(trigger);
    const listbox = menu().querySelector('[role="listbox"]');
    assert.dom(trigger).hasAttribute('aria-controls', listbox.id);
    await click(trigger);

    await render(
      hbs`<Woven::Dropdown @options={{this.options}} @searchThreshold={{1}} />`,
    );
    const searchTrigger = document.querySelector(
      '[data-test-wu-dropdown-trigger]',
    );
    await click(searchTrigger);
    assert.dom(searchTrigger).doesNotHaveAttribute('role');
    assert.dom(searchTrigger).doesNotHaveAttribute('aria-controls');
    assert.strictEqual(
      document.querySelectorAll('[role="combobox"]').length,
      1,
      'only the search input is a combobox',
    );
    assert
      .dom('[data-test-wu-dropdown-search]', document.body)
      .hasAttribute(
        'aria-controls',
        menu().querySelector('[role="listbox"]').id,
      );
  });

  test('a filterable input points aria-controls at the listbox only while it is open', async function (assert) {
    await render(
      hbs`<Woven::Dropdown @options={{this.options}} @filterable={{true}} />`,
    );
    assert
      .dom('[data-test-wu-dropdown-filter]')
      .doesNotHaveAttribute('aria-controls');
  });

  test('a custom trigger renders a kit action menu with menu items', async function (assert) {
    this.actions = [
      { value: 'edit', label: 'Edit' },
      { separator: true },
      { value: 'delete', label: 'Delete', danger: true },
    ];
    await render(hbs`
      <Woven::Dropdown @options={{this.actions}} @onSelect={{this.onSelect}}>
        <:trigger as |toggle|>
          <button type="button" data-test-actions {{on "click" toggle}}>More</button>
        </:trigger>
      </Woven::Dropdown>
    `);

    await click('[data-test-actions]');
    assert.dom(menu()).hasClass('wu-dropdown').hasAttribute('role', 'menu');
    assert.dom(menu()).hasAttribute('popover', 'manual');
    assert.true(
      menu().matches(':popover-open'),
      'shown so kit open styles apply',
    );
    assert.strictEqual(
      menu().querySelectorAll('hr.wu-dropdown-separator').length,
      1,
    );
    const items = menu().querySelectorAll('.wu-dropdown-item[role="menuitem"]');
    assert.strictEqual(items.length, 2);
    assert.dom(items[1]).hasClass('danger');

    await click(items[1]);
    assert.strictEqual(this.selected, 'delete');
  });

  test('with no options and no search the panel is the kit empty message', async function (assert) {
    this.none = [];
    await render(
      hbs`<Woven::Dropdown @options={{this.none}} @emptyText="Nothing here" />`,
    );

    await click('[data-test-wu-dropdown-trigger]');
    assert
      .dom(menu())
      .hasClass('wu-autocomplete-empty')
      .hasAttribute('role', 'status')
      .hasText('Nothing here');
    assert.ok(menu().parentElement.matches('.wu-autocomplete'));
  });
});
