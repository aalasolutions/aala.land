import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render, settled } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

// DragEvent.dataTransfer cannot be constructed with files, so a plain event carries a stand-in.
function dragEvent(
  type,
  { files = [], types = ['Files'], relatedTarget } = {},
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { files, types, dropEffect: 'none' },
  });
  if (relatedTarget !== undefined) {
    Object.defineProperty(event, 'relatedTarget', { value: relatedTarget });
  }
  return event;
}

module('Integration | Modifier | file-drop', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.dropped = [];
    this.onFiles = (files) => this.dropped.push(files.map((f) => f.name));
    this.disabled = false;
  });

  const renderZone = () =>
    render(hbs`<div data-test-zone {{file-drop this.onFiles disabled=this.disabled}}>
      <span data-test-child>child</span>
    </div>`);

  test('dragging files over highlights, a child dragleave keeps it, a real exit clears it', async function (assert) {
    await renderZone();
    const zone = document.querySelector('[data-test-zone]');
    const child = document.querySelector('[data-test-child]');

    const over = dragEvent('dragover');
    zone.dispatchEvent(over);
    assert.true(over.defaultPrevented, 'drop allowed');
    assert.strictEqual(over.dataTransfer.dropEffect, 'copy');
    assert.dom(zone).hasClass('is-dropping');

    zone.dispatchEvent(dragEvent('dragleave', { relatedTarget: child }));
    assert.dom(zone).hasClass('is-dropping', 'moving onto a child');

    zone.dispatchEvent(dragEvent('dragleave', { relatedTarget: null }));
    assert.dom(zone).doesNotHaveClass('is-dropping');
  });

  test('dropping files hands them on and clears the highlight', async function (assert) {
    await renderZone();
    const zone = document.querySelector('[data-test-zone]');
    zone.dispatchEvent(dragEvent('dragover'));

    const drop = dragEvent('drop', {
      files: [new File(['a'], 'a.jpg', { type: 'image/jpeg' })],
    });
    zone.dispatchEvent(drop);

    assert.true(drop.defaultPrevented, 'the browser never opens the file');
    assert.deepEqual(this.dropped, [['a.jpg']]);
    assert.dom(zone).doesNotHaveClass('is-dropping');
  });

  test('a drag without files, such as selected text, is left alone', async function (assert) {
    await renderZone();
    const zone = document.querySelector('[data-test-zone]');
    const over = dragEvent('dragover', { types: ['text/plain'] });
    zone.dispatchEvent(over);

    assert.false(over.defaultPrevented);
    assert.dom(zone).doesNotHaveClass('is-dropping');
  });

  test('a disabled zone swallows the drop without handing files on', async function (assert) {
    this.disabled = true;
    await renderZone();
    const zone = document.querySelector('[data-test-zone]');

    const over = dragEvent('dragover');
    zone.dispatchEvent(over);
    assert.strictEqual(over.dataTransfer.dropEffect, 'none');
    assert.dom(zone).doesNotHaveClass('is-dropping');

    const drop = dragEvent('drop', {
      files: [new File(['a'], 'a.jpg', { type: 'image/jpeg' })],
    });
    zone.dispatchEvent(drop);
    assert.true(drop.defaultPrevented);
    assert.deepEqual(this.dropped, []);

    this.set('disabled', false);
    await settled();
    zone.dispatchEvent(dragEvent('drop', { files: drop.dataTransfer.files }));
    assert.deepEqual(this.dropped, [['a.jpg']], 're-enabled zone accepts');
  });
});
