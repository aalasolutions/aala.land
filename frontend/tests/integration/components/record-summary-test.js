import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { findAll, render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | record-summary', function (hooks) {
  setupRenderingTest(hooks);

  function rows() {
    return findAll('.nu-desc-list__group').map((g) => [
      g.querySelector('dt').textContent.trim(),
      g.querySelector('dd').textContent.trim(),
    ]);
  }

  test('a lease shows tenant, unit with building, ref and status', async function (assert) {
    this.set('record', {
      id: 'l1',
      status: 'DRAFT',
      tenancyRegistrationRef: 'REF-1',
      contact: { displayName: 'Test Tenant', accessLevel: 'FULL' },
      unit: { unitNumber: 'U-1', asset: { name: 'Test Tower' } },
    });
    await render(hbs`<RecordSummary @type="lease" @record={{this.record}} />`);

    assert.deepEqual(rows(), [
      ['Tenant', 'Test Tenant'],
      ['Unit', 'U-1, Test Tower'],
      ['Ref', 'REF-1'],
      ['Status', 'Draft'],
    ]);
  });

  test('a limited contact shows only masked fields and the Limited tag', async function (assert) {
    this.set('record', {
      id: 'c1',
      accessLevel: 'LIMITED',
      firstName: 'Test',
      lastInitial: 'U.',
      phoneMasked: '+971 50 *** **67',
      email: 'hidden@example.com',
    });
    await render(hbs`<RecordSummary @type="contact" @record={{this.record}} />`);

    assert.dom('[data-test-record-summary-limited]').exists();
    assert.deepEqual(rows(), [
      ['Name', 'Test U.'],
      ['Phone', '+971 50 *** **67'],
    ]);
  });

  test('renders nothing when the record carries no details', async function (assert) {
    this.set('record', { id: 'u1', label: 'Linked unit' });
    await render(hbs`<RecordSummary @type="unit" @record={{this.record}} />`);

    assert.dom('[data-test-record-summary]').doesNotExist();
  });
});
