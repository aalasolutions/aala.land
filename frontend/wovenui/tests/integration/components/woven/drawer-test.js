import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, settled, click, triggerKeyEvent } from '@ember/test-helpers';
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
    assert
      .dom('[data-test-wu-drawer]')
      .hasClass('is-open', 'and marks itself open');
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

    await triggerKeyEvent(document, 'keydown', 'Escape');

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

    assert
      .dom('[data-test-wu-drawer-backdrop-dismiss]')
      .exists('the dismiss button is there');
    await click('[data-test-wu-drawer-backdrop-dismiss]');
    assert.false(state.open, 'the backdrop click closed it');

    this.set('allowBackdrop', false);
    state.open = true;
    await settled();
    assert
      .dom('[data-test-wu-drawer-backdrop-dismiss]')
      .doesNotExist('no dismiss button when the caller opts out');
  });
});
