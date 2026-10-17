import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click, fillIn, render, settled, waitFor } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';
import { localDateString, todayInZone } from 'land/utils/local-date';

// UTC+14 and UTC-11 are always on different dates, so one differs from the browser date.
const FAR_ZONES = ['Pacific/Kiritimati', 'Pacific/Pago_Pago'];

function zoneAheadOfBrowser() {
  return FAR_ZONES.find((tz) => todayInZone(tz) !== localDateString());
}

const TX = {
  id: 'tx-1',
  type: 'EXPENSE',
  category: 'MAINTENANCE',
  amount: '450.00',
  description: 'Pump repair',
  transactionDate: '2026-10-05T00:00:00.000Z',
  status: 'PENDING',
  paymentMethod: 'BANK_TRANSFER',
};

const TRIGGER = '[data-test-nu-dropdown-trigger]';

module(
  'Integration | Component | financials/transaction-drawer',
  function (hooks) {
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
      this.region = this.owner.lookup('service:region');
      this.region.activeRegion = { code: 'dxb', timezone: 'Asia/Dubai' };
      this.open = true;
      this.transaction = null;
      this.closed = 0;
      this.saved = 0;
      this.onClose = () => this.set('closed', this.closed + 1);
      this.onSaved = () => this.set('saved', this.saved + 1);
    });

    function sent(calls, method) {
      return calls.find((c) => c.options.method === method);
    }

    async function pick(selector, label) {
      await click(`${selector} ${TRIGGER}`);
      const item = [
        ...document.querySelectorAll('[data-test-nu-dropdown-item]'),
      ].find((el) => el.textContent.trim() === label);
      await click(item);
    }

    async function optionLabels(selector) {
      await click(`${selector} ${TRIGGER}`);
      const labels = [
        ...document.querySelectorAll('[data-test-nu-dropdown-item]'),
      ].map((el) => el.textContent.trim());
      await click(`${selector} ${TRIGGER}`);
      return labels;
    }

    async function renderDrawer() {
      await render(
        hbs`<Financials::TransactionDrawer @open={{this.open}} @transaction={{this.transaction}} @onClose={{this.onClose}} @onSaved={{this.onSaved}} />`,
      );
      await waitFor('#tx-date');
    }

    module('default date', function () {
      // Samples the expected date on both sides of the render so a midnight rollover cannot flake.
      async function assertToday(ctx, assert, expectedFn) {
        const before = expectedFn();
        await renderDrawer();
        const after = expectedFn();
        const value = document.querySelector('#tx-date').value;
        assert.true(
          [before, after].includes(value),
          `date ${value} is ${before} or ${after}`,
        );
        return value;
      }

      test('create defaults the date to today in the active region zone', async function (assert) {
        const zone = zoneAheadOfBrowser();
        this.region.activeRegion = { code: 'far', timezone: zone };
        const value = await assertToday(this, assert, () => todayInZone(zone));
        assert.notStrictEqual(value, localDateString());
      });

      test('create falls back to the browser-local date without an active region', async function (assert) {
        this.region.activeRegion = null;
        await assertToday(this, assert, () => localDateString());
      });
    });

    module('transaction date rules', function () {
      test('the picker closes today and opens 30 days back', async function (assert) {
        await renderDrawer();
        const input = document.querySelector('#tx-date');
        const days = (Date.parse(input.max) - Date.parse(input.min)) / 86400000;
        assert.strictEqual(days, 30, 'exactly 30 days of window');
        assert.strictEqual(
          input.max,
          new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' }),
          'the latest day is today in the active region',
        );
      });

      test('completing with no date is refused before any request', async function (assert) {
        await renderDrawer();
        await pick('#tx-status', 'Completed / Paid');
        await fillIn('#tx-date', '');
        await fillIn('[data-test-tx-amount]', '100');
        await click('[data-test-save-transaction]');

        assert
          .dom('[data-test-nu-field-error]')
          .hasText('Enter the date the money arrived');
        assert.notOk(sent(this.calls, 'POST'));
        assert.dom('[data-test-save-transaction]').hasText('Create');
      });

      test('an expense names the date it was paid', async function (assert) {
        await renderDrawer();
        await pick('#tx-type', 'Expense / Outflow');
        await pick('#tx-status', 'Completed / Paid');
        await fillIn('#tx-date', '');
        await fillIn('[data-test-tx-amount]', '100');
        await click('[data-test-save-transaction]');

        assert
          .dom('[data-test-nu-field-error]')
          .hasText('Enter the date the money was paid');
      });
    });

    module('type lock', function () {
      test('a cheque payment forces the type to expense and locks it', async function (assert) {
        await renderDrawer();
        await pick('#tx-payment', 'Cheque');

        assert.dom(`#tx-type ${TRIGGER}`).includesText('Expense / Outflow');
        assert.dom(`#tx-type ${TRIGGER}`).isDisabled();
      });

      test('rental income and sale categories force income and lock it', async function (assert) {
        await renderDrawer();
        await pick('#tx-type', 'Expense / Outflow');

        await pick('#tx-category', 'Rental Income');
        assert.dom(`#tx-type ${TRIGGER}`).includesText('Income / Revenue');
        assert.dom(`#tx-type ${TRIGGER}`).isDisabled();

        await pick('#tx-category', 'Property Sale Proceeds');
        assert.dom(`#tx-type ${TRIGGER}`).includesText('Income / Revenue');
        assert.dom(`#tx-type ${TRIGGER}`).isDisabled();
      });

      test('payment method outranks category: rent paid by cheque is an expense', async function (assert) {
        await renderDrawer();
        await pick('#tx-category', 'Rental Income');
        await pick('#tx-payment', 'Cheque');

        assert.dom(`#tx-type ${TRIGGER}`).includesText('Expense / Outflow');
        assert.dom(`#tx-type ${TRIGGER}`).isDisabled();
      });

      test('two-way categories leave the type editable', async function (assert) {
        await renderDrawer();
        for (const label of [
          'Security Deposit',
          'Routine Maintenance / Repairs',
          'Agency Commission / Brokerage',
          'Other Miscellaneous',
        ]) {
          await pick('#tx-category', label);
          assert
            .dom(`#tx-type ${TRIGGER}`)
            .isNotDisabled(`${label} leaves type unlocked`);
        }
        await pick('#tx-type', 'Expense / Outflow');
        assert.dom(`#tx-type ${TRIGGER}`).includesText('Expense / Outflow');
      });

      test('the date label follows the direction of the money', async function (assert) {
        await renderDrawer();
        await pick('#tx-category', 'Rental Income');
        assert.dom('form#transaction-form').includesText('Date money arrived');

        await pick('#tx-payment', 'Cheque');
        assert.dom('form#transaction-form').includesText('Date money was paid');
      });

      test('a cheque payment hides the incoming-only categories', async function (assert) {
        await renderDrawer();
        const all = await optionLabels('#tx-category');
        assert.true(all.includes('Rental Income'), 'rent is offered');
        assert.true(all.includes('Property Sale Proceeds'), 'sale is offered');

        await pick('#tx-payment', 'Cheque');
        assert.deepEqual(await optionLabels('#tx-category'), [
          'Security Deposit',
          'Routine Maintenance / Repairs',
          'Agency Commission / Brokerage',
          'Other Miscellaneous',
        ]);
      });

      test('switching to cheque clears a category it no longer offers', async function (assert) {
        await renderDrawer();
        await pick('#tx-category', 'Rental Income');
        await pick('#tx-payment', 'Cheque');
        assert
          .dom(`#tx-category ${TRIGGER}`)
          .includesText('Select category...', 're-pick is forced');

        await pick('#tx-category', 'Routine Maintenance / Repairs');
        await pick('#tx-payment', 'Cash');
        assert
          .dom(`#tx-category ${TRIGGER}`)
          .includesText(
            'Routine Maintenance / Repairs',
            'a still-valid category survives the switch',
          );
      });

      test('unlocking gives back the type the user had chosen', async function (assert) {
        await renderDrawer();
        assert.dom(`#tx-type ${TRIGGER}`).includesText('Income / Revenue');

        await pick('#tx-payment', 'Cheque');
        assert.dom(`#tx-type ${TRIGGER}`).includesText('Expense / Outflow');

        await pick('#tx-payment', 'Cash');
        assert.dom(`#tx-type ${TRIGGER}`).isNotDisabled('the control unlocks');
        assert
          .dom(`#tx-type ${TRIGGER}`)
          .includesText('Income / Revenue', 'and the old choice returns');
      });

      test('a second lock does not overwrite the remembered choice', async function (assert) {
        await renderDrawer();
        await pick('#tx-type', 'Expense / Outflow');

        await pick('#tx-category', 'Rental Income');
        assert.dom(`#tx-type ${TRIGGER}`).includesText('Income / Revenue');

        await pick('#tx-payment', 'Cheque');
        assert.dom(`#tx-type ${TRIGGER}`).includesText('Expense / Outflow');

        await pick('#tx-payment', 'Cash');
        await pick('#tx-category', 'Other Miscellaneous');
        assert.dom(`#tx-type ${TRIGGER}`).isNotDisabled();
        assert
          .dom(`#tx-type ${TRIGGER}`)
          .includesText('Expense / Outflow', 'the original choice survives');
      });
    });

    test('create posts the full body with amount parsed to a number', async function (assert) {
      await renderDrawer();
      await pick('#tx-category', 'Agency Commission / Brokerage');
      await fillIn('[data-test-tx-amount]', '1500.25');
      await fillIn('[data-test-tx-desc]', 'Broker fee');
      await fillIn('[data-test-tx-date]', '2026-10-01');
      await click('[data-test-save-transaction]');

      const post = sent(this.calls, 'POST');
      assert.strictEqual(post.path, '/financial/transactions');
      assert.deepEqual(JSON.parse(post.options.body), {
        type: 'INCOME',
        category: 'COMMISSION',
        amount: 1500.25,
        status: 'PENDING',
        paymentMethod: 'CASH',
        description: 'Broker fee',
        transactionDate: '2026-10-01',
      });
      assert.strictEqual(this.closed, 1, 'closes after saving');
      assert.strictEqual(this.saved, 1, 'tells the page to refresh');
    });

    test('create without a description or date omits them', async function (assert) {
      await renderDrawer();
      await fillIn('[data-test-tx-amount]', '10');
      await fillIn('[data-test-tx-date]', '');
      await click('[data-test-save-transaction]');

      const body = JSON.parse(sent(this.calls, 'POST').options.body);
      assert.notOk('description' in body);
      assert.notOk('transactionDate' in body);
    });

    test('edit prefills the form and patches the edit body', async function (assert) {
      this.transaction = TX;
      await renderDrawer();

      assert.dom('[data-test-tx-amount]').hasValue('450.00');
      assert.dom('[data-test-tx-desc]').hasValue('Pump repair');
      assert.dom('[data-test-tx-date]').hasValue('2026-10-05');
      assert.dom(`#tx-payment ${TRIGGER}`).includesText('Bank Transfer / Wire');
      assert
        .dom(`#tx-category ${TRIGGER}`)
        .includesText('Routine Maintenance / Repairs');
      assert.dom(`#tx-type ${TRIGGER}`).includesText('Expense / Outflow');
      assert.dom('[data-test-save-transaction]').hasText('Update');

      await fillIn('[data-test-tx-amount]', '500');
      await pick('#tx-status', 'Completed / Paid');
      await click('[data-test-save-transaction]');

      const patch = sent(this.calls, 'PATCH');
      assert.strictEqual(patch.path, '/financial/transactions/tx-1');
      assert.deepEqual(JSON.parse(patch.options.body), {
        amount: 500,
        status: 'COMPLETED',
        paymentMethod: 'BANK_TRANSFER',
        description: 'Pump repair',
        transactionDate: '2026-10-05',
      });
    });

    test('editing a rent row locks its type on open', async function (assert) {
      this.transaction = { ...TX, category: 'RENT', type: 'INCOME' };
      await renderDrawer();
      assert.dom(`#tx-type ${TRIGGER}`).isDisabled();
      assert.dom(`#tx-type ${TRIGGER}`).includesText('Income / Revenue');
    });

    test('a failed save shows the server message and keeps the drawer open', async function (assert) {
      this.failWith = 'Month is closed';
      this.transaction = TX;
      await renderDrawer();
      await click('[data-test-save-transaction]');

      assert.dom('[data-test-error]').hasText('Month is closed');
      assert.strictEqual(this.closed, 0);
      assert.strictEqual(this.saved, 0);
    });

    test('an edit draft and its error never leak into another transaction', async function (assert) {
      this.failWith = 'Refused';
      this.transaction = TX;
      await renderDrawer();
      await fillIn('[data-test-tx-desc]', 'Edited A');
      await click('[data-test-save-transaction]');
      assert.dom('[data-test-error]').exists();

      this.set('transaction', {
        ...TX,
        id: 'tx-2',
        description: 'Transaction B',
      });
      await settled();
      assert.dom('[data-test-tx-desc]').hasValue('Transaction B');
      assert.dom('[data-test-error]').doesNotExist();

      this.set('transaction', null);
      await settled();
      assert.dom('[data-test-tx-desc]').hasValue('');
    });
  },
);
