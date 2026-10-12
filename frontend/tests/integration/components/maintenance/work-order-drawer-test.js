import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click, fillIn, render, settled, waitFor } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';

const ORDER = {
  id: 'wo-1',
  unitId: 'unit-1',
  title: 'Fix AC',
  description: 'Unit is too warm',
  status: 'OPEN',
  priority: 'HIGH',
  category: 'HVAC',
  vendorId: null,
};

module(
  'Integration | Component | maintenance/work-order-drawer',
  function (hooks) {
    setupRenderingTest(hooks);

    hooks.beforeEach(function () {
      const calls = [];
      this.calls = calls;
      this.owner.register(
        'service:auth',
        class extends Service {
          async fetchJson(path, options = {}) {
            calls.push({ path, options });
            return { success: true, data: { data: [], total: 0 } };
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
      this.workOrder = null;
      this.noop = () => {};
    });

    function sent(calls, method) {
      return calls.find((c) => c.options.method === method);
    }

    function fetches(calls, prefix) {
      return calls.filter((c) => c.path.startsWith(prefix)).length;
    }

    test('loads its unit and vendor lists when it opens, not before', async function (assert) {
      this.open = false;
      await render(
        hbs`<Maintenance::WorkOrderDrawer @open={{this.open}} @workOrder={{this.workOrder}} @onClose={{this.noop}} />`,
      );
      assert.strictEqual(this.calls.length, 0, 'closed: nothing fetched');

      this.set('open', true);
      await waitFor('#wo-title');
      await settled();
      assert.strictEqual(
        fetches(this.calls, '/properties/units?page=1&limit=500'),
        1,
      );
      assert.strictEqual(fetches(this.calls, '/vendors?page=1&limit=100'), 1);
    });

    test('the lists are fetched again on a second open', async function (assert) {
      await render(
        hbs`<Maintenance::WorkOrderDrawer @open={{this.open}} @workOrder={{this.workOrder}} @onClose={{this.noop}} />`,
      );
      await waitFor('#wo-title');
      await settled();

      this.set('open', false);
      await settled();
      this.set('open', true);
      await waitFor('#wo-title');
      await settled();
      assert.strictEqual(fetches(this.calls, '/properties/units'), 2);
      assert.strictEqual(fetches(this.calls, '/vendors'), 2);
    });

    test('create without a property is refused', async function (assert) {
      await render(
        hbs`<Maintenance::WorkOrderDrawer @open={{this.open}} @workOrder={{this.workOrder}} @onClose={{this.noop}} />`,
      );
      await waitFor('#wo-title');
      await fillIn('#wo-title', 'Fix door');
      await fillIn('#wo-desc', 'Hinge broken');
      await click('[data-test-save-work-order]');

      assert
        .dom('[data-test-error]')
        .hasText('Please select a property before saving the work order.');
      assert.notOk(sent(this.calls, 'POST'));
    });

    test('cancelling an order requires a reason, then sends it', async function (assert) {
      this.workOrder = ORDER;
      await render(
        hbs`<Maintenance::WorkOrderDrawer @open={{this.open}} @workOrder={{this.workOrder}} @onClose={{this.noop}} />`,
      );
      await waitFor('#wo-title');
      await click('#wo-status [data-test-nu-dropdown-trigger]');
      const cancelled = [
        ...document.querySelectorAll('[data-test-nu-dropdown-item]'),
      ].find((el) => el.textContent.trim() === 'Cancelled');
      await click(cancelled);

      await click('[data-test-save-work-order]');
      assert
        .dom('[data-test-reason-input]')
        .exists('the reason field appears for a cancel');
      assert.notOk(sent(this.calls, 'PATCH'), 'no save without a reason');

      await fillIn('[data-test-reason-input]', 'Tenant fixed it');
      await click('[data-test-save-work-order]');
      const body = JSON.parse(sent(this.calls, 'PATCH').options.body);
      assert.strictEqual(body.status, 'CANCELLED');
      assert.strictEqual(body.reason, 'Tenant fixed it');
    });

    test('an edit draft never leaks into another work order', async function (assert) {
      await render(
        hbs`<Maintenance::WorkOrderDrawer @open={{this.open}} @workOrder={{this.workOrder}} @onClose={{this.noop}} />`,
      );
      await waitFor('#wo-title');
      this.set('workOrder', ORDER);
      await fillIn('#wo-title', 'Edited A');
      this.set('workOrder', { ...ORDER, id: 'wo-2', title: 'Order B' });

      assert.dom('#wo-title').hasValue('Order B');
    });

    test('saving an edit patches the order with the form values', async function (assert) {
      this.workOrder = ORDER;
      await render(
        hbs`<Maintenance::WorkOrderDrawer @open={{this.open}} @workOrder={{this.workOrder}} @onClose={{this.noop}} />`,
      );
      await waitFor('#wo-title');
      await fillIn('#wo-title', 'Fix AC now');
      await click('[data-test-save-work-order]');

      const patch = sent(this.calls, 'PATCH');
      assert.strictEqual(patch.path, '/maintenance/wo-1');
      const body = JSON.parse(patch.options.body);
      assert.strictEqual(body.title, 'Fix AC now');
      assert.strictEqual(body.status, 'OPEN');
      assert.strictEqual(body.vendorId, null);
      assert.notOk('reason' in body);
      assert.notOk('reportedBy' in body);
    });
  },
);
