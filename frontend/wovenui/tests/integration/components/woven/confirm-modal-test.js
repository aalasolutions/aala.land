import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, click, triggerEvent } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { resetDialogStateForTesting } from '@wovenui/ember/utils/dialog-focus';

// The modal is centered, so a click at the viewport origin lands on its backdrop.
const OUTSIDE = { clientX: 0, clientY: 0 };

module('Integration | Component | woven/confirm-modal', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.closed = 0;
    this.onClose = () => {
      this.closed += 1;
    };
    this.confirming = false;
    this.allowEsc = true;
    this.allowBackdrop = true;
  });

  hooks.afterEach(function () {
    resetDialogStateForTesting();
  });

  async function renderModal() {
    await render(hbs`
      <Woven::ConfirmModal
        @open={{true}}
        @title="Delete lease"
        @message="This cannot be undone."
        @isConfirming={{this.confirming}}
        @closeOnEsc={{this.allowEsc}}
        @closeOnBackdrop={{this.allowBackdrop}}
        @onClose={{this.onClose}}
      />
    `);
  }

  test('Escape requests close while idle, and not while confirming', async function (assert) {
    await renderModal();
    await triggerEvent('[data-test-wu-confirm-modal]', 'cancel');
    assert.strictEqual(this.closed, 1, 'Escape asked the caller to close');

    this.set('confirming', true);
    await triggerEvent('[data-test-wu-confirm-modal]', 'cancel');
    assert.strictEqual(this.closed, 1, 'no close request mid-confirm');
    assert.true(
      document.querySelector('[data-test-wu-confirm-modal]').open,
      'the dialog stays open',
    );
  });

  test('closeOnEsc false ignores Escape', async function (assert) {
    this.allowEsc = false;
    await renderModal();
    await triggerEvent('[data-test-wu-confirm-modal]', 'cancel');
    assert.strictEqual(this.closed, 0);
  });

  test('a backdrop click requests close while idle, and not while confirming or opted out', async function (assert) {
    await renderModal();
    await click('[data-test-wu-confirm-modal-message]', OUTSIDE);
    assert.strictEqual(this.closed, 0, 'a click inside does not close it');
    await click('[data-test-wu-confirm-modal]', OUTSIDE);
    assert.strictEqual(this.closed, 1, 'the backdrop click asked to close');

    this.set('confirming', true);
    await click('[data-test-wu-confirm-modal]', OUTSIDE);
    assert.strictEqual(this.closed, 1, 'ignored mid-confirm');

    this.set('confirming', false);
    this.set('allowBackdrop', false);
    await click('[data-test-wu-confirm-modal]', OUTSIDE);
    assert.strictEqual(this.closed, 1, 'ignored when the caller opts out');
  });
});
