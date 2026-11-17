import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { click, render, triggerKeyEvent } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

function menu() {
  return document.querySelector('[data-test-wu-dropdown-menu]');
}

// The open menu is hosted on a layer outside the rendering root.
function item(key) {
  return menu()?.querySelector(`[data-test-${key}]`);
}

module('Integration | Component | row-actions', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.calls = [];
    this.make = (key, extra = {}) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      icon: 'pencil-simple',
      onSelect: () => this.calls.push(key),
      ...extra,
    });
  });

  test('every row renders one menu, even for a single action', async function (assert) {
    this.actions = [this.make('edit')];
    await render(hbs`<RowActions @actions={{this.actions}} @label="Acme" />`);

    assert.dom('[data-test-row-actions="menu"]').exists();
    assert
      .dom('[data-test-row-actions-trigger]')
      .hasAttribute('aria-label', 'Actions for Acme')
      .hasAttribute('aria-expanded', 'false');
    assert.dom('[data-test-edit]').doesNotExist('items render only while open');

    await click('[data-test-row-actions-trigger]');
    assert.dom(item('edit')).hasText('Edit');
    await click(item('edit'));
    assert.deepEqual(this.calls, ['edit']);
  });

  test('hidden actions are skipped, destructive sits last, focus returns to the trigger', async function (assert) {
    this.actions = [
      this.make('delete', { variant: 'danger' }),
      this.make('archive', { hidden: true }),
      this.make('edit'),
      this.make('renew'),
    ];
    await render(hbs`<RowActions @actions={{this.actions}} @label="Acme" />`);

    await click('[data-test-row-actions-trigger]');
    const keys = [...menu().querySelectorAll('[data-test-row-action]')].map(
      (el) => el.getAttribute('data-test-row-action'),
    );
    assert.deepEqual(keys, ['edit', 'renew', 'delete'], 'destructive last');
    assert.notOk(item('archive'), 'hidden action is not rendered');
    assert.dom(item('delete')).hasClass('danger');

    await click(item('renew'));
    assert.deepEqual(this.calls, ['renew']);
    assert.notOk(menu(), 'the menu closes after the item handler');
    assert
      .dom('[data-test-row-actions-trigger]')
      .isFocused('focus is back on the trigger before the action runs');
  });

  test('disabled and loading actions render disabled and keep their test value', async function (assert) {
    this.actions = [
      this.make('edit', { disabled: true, testValue: 'r1' }),
      this.make('renew', { loading: true }),
    ];
    await render(hbs`<RowActions @actions={{this.actions}} />`);
    assert
      .dom('[data-test-row-actions-trigger]')
      .hasAttribute('aria-label', 'Actions');

    await click('[data-test-row-actions-trigger]');
    assert.dom(item('edit')).isDisabled();
    assert.strictEqual(item('edit').getAttribute('data-test-edit'), 'r1');
    assert.dom(item('renew')).isDisabled();
  });

  test('keyboard: Enter opens, arrows move, Escape closes and returns focus', async function (assert) {
    this.actions = [this.make('edit'), this.make('renew'), this.make('delete')];
    await render(hbs`<RowActions @actions={{this.actions}} @label="Acme" />`);
    const trigger = '[data-test-row-actions-trigger]';

    await triggerKeyEvent(trigger, 'keydown', 'Enter');
    assert.ok(menu(), 'Enter opens the menu');
    assert.dom(trigger).hasAttribute('aria-expanded', 'true');

    await triggerKeyEvent(trigger, 'keydown', 'ArrowDown');
    assert.strictEqual(document.activeElement, item('edit'));
    await triggerKeyEvent(menu(), 'keydown', 'ArrowDown');
    assert.strictEqual(document.activeElement, item('renew'));
    await triggerKeyEvent(menu(), 'keydown', 'ArrowUp');
    assert.strictEqual(document.activeElement, item('edit'));

    await triggerKeyEvent(document.activeElement, 'keydown', 'Escape');
    assert.notOk(menu(), 'Escape closes the menu');
    assert.dom(trigger).isFocused('focus returns to the trigger');
  });

  test('nothing renders when every action is hidden', async function (assert) {
    this.actions = [this.make('edit', { hidden: true })];
    await render(hbs`<RowActions @actions={{this.actions}} />`);
    assert.dom('[data-test-row-actions]').doesNotExist();
  });
});
