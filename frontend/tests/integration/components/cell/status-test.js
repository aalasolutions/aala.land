import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | cell/status', function (hooks) {
  setupRenderingTest(hooks);

  test('label and variant come from the column domain', async function (assert) {
    this.set('column', { cellArgs: { domain: 'lease' } });
    await render(
      hbs`<div data-test-out><Cell::Status @value="DRAFT" @column={{this.column}} /></div>`,
    );
    assert.dom('[data-test-out]').hasText('Draft');
    assert.dom('[data-test-out] .wu-tag.gray').exists();
  });

  test('a direct domain overrides the column', async function (assert) {
    this.set('column', { cellArgs: { domain: 'lease' } });
    await render(
      hbs`<div data-test-out><Cell::Status @value="PENDING_APPROVAL" @domain="wo" @column={{this.column}} /></div>`,
    );
    assert.dom('[data-test-out]').hasText('Pending Approval (Owner/Manager)');
    assert.dom('[data-test-out] .wu-tag.warning').exists();
  });

  test('an empty value renders "-"', async function (assert) {
    this.set('column', { cellArgs: { domain: 'lease' } });
    await render(
      hbs`<div data-test-out><Cell::Status @value={{null}} @column={{this.column}} /></div>`,
    );
    assert.dom('[data-test-out]').hasText('-');
    assert.dom('[data-test-out] [data-test-wu-cell-empty]').exists();
  });
});
