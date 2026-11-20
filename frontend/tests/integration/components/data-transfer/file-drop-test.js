import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render, triggerEvent } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

function file(name, size = 10) {
  return new File([new Uint8Array(size)], name, { type: 'text/csv' });
}

module('Integration | Component | data-transfer/file-drop', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.received = [];
    this.set('onFile', (picked) => this.received.push(picked));
  });

  test('shows the hint and reports a chosen file with its size', async function (assert) {
    await render(hbs`
      <DataTransfer::FileDrop
        @accept=".csv,.xlsx"
        @maxSize={{1024}}
        @hint="CSV or Excel"
        @onFile={{this.onFile}}
      />
    `);
    assert.dom('[data-test-file-drop-hint]').hasText('CSV or Excel');
    assert
      .dom('[data-test-file-drop-input]')
      .hasAttribute('accept', '.csv,.xlsx');

    await triggerEvent('[data-test-file-drop-input]', 'change', {
      files: [file('people.csv', 512)],
    });

    assert.dom('[data-test-file-drop-name]').hasText('people.csv');
    assert.dom('[data-test-file-drop-size]').includesText('512');
    assert.dom('[data-test-file-drop-error]').doesNotExist();
    assert.strictEqual(this.received.length, 1);
    assert.strictEqual(this.received[0].name, 'people.csv');
  });

  test('rejects a wrong extension and an oversized file with plain words', async function (assert) {
    await render(hbs`
      <DataTransfer::FileDrop
        @accept=".csv,.xlsx"
        @maxSize={{1024}}
        @onFile={{this.onFile}}
      />
    `);

    await triggerEvent('[data-test-file-drop-input]', 'change', {
      files: [file('people.txt')],
    });
    assert
      .dom('[data-test-file-drop-error]')
      .hasText('Choose a .csv, .xlsx file.');
    assert.strictEqual(this.received[0], null);

    await triggerEvent('[data-test-file-drop-input]', 'change', {
      files: [file('big.csv', 2048)],
    });
    assert.dom('[data-test-file-drop-error]').includesText('The limit is');
    assert.dom('[data-test-file-drop-name]').doesNotExist();
  });

  test('accepts a dropped file', async function (assert) {
    await render(hbs`
      <DataTransfer::FileDrop @accept=".csv" @onFile={{this.onFile}} />
    `);
    await triggerEvent('[data-test-file-drop]', 'drop', {
      dataTransfer: { files: [file('dropped.csv')] },
    });
    assert.dom('[data-test-file-drop-name]').hasText('dropped.csv');
    assert.strictEqual(this.received[0].name, 'dropped.csv');
  });
});
