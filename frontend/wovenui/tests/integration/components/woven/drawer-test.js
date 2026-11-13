import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import {
  render,
  settled,
  click,
  triggerEvent,
  waitUntil,
} from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { tracked } from '@glimmer/tracking';
import { resetDialogStateForTesting } from '@wovenui/ember/utils/dialog-focus';

class State {
  @tracked open = false;
  closedCount = 0;
}

module('Integration | Component | woven/drawer', function (hooks) {
  setupRenderingTest(hooks);

  hooks.afterEach(function () {
    resetDialogStateForTesting();
  });

  test('it mounts on open, marks itself open, and unmounts after the leave transition', async function (assert) {
    const state = new State();
    this.state = state;
    this.close = () => {
      state.open = false;
    };
    this.onClosed = () => {
      state.closedCount += 1;
    };

    await render(hbs`
      <Woven::Drawer
        @open={{this.state.open}}
        @title="Edit"
        @onClose={{this.close}}
        @onClosed={{this.onClosed}}
      >
        <:body><button type="button" id="inside">Inside</button></:body>
      </Woven::Drawer>
    `);

    assert
      .dom('[data-test-wu-drawer]')
      .doesNotExist('closed drawer renders nothing');

    state.open = true;
    await settled();

    assert.dom('[data-test-wu-drawer]').exists('it mounts');
    await settled();
    assert.true(
      document.querySelector('[data-test-wu-drawer]').matches(':modal'),
      'and opens as a modal dialog',
    );
    assert.strictEqual(
      document.body.style.overflow,
      'hidden',
      'page scroll is locked while open',
    );

    state.open = false;
    await settled();

    assert
      .dom('[data-test-wu-drawer]')
      .doesNotExist('it unmounts after the transition');
    assert.strictEqual(state.closedCount, 1, 'onClosed fired once');
    assert.notStrictEqual(
      document.body.style.overflow,
      'hidden',
      'page scroll is released',
    );
  });

  test('Escape closes only the dialog on top', async function (assert) {
    const state = new State();
    state.open = true;
    this.state = state;
    this.confirm = new State();
    this.drawerClosed = 0;
    this.modalClosed = 0;
    this.closeDrawer = () => {
      this.drawerClosed += 1;
    };
    this.closeModal = () => {
      this.modalClosed += 1;
    };

    await render(hbs`
      <Woven::Drawer @open={{this.state.open}} @title="Edit" @onClose={{this.closeDrawer}}>
        <:body>
          <button type="button" id="inside">Inside</button>
          <Woven::Modal
            @open={{this.confirm.open}}
            @title="Confirm"
            @onClose={{this.closeModal}}
          >
            <:body><button type="button" id="in-modal">Confirm</button></:body>
          </Woven::Modal>
        </:body>
      </Woven::Drawer>
    `);

    // Opened after the drawer, the way a confirm dialog appears in the product.
    this.confirm.open = true;
    await settled();

    assert.dom('[data-test-wu-drawer]').exists('the drawer is mounted');
    assert.dom('[data-test-wu-modal]').exists('the modal is mounted on top');

    // The browser sends Escape to the topmost modal dialog as its cancel event.
    await triggerEvent('[data-test-wu-modal]', 'cancel');

    assert.strictEqual(this.modalClosed, 1, 'the modal on top closed');
    assert.strictEqual(this.drawerClosed, 0, 'the drawer underneath did not');
  });

  test('a backdrop click closes it, and closeOnBackdrop false does not', async function (assert) {
    const state = new State();
    state.open = true;
    this.state = state;
    this.allowBackdrop = true;
    this.close = () => {
      state.open = false;
    };

    await render(hbs`
      <Woven::Drawer
        @open={{this.state.open}}
        @title="Edit"
        @closeOnBackdrop={{this.allowBackdrop}}
        @onClose={{this.close}}
      >
        <:body><button type="button" id="inside">Inside</button></:body>
      </Woven::Drawer>
    `);

    // A click at the viewport origin lands on the backdrop, left of the end-docked drawer.
    const outside = { clientX: 0, clientY: 0 };
    await click('[data-test-wu-drawer-body]', outside);
    assert.true(state.open, 'a click inside the drawer does not close it');
    await click('[data-test-wu-drawer]', outside);
    assert.false(state.open, 'the backdrop click closed it');

    this.set('allowBackdrop', false);
    state.open = true;
    await settled();
    await click('[data-test-wu-drawer]', outside);
    assert.true(state.open, 'ignored when the caller opts out');
  });

  test('a menu, a popover and a tooltip inside the drawer render into its own layer', async function (assert) {
    this.open = true;
    this.noop = () => {};
    this.options = [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ];
    this.picked = null;
    this.pick = (value) => {
      this.set('picked', value);
    };

    await render(hbs`
      <Woven::TooltipHost />
      <Woven::Drawer @open={{this.open}} @title="Edit" @onClose={{this.noop}}>
        <:body>
          <Woven::Dropdown @options={{this.options}} @value={{this.picked}} @onSelect={{this.pick}} />
          <Woven::Popover>
            <:trigger as |toggle|>
              <button type="button" data-test-pop-trigger {{on "click" toggle}}>Help</button>
            </:trigger>
            <:body>Popover text</:body>
          </Woven::Popover>
          <button type="button" data-tooltip="Hint" data-test-tip-trigger>?</button>
        </:body>
      </Woven::Drawer>
    `);

    const drawer = document.querySelector('[data-test-wu-drawer]');
    const layer = drawer.querySelector(':scope > .wu-layer');
    assert.ok(layer, 'the drawer renders its own layer as its last child');
    assert.strictEqual(drawer.lastElementChild, layer);

    await click('[data-test-wu-dropdown-trigger]');
    const menu = document.querySelector('[data-test-wu-dropdown-menu]');
    assert.strictEqual(menu.closest('.wu-layer'), layer, 'the menu is in the drawer layer');
    await click(menu.querySelectorAll('[data-test-wu-dropdown-item]')[1]);
    assert.strictEqual(this.picked, 'b', 'and its option is clickable');

    await click('[data-test-pop-trigger]');
    const panel = document.querySelector('[data-test-wu-popover-content]');
    assert.strictEqual(panel.parentElement, layer, 'the popover is in the drawer layer');
    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    panel.dispatchEvent(escape);
    await settled();
    assert.true(escape.defaultPrevented, 'Escape in the popover is cancelled, so the dialog gets no close request');
    assert.dom('[data-test-wu-popover-content]').doesNotExist('the popover closed');
    assert.true(drawer.open, 'the drawer stayed open');

    await triggerEvent('[data-test-tip-trigger]', 'mouseover');
    const tip = document.querySelector('[data-test-wu-tooltip]');
    assert.strictEqual(tip?.parentElement, layer, 'the tooltip is in the drawer layer');

    const tipEscape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.querySelector('[data-test-tip-trigger]').dispatchEvent(tipEscape);
    await settled();
    assert.true(tipEscape.defaultPrevented, 'Escape on a showing tooltip is cancelled');
    assert.dom('[data-test-wu-tooltip]').doesNotExist('the tooltip closed');
    assert.true(drawer.open, 'the drawer stayed open');
  });

  test('a native close the caller did not ask for reopens the dialog and requests close', async function (assert) {
    this.requests = 0;
    this.onClose = () => {
      this.requests += 1;
    };

    await render(hbs`
      <Woven::Drawer @open={{true}} @title="Edit" @onClose={{this.onClose}}>
        <:body><button type="button">Inside</button></:body>
      </Woven::Drawer>
    `);

    const drawer = document.querySelector('[data-test-wu-drawer]');
    // Stands in for a repeated Escape, which closes the dialog without a cancelable cancel event.
    drawer.close();
    await waitUntil(() => this.requests === 1);

    assert.strictEqual(this.requests, 1, 'the caller was asked to close');
    assert.true(drawer.open, 'the dialog reopened, since the caller owns the open state');
    assert.true(drawer.matches(':modal'), 'and is modal again');
  });
});
