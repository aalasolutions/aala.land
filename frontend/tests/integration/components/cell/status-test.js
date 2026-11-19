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

  test('a value map turns a boolean into a domain value', async function (assert) {
    this.set('column', {
      cellArgs: {
        domain: 'enabled',
        valueMap: { true: 'active', false: 'inactive' },
      },
    });
    await render(
      hbs`<div data-test-out><Cell::Status @value={{true}} @column={{this.column}} /></div>`,
    );
    assert.dom('[data-test-out]').hasText('Active');
    assert.dom('[data-test-out] .wu-tag.success').exists();

    await render(
      hbs`<div data-test-out><Cell::Status @value={{false}} @column={{this.column}} /></div>`,
    );
    assert.dom('[data-test-out]').hasText('Inactive');
    assert.dom('[data-test-out] .wu-tag.gray').exists();
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
