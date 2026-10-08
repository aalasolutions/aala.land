import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Helper | billing-history-status', function (hooks) {
  setupRenderingTest(hooks);

  async function statusOf(context, row) {
    context.set('row', row);
    await render(
      hbs`{{#let (billing-history-status this.row) as |s|}}<span data-test-label>{{s.label}}</span><span data-test-class>{{s.tagClass}}</span><span data-test-credit>{{if s.creditAmount "credit" "none"}}</span>{{/let}}`,
    );
    return {
      label: document.querySelector('[data-test-label]').textContent,
      tagClass: document.querySelector('[data-test-class]').textContent,
      credit: document.querySelector('[data-test-credit]').textContent,
    };
  }

  test('refund rows map each refund status to its label and tag', async function (assert) {
    const pending = await statusOf(this, {
      type: 'refund',
      refundStatus: 'pending',
    });
    const approved = await statusOf(this, {
      type: 'refund',
      refundStatus: 'approved',
    });
    const rejected = await statusOf(this, {
      type: 'refund',
      refundStatus: 'rejected',
    });
    assert.strictEqual(pending.label, 'Refund requested');
    assert.strictEqual(pending.tagClass, 'tag-txn-pending');
    assert.strictEqual(approved.label, 'Refunded');
    assert.strictEqual(approved.tagClass, 'tag-txn-completed');
    assert.strictEqual(rejected.label, 'Refund rejected');
    assert.strictEqual(rejected.tagClass, 'tag-txn-failed');
  });

  test('a refund row never shows a credit figure', async function (assert) {
    const result = await statusOf(this, {
      type: 'refund',
      refundStatus: 'approved',
      creditApplied: 500,
      creditIssued: 500,
    });
    assert.strictEqual(result.credit, 'none');
  });

  test('a refund without a known status reads as requested', async function (assert) {
    const result = await statusOf(this, { type: 'refund', refundStatus: null });
    assert.strictEqual(result.label, 'Refund requested');
  });

  test('existing types and the unknown fallback are unchanged', async function (assert) {
    assert.strictEqual(
      (await statusOf(this, { type: 'payment_succeeded' })).label,
      'Paid',
    );
    assert.strictEqual(
      (await statusOf(this, { type: 'payment_failed' })).label,
      'Failed',
    );
    const unknown = await statusOf(this, { type: 'something_new' });
    assert.strictEqual(unknown.label, 'Failed');
    assert.strictEqual(unknown.tagClass, 'tag-txn-failed');
    assert.strictEqual(
      (await statusOf(this, { type: 'settled_without_charge' })).label,
      'No charge',
    );
  });
});
