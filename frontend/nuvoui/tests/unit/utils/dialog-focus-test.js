import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import {
  openDialog,
  focusFirstControl,
  isTopmostDialog,
  resetDialogStateForTesting,
} from '@nuvoui/ember/utils/dialog-focus';

function buildDialog(markup) {
  const host = document.createElement('div');
  host.dataset.dialogHost = 'true';
  host.innerHTML = markup;
  document.body.append(host);
  return host;
}

module('Unit | Utility | dialog-focus', function (hooks) {
  setupTest(hooks);

  hooks.afterEach(function () {
    resetDialogStateForTesting();
    document
      .querySelectorAll('[data-dialog-host], [data-dialog-fixture]')
      .forEach((el) => el.remove());
  });

  test('scroll is locked while a dialog is open and restored after', function (assert) {
    const dialog = buildDialog(
      '<div data-dialog-fixture tabindex="-1"><button>One</button></div>',
    ).firstElementChild;

    const release = openDialog(dialog);
    assert.strictEqual(document.body.style.overflow, 'hidden', 'locked');

    release();
    assert.notStrictEqual(document.body.style.overflow, 'hidden', 'unlocked');
  });

  test('a nested dialog holds the lock until both release', function (assert) {
    const outer = buildDialog(
      '<div data-dialog-fixture tabindex="-1"><button>Outer</button></div>',
    ).firstElementChild;
    const inner = buildDialog(
      '<div data-dialog-fixture tabindex="-1"><button>Inner</button></div>',
    ).firstElementChild;

    const releaseOuter = openDialog(outer);
    const releaseInner = openDialog(inner);

    assert.true(isTopmostDialog(inner), 'the newest dialog is topmost');
    assert.false(isTopmostDialog(outer), 'the one underneath is not');

    releaseInner();
    assert.strictEqual(document.body.style.overflow, 'hidden', 'still locked');
    assert.true(isTopmostDialog(outer), 'the outer dialog is topmost again');

    releaseOuter();
    assert.notStrictEqual(document.body.style.overflow, 'hidden', 'unlocked');
  });

  test('a dialog removed without releasing cannot hold the lock', function (assert) {
    const host = buildDialog(
      '<div data-dialog-fixture tabindex="-1"><button>Gone</button></div>',
    );
    const orphan = host.firstElementChild;
    const other = buildDialog(
      '<div data-dialog-fixture tabindex="-1"><button>Other</button></div>',
    ).firstElementChild;

    openDialog(orphan);
    const releaseOther = openDialog(other);
    host.remove();

    releaseOther();
    assert.notStrictEqual(
      document.body.style.overflow,
      'hidden',
      'the detached dialog is forgotten',
    );
  });

  test('Tab wraps from the last control back to the first', function (assert) {
    const dialog = buildDialog(
      '<div data-dialog-fixture tabindex="-1"><button id="a">A</button><button id="b">B</button></div>',
    ).firstElementChild;
    const release = openDialog(dialog);

    const last = dialog.querySelector('#b');
    last.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      }),
    );

    assert.strictEqual(
      document.activeElement.id,
      'a',
      'focus wrapped to the first',
    );
    release();
  });

  test('Shift+Tab wraps from the first control to the last', function (assert) {
    const dialog = buildDialog(
      '<div data-dialog-fixture tabindex="-1"><button id="a">A</button><button id="b">B</button></div>',
    ).firstElementChild;
    const release = openDialog(dialog);

    dialog.querySelector('#a').focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );

    assert.strictEqual(
      document.activeElement.id,
      'b',
      'focus wrapped to the last',
    );
    release();
  });

  test('a dialog with nothing focusable keeps focus on itself', function (assert) {
    const dialog = buildDialog(
      '<div data-dialog-fixture tabindex="-1"><p>Nothing to focus</p></div>',
    ).firstElementChild;
    const release = openDialog(dialog);

    focusFirstControl(dialog);
    assert.strictEqual(
      document.activeElement,
      dialog,
      'the dialog itself takes focus',
    );

    const outside = document.createElement('button');
    outside.dataset.dialogFixture = 'true';
    document.body.append(outside);
    outside.focus();

    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    assert.true(event.defaultPrevented, 'Tab was cancelled');
    assert.strictEqual(document.activeElement, dialog, 'and focus came back');
    release();
  });

  test('the close and tooltip buttons are never the first focus', function (assert) {
    const dialog = buildDialog(
      `<div data-dialog-fixture tabindex="-1">
         <button class="nu-drawer__close">Close</button>
         <button class="nu-field__info">?</button>
         <input id="real" />
       </div>`,
    ).firstElementChild;
    const release = openDialog(dialog);

    focusFirstControl(dialog);
    assert.strictEqual(
      document.activeElement.id,
      'real',
      'the real control is focused',
    );
    release();
  });

  test('only the dialog on top traps Tab', function (assert) {
    const under = buildDialog(
      '<div data-dialog-fixture tabindex="-1"><button id="u1">U1</button><button id="u2">U2</button></div>',
    ).firstElementChild;
    const releaseUnder = openDialog(under);
    const over = buildDialog(
      '<div data-dialog-fixture tabindex="-1"><button id="o1">O1</button><button id="o2">O2</button></div>',
    ).firstElementChild;
    const releaseOver = openDialog(over);

    under.querySelector('#u2').focus();
    let underGrabbedFocus = 0;
    under.addEventListener('focusin', () => {
      underGrabbedFocus += 1;
    });
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.strictEqual(
      document.activeElement.id,
      'o1',
      'the top dialog pulled focus in',
    );
    assert.strictEqual(
      underGrabbedFocus,
      0,
      'the dialog underneath never ran its own trap',
    );
    releaseOver();
    releaseUnder();
  });

  test('focus returns to the trigger, unless it is gone or focus moved on', function (assert) {
    const trigger = document.createElement('button');
    trigger.dataset.dialogFixture = 'true';
    trigger.textContent = 'Open';
    document.body.append(trigger);
    trigger.focus();

    const dialog = buildDialog(
      '<div data-dialog-fixture tabindex="-1"><button id="inside">Inside</button></div>',
    ).firstElementChild;
    const release = openDialog(dialog);
    dialog.querySelector('#inside').focus();
    release();
    assert.strictEqual(
      document.activeElement,
      trigger,
      'focus went back to the trigger',
    );

    trigger.focus();
    const second = buildDialog(
      '<div data-dialog-fixture tabindex="-1"><button id="two">Two</button></div>',
    ).firstElementChild;
    const releaseSecond = openDialog(second);
    const fallback = document.createElement('main');
    fallback.dataset.dialogFixture = 'true';
    fallback.tabIndex = -1;
    document.body.prepend(fallback);
    trigger.remove();
    releaseSecond();
    assert.strictEqual(
      document.activeElement,
      document.querySelector('main'),
      'a detached trigger falls back to main instead of dropping focus to the body',
    );

    const under = buildDialog(
      '<div data-dialog-fixture tabindex="-1"><button id="under">Under</button></div>',
    ).firstElementChild;
    const releaseUnder = openDialog(under);
    const over = buildDialog(
      '<div data-dialog-fixture tabindex="-1"><button id="over">Over</button></div>',
    ).firstElementChild;
    const releaseOver = openDialog(over);
    over.querySelector('#over').focus();
    releaseUnder();
    assert.strictEqual(
      document.activeElement.id,
      'over',
      'the dialog on top keeps focus when the one underneath releases',
    );
    releaseOver();
  });
});
