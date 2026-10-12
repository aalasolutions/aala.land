import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

module('Unit | Controller | admin/system', function (hooks) {
  setupTest(hooks);

  test('rows show override countries and keep one id per price row', function (assert) {
    const controller = this.owner.lookup('controller:admin/system');
    controller.model = {
      rows: [
        { id: 'p1', kind: 'SEAT', currency: 'usd', countryCodes: null },
        { id: 'p2', kind: 'SEAT', currency: 'usd', countryCodes: ['IN', 'PK'] },
      ],
    };

    assert.deepEqual(
      controller.rows.map((r) => [r.id, r.label, r.countries]),
      [
        ['p1', 'SEAT / USD', '-'],
        ['p2', 'SEAT / USD', 'IN, PK'],
      ],
    );
    assert.ok(controller.columns.some((c) => c.valuePath === 'countries'));
  });

  test('rows label the tax setting and the badge reports a pending change', function (assert) {
    const controller = this.owner.lookup('controller:admin/system');
    const base = { kind: 'SEAT', currency: 'usd', countryCodes: null };
    controller.model = {
      pending: 1,
      failed: 0,
      missing: 0,
      rows: [
        { ...base, id: 'p1', taxInclusive: true },
        { ...base, id: 'p2', taxInclusive: false },
        { ...base, id: 'p3', taxInclusive: null },
        { ...base, id: 'p4', countryCodes: ['PK'], taxInclusive: null },
      ],
    };

    assert.deepEqual(
      controller.rows.map((r) => r.tax),
      ['Included', 'Added on top', 'Included', 'As base price'],
    );
    assert.strictEqual(controller.healthBadge.text, '1 pending');
    assert.true(controller.needsFix);
  });

  test('the tax column and checkbox show only when the provider uses the setting', function (assert) {
    const controller = this.owner.lookup('controller:admin/system');
    const hasTax = () => controller.columns.some((c) => c.valuePath === 'tax');

    controller.model = { rows: [], supportsTaxMode: false };
    assert.false(controller.showTax);
    assert.false(hasTax());

    controller.health = { rows: [], supportsTaxMode: true };
    assert.true(controller.showTax);
    assert.true(hasTax());

    controller.amountRow = { isBase: true };
    assert.true(controller.showNewTax);
    controller.amountRow = { isBase: false };
    assert.false(controller.showNewTax);
  });

  function stubAuth(controller, impl) {
    const calls = [];
    controller.auth = {
      fetchJson: async (path, options) => {
        calls.push({ path, options });
        return impl(path, options);
      },
    };
    controller.notifications = { success() {}, error() {} };
    return calls;
  }

  test('add price posts minor units, lowercase currency and upper-case countries', async function (assert) {
    const controller = this.owner.lookup('controller:admin/system');
    const calls = stubAuth(controller, () => ({ data: { rows: [] } }));
    controller.openAdd();
    controller.addKind = 'SEAT';
    controller.addCurrency = 'EUR';
    controller.addAmount = '19.99';
    controller.addCountries = 'de, at';

    await controller.submitAdd();

    assert.strictEqual(calls[0].path, '/console/prices');
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      kind: 'SEAT',
      currency: 'eur',
      unitAmount: 1999,
      countryCodes: ['DE', 'AT'],
    });
    assert.false(controller.addOpen, 'modal closes on success');
    assert.deepEqual(controller.data, { rows: [] }, 'table uses the payload');
  });

  test('add price omits countries for a base price and rejects bad input locally', async function (assert) {
    const controller = this.owner.lookup('controller:admin/system');
    const calls = stubAuth(controller, () => ({ data: { rows: [] } }));
    controller.openAdd();
    controller.addAmount = '25';
    controller.addCountries = 'PAK';

    await controller.submitAdd();
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(
      controller.priceError,
      'Countries must be 2-letter codes, comma separated.',
    );

    controller.addCountries = '';
    controller.addAmount = '0.99';
    await controller.submitAdd();
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(controller.priceError, 'Enter an amount of 1 or more.');

    controller.addAmount = '19.999';
    await controller.submitAdd();
    assert.strictEqual(
      controller.priceError,
      'USD amounts take at most 2 decimal places.',
    );
    assert.strictEqual(
      controller.amountError('1500.5', 'jpy'),
      'JPY amounts take no decimal places.',
    );
    assert.strictEqual(controller.amountError('', 'usd'), 'Enter an amount.');
    assert.strictEqual(calls.length, 0);

    controller.addAmount = '25';
    await controller.submitAdd();
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      kind: 'SEAT',
      currency: 'usd',
      unitAmount: 2500,
      taxInclusive: true,
    });

    controller.openAdd();
    assert.true(controller.addTaxInclusive, 'ticked by default');
    controller.addAmount = '25';
    controller.setTaxInclusive('addTaxInclusive', false);
    await controller.submitAdd();
    assert.false(JSON.parse(calls[1].options.body).taxInclusive);
  });

  test('backend errors stay in the open modal', async function (assert) {
    const controller = this.owner.lookup('controller:admin/system');
    stubAuth(controller, () => {
      throw new Error('Countries PK already have an active SEAT custom price.');
    });
    controller.openAdd();
    controller.addAmount = '10';
    controller.addCountries = 'PK';

    await controller.submitAdd();

    assert.true(controller.addOpen);
    assert.strictEqual(
      controller.priceError,
      'Countries PK already have an active SEAT custom price.',
    );
    assert.false(controller.priceBusy);
  });

  test('change amount and deactivate post to the row and refresh the table', async function (assert) {
    const controller = this.owner.lookup('controller:admin/system');
    const payload = { rows: [{ id: 'p2' }] };
    const calls = stubAuth(controller, () => ({ data: payload }));
    const row = { id: 'p1', currency: 'jpy', unitAmount: 3000 };

    controller.openAmount(row);
    assert.strictEqual(controller.newAmount, '3000', 'prefills the amount');
    controller.newAmount = '3500';
    await controller.submitAmount();
    assert.strictEqual(calls[0].path, '/console/prices/p1/amount');
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      unitAmount: 3500,
      taxInclusive: true,
    });
    assert.strictEqual(controller.amountRow, null);

    controller.openDeactivate(row);
    await controller.submitDeactivate();
    assert.strictEqual(calls[1].path, '/console/prices/p1/deactivate');
    assert.strictEqual(calls[1].options.body, undefined);
    assert.strictEqual(controller.deactivateRow, null);
    assert.strictEqual(controller.data, payload);
  });

  test('change price follows the row tax setting and sends none for a custom price', async function (assert) {
    const controller = this.owner.lookup('controller:admin/system');
    const calls = stubAuth(controller, () => ({ data: { rows: [] } }));

    controller.openAmount({
      id: 'p1',
      currency: 'usd',
      unitAmount: 2500,
      taxInclusive: false,
    });
    assert.false(controller.newTaxInclusive, 'unticked for tax on top');
    controller.newAmount = '26';
    await controller.submitAmount();
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      unitAmount: 2600,
      taxInclusive: false,
    });

    controller.openAmount({
      id: 'p2',
      currency: 'usd',
      unitAmount: 1100,
      countryCodes: ['PK'],
    });
    controller.newAmount = '12';
    await controller.submitAmount();
    assert.deepEqual(JSON.parse(calls[1].options.body), { unitAmount: 1200 });
  });
});
