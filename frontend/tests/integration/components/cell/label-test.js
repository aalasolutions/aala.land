import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | cell/label', function (hooks) {
  setupRenderingTest(hooks);

  test('shows the option label of the column domain as plain text', async function (assert) {
    this.set('column', { cellArgs: { domain: 'lease' } });
    await render(
      hbs`<Cell::Label @value="RESIDENTIAL" @column={{this.column}} />`,
    );
    assert
      .dom('[data-test-wu-cell-text]')
      .hasText('Residential (Long-Term)')
      .hasClass('text-regular')
      .hasAttribute('title', 'Residential (Long-Term)');
    assert.dom('.wu-tag').doesNotExist();
  });

  test('a direct domain overrides the column', async function (assert) {
    this.set('column', { cellArgs: { domain: 'lease' } });
    await render(
      hbs`<Cell::Label @value="PENDING_APPROVAL" @domain="wo" @column={{this.column}} />`,
    );
    assert
      .dom('[data-test-wu-cell-text]')
      .hasText('Pending Approval (Owner/Manager)');
  });

  test('an unknown value is title cased', async function (assert) {
    await render(hbs`<Cell::Label @value="SHORT_STAY" @domain="lease" />`);
    assert.dom('[data-test-wu-cell-text]').hasText('Short Stay');
  });

  test('an empty value renders "-"', async function (assert) {
    for (const value of [null, undefined, '']) {
      this.set('value', value);
      await render(hbs`<Cell::Label @value={{this.value}} @domain="lease" />`);
      assert.dom('[data-test-wu-cell-empty]').hasText('-', `empty: ${value}`);
      assert.dom('[data-test-wu-cell-text]').doesNotExist();
    }
  });
});
