import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { click, render, triggerKeyEvent } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

const ROOT = '[data-test-wu-split-button]';
const PRIMARY = '[data-test-wu-split-button-primary]';
const TRIGGER = '[data-test-wu-split-button-trigger]';
const MENU = '[data-test-wu-dropdown-menu]';

function menu() {
  return document.querySelector(MENU);
}

module('Integration | Component | woven/split-button', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.clicks = 0;
    this.picked = null;
    this.onClick = () => {
      this.clicks += 1;
    };
    this.pick = (value, close) => {
      this.picked = value;
      close();
    };
  });

  test('renders an attached group with a primary button and a caret-only trigger', async function (assert) {
    await render(hbs`
      <Woven::SplitButton @label="Import" @onClick={{this.onClick}}>
        <:menu as |close|>
          <div role="group" aria-label="More actions">
            <button type="button" class="wu-dropdown-item" role="menuitem" tabindex="-1" data-test-item {{on "click" (fn this.pick "csv" close)}}>Export CSV</button>
          </div>
        </:menu>
      </Woven::SplitButton>
    `);

    assert.dom(ROOT).hasClass('wu-btn-group');
    assert.dom(PRIMARY).hasText('Import');
    assert.dom(PRIMARY).hasClass('subtle', 'default variant is subtle');
    assert
      .dom(`${ROOT} > .wu-btn`)
      .exists({ count: 2 }, 'both buttons are direct children of the group');
    assert.dom(TRIGGER).hasClass('caret');
    assert.dom(TRIGGER).hasClass('subtle', 'caret matches the primary variant');
    assert
      .dom(TRIGGER)
      .hasText(
        '',
        'caret-only button is empty so the kit draws the narrow caret',
      );
    assert.dom(TRIGGER).hasAttribute('aria-label', 'More actions');
    assert.dom(TRIGGER).hasAttribute('aria-haspopup', 'menu');
    assert.dom(TRIGGER).hasAttribute('aria-expanded', 'false');
    assert.notOk(menu(), 'menu is closed');
  });

  test('the primary click runs the action and never opens the menu', async function (assert) {
    await render(hbs`
      <Woven::SplitButton @label="Import" @onClick={{this.onClick}}>
        <:menu>
          <div role="group" aria-label="More actions">
            <button type="button" class="wu-dropdown-item" role="menuitem" tabindex="-1">Item</button>
          </div>
        </:menu>
      </Woven::SplitButton>
    `);

    await click(PRIMARY);
    assert.strictEqual(this.clicks, 1);
    assert.notOk(menu(), 'menu stays closed');

    await triggerKeyEvent(PRIMARY, 'keydown', 'Enter');
    assert.notOk(menu(), 'Enter on the primary does not open the menu');
  });

  test('the caret opens the menu, yields close, and reflects the open state', async function (assert) {
    await render(hbs`
      <Woven::SplitButton @label="Import" @variant="brand" @menuLabel="Import and export" @onClick={{this.onClick}}>
        <:menu as |close|>
          <div role="group" aria-label="Import and export">
            <button type="button" class="wu-dropdown-item" role="menuitem" tabindex="-1" data-test-item {{on "click" (fn this.pick "xlsx" close)}}>Export XLSX</button>
          </div>
        </:menu>
      </Woven::SplitButton>
    `);

    assert.dom(TRIGGER).hasAttribute('aria-label', 'Import and export');
    assert.dom(TRIGGER).hasClass('brand');

    await click(TRIGGER);
    const open = menu();
    assert.ok(open, 'menu mounts on the caret click');
    assert.dom(TRIGGER).hasAttribute('aria-expanded', 'true');
    assert.ok(open.closest('.wu-layer'), 'menu is hosted on .wu-layer');
    assert.dom('[data-test-item]', open).hasText('Export XLSX');

    await click(open.querySelector('[data-test-item]'));
    assert.strictEqual(this.picked, 'xlsx');
    assert.notOk(menu(), 'close from the menu block closes the menu');
    assert.strictEqual(this.clicks, 0, 'the primary action did not run');
  });

  test('keyboard opens the menu from the caret like the dropdown trigger', async function (assert) {
    await render(hbs`
      <Woven::SplitButton @label="Import" @onClick={{this.onClick}}>
        <:menu>
          <div role="group" aria-label="More actions">
            <button type="button" class="wu-dropdown-item" role="menuitem" tabindex="-1">Item</button>
          </div>
        </:menu>
      </Woven::SplitButton>
    `);

    await triggerKeyEvent(TRIGGER, 'keydown', 'ArrowDown');
    assert.ok(menu(), 'ArrowDown on the caret opens the menu');
  });

  test('disabled blocks both buttons', async function (assert) {
    await render(hbs`
      <Woven::SplitButton @label="Import" @disabled={{true}} @onClick={{this.onClick}}>
        <:menu>
          <div role="group" aria-label="More actions">
            <button type="button" class="wu-dropdown-item" role="menuitem" tabindex="-1">Item</button>
          </div>
        </:menu>
      </Woven::SplitButton>
    `);

    assert.dom(PRIMARY).isDisabled();
    assert.dom(TRIGGER).isDisabled();
    assert.dom(ROOT).exists();
    assert.notOk(menu(), 'a disabled caret opens nothing');
  });

  test('primaryDisabled blocks the primary alone and leaves the menu usable', async function (assert) {
    await render(hbs`
      <Woven::SplitButton @label="Import" @primaryDisabled={{true}} @onClick={{this.onClick}}>
        <:menu>
          <div role="group" aria-label="More actions">
            <button type="button" class="wu-dropdown-item" role="menuitem" tabindex="-1" data-test-item>Item</button>
          </div>
        </:menu>
      </Woven::SplitButton>
    `);

    assert.dom(PRIMARY).isDisabled();
    assert.dom(TRIGGER).isEnabled();
    await click(TRIGGER);
    assert.ok(menu(), 'the caret still opens the menu');
  });

  test('size, icon and attributes pass through', async function (assert) {
    await render(hbs`
      <Woven::SplitButton @label="Import" @size="sm" @icon="upload-simple" @onClick={{this.onClick}} class="extra" data-test-mine>
        <:menu>
          <div role="group" aria-label="More actions">
            <button type="button" class="wu-dropdown-item" role="menuitem" tabindex="-1">Item</button>
          </div>
        </:menu>
      </Woven::SplitButton>
    `);

    assert.dom(ROOT).hasClass('extra');
    assert.dom('[data-test-mine]').exists();
    assert.dom(PRIMARY).hasClass('sm');
    assert.dom(TRIGGER).hasClass('sm');
    assert.dom(`${PRIMARY} [data-test-wu-button-icon]`).exists();
  });
});
