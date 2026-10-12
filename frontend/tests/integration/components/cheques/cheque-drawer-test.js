import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import {
  click,
  fillIn,
  render,
  settled,
  waitFor,
  waitUntil,
} from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';

const UNITS = [
  { id: 'unit-1', areaName: 'Area', assetName: 'Tower', unitNumber: '101' },
  { id: 'unit-2', areaName: 'Area', assetName: 'Tower', unitNumber: '202' },
];

const CHEQUE = {
  id: 'chq-1',
  chequeNumber: '000123',
  bankName: 'Test Bank',
  accountHolder: 'Test User',
  amount: '8500.00',
  dueDate: '2026-11-01T00:00:00.000Z',
  type: 'SECURITY_DEPOSIT',
  leaseId: 'lease-1',
  unitId: 'unit-1',
};

// A menu opened while the drawer still slides in is re-clamped inside its ResizeObserver callback.
async function drawerSettled() {
  await waitUntil(() => {
    const drawer = document.querySelector('[data-test-nu-drawer]');
    return (
      drawer?.classList.contains('is-open') &&
      drawer.getAnimations().length === 0
    );
  });
}

module('Integration | Component | cheques/cheque-drawer', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    const calls = [];
    this.calls = calls;
    this.failWith = null;
    const ctx = this;
    this.owner.register(
      'service:auth',
      class extends Service {
        async fetchJson(path, options = {}) {
          calls.push({ path, options });
          if (path.startsWith('/properties/units')) {
            return { success: true, data: { data: UNITS, total: 2 } };
          }
          if (ctx.failWith) throw new Error(ctx.failWith);
          return { success: true, data: {} };
        }
      },
    );
    this.owner.register(
      'service:notifications',
      class extends Service {
        success() {}
        error() {}
      },
    );
    this.open = true;
    this.cheque = null;
    this.closed = 0;
    this.saved = 0;
    this.onClose = () => this.set('closed', this.closed + 1);
    this.onSaved = () => this.set('saved', this.saved + 1);
  });

  function sent(calls, method) {
    return calls.find((c) => c.options.method === method);
  }

  async function pick(selector, label) {
    await drawerSettled();
    await click(`${selector} [data-test-nu-dropdown-trigger]`);
    const item = [
      ...document.querySelectorAll('[data-test-nu-dropdown-item]'),
    ].find((el) => el.textContent.trim() === label);
    await click(item);
  }

  async function renderDrawer() {
    await render(
      hbs`<Cheques::ChequeDrawer @open={{this.open}} @cheque={{this.cheque}} @onClose={{this.onClose}} @onSaved={{this.onSaved}} />`,
    );
    await waitFor('#chq-number');
    await settled();
  }

  function unitFetches(calls) {
    return calls.filter((c) => c.path === '/properties/units?page=1&limit=100')
      .length;
  }

  test('loads its unit list when it opens, not before', async function (assert) {
    this.open = false;
    await render(
      hbs`<Cheques::ChequeDrawer @open={{this.open}} @cheque={{this.cheque}} @onClose={{this.onClose}} @onSaved={{this.onSaved}} />`,
    );
    assert.strictEqual(unitFetches(this.calls), 0, 'closed: nothing fetched');

    this.set('open', true);
    await waitFor('#chq-number');
    await settled();
    assert.strictEqual(unitFetches(this.calls), 1, 'fetched on open');
    await drawerSettled();
    await click('#chq-unit [data-test-nu-dropdown-trigger]');
    const labels = [
      ...document.querySelectorAll('[data-test-nu-dropdown-item]'),
    ].map((el) => el.textContent.trim());
    assert.deepEqual(labels, [
      'No property linked',
      'Area - Tower - Property 101',
      'Area - Tower - Property 202',
    ]);
  });

  test('the unit list is fetched again on a second open', async function (assert) {
    await renderDrawer();
    assert.strictEqual(unitFetches(this.calls), 1);

    this.set('open', false);
    await settled();
    this.set('open', true);
    await waitFor('#chq-number');
    await settled();
    assert.strictEqual(unitFetches(this.calls), 2);
  });

  test('create posts the full body with amount parsed to a number', async function (assert) {
    await renderDrawer();
    assert.dom('[data-test-save-cheque]').hasText('Create Cheque');
    await fillIn('[data-test-input-cheque-number]', '000555');
    await fillIn('[data-test-input-bank]', 'Test Bank');
    await fillIn('[data-test-input-holder]', 'Test User');
    await pick('#chq-unit', 'Area - Tower - Property 202');
    await pick('#chq-type', 'Maintenance / Service Charges');
    await fillIn('[data-test-input-amount]', '1250.50');
    await fillIn('[data-test-input-due-date]', '2026-12-01');
    await click('[data-test-save-cheque]');

    const post = sent(this.calls, 'POST');
    assert.strictEqual(post.path, '/cheques');
    assert.deepEqual(JSON.parse(post.options.body), {
      chequeNumber: '000555',
      bankName: 'Test Bank',
      accountHolder: 'Test User',
      amount: 1250.5,
      dueDate: '2026-12-01',
      type: 'MAINTENANCE',
      unitId: 'unit-2',
    });
    assert.strictEqual(this.closed, 1, 'closes after saving');
    assert.strictEqual(this.saved, 1, 'tells the page to refresh');
  });

  test('create without a property omits unitId and leaseId', async function (assert) {
    await renderDrawer();
    await fillIn('[data-test-input-cheque-number]', '1');
    await fillIn('[data-test-input-bank]', 'B');
    await fillIn('[data-test-input-holder]', 'H');
    await fillIn('[data-test-input-amount]', '10');
    await fillIn('[data-test-input-due-date]', '2026-12-01');
    await click('[data-test-save-cheque]');

    const body = JSON.parse(sent(this.calls, 'POST').options.body);
    assert.strictEqual(body.type, 'RENT', 'type defaults to rent');
    assert.notOk('unitId' in body);
    assert.notOk('leaseId' in body);
  });

  test('edit prefills the form and patches the edit body', async function (assert) {
    this.cheque = CHEQUE;
    await renderDrawer();

    assert.dom('[data-test-input-cheque-number]').hasValue('000123');
    assert.dom('[data-test-input-bank]').hasValue('Test Bank');
    assert.dom('[data-test-input-holder]').hasValue('Test User');
    assert.dom('[data-test-input-amount]').hasValue('8500.00');
    assert.dom('[data-test-input-due-date]').hasValue('2026-11-01');
    assert
      .dom('#chq-type [data-test-nu-dropdown-trigger]')
      .includesText('Security Deposit');
    assert
      .dom('#chq-unit [data-test-nu-dropdown-trigger]')
      .includesText('Area - Tower - Property 101');
    assert.dom('[data-test-save-cheque]').hasText('Update');

    await fillIn('[data-test-input-amount]', '9000');
    await click('[data-test-save-cheque]');

    const patch = sent(this.calls, 'PATCH');
    assert.strictEqual(patch.path, '/cheques/chq-1');
    assert.deepEqual(JSON.parse(patch.options.body), {
      chequeNumber: '000123',
      bankName: 'Test Bank',
      amount: 9000,
      type: 'SECURITY_DEPOSIT',
      dueDate: '2026-11-01',
      unitId: 'unit-1',
    });
  });

  test('a failed save shows the server message and keeps the drawer open', async function (assert) {
    this.failWith = 'Cheque number already exists';
    this.cheque = CHEQUE;
    await renderDrawer();
    await click('[data-test-save-cheque]');

    assert.dom('[data-test-error]').hasText('Cheque number already exists');
    assert.strictEqual(this.closed, 0);
    assert.strictEqual(this.saved, 0);
  });

  test('an edit draft and its error never leak into another cheque', async function (assert) {
    this.failWith = 'Refused';
    this.cheque = CHEQUE;
    await renderDrawer();
    await fillIn('[data-test-input-bank]', 'Edited Bank');
    await click('[data-test-save-cheque]');
    assert.dom('[data-test-error]').exists();

    this.set('cheque', { ...CHEQUE, id: 'chq-2', bankName: 'Other Bank' });
    await settled();
    assert.dom('[data-test-input-bank]').hasValue('Other Bank');
    assert.dom('[data-test-error]').doesNotExist();

    this.set('cheque', null);
    await settled();
    assert.dom('[data-test-input-bank]').hasValue('');
  });
});
