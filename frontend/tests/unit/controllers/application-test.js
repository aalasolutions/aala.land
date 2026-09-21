import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import Service from '@ember/service';

class MockSessionService extends Service {
  isAuthenticated = false;
  whatsappConfigured = false;
}

class MockRouterService extends Service {
  currentRouteName = null;
  on() {}
  off() {}
  transitionTo() {}
}

module('Unit | Controller | application', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:session', MockSessionService);
    this.owner.register('service:router', MockRouterService);
  });

  function makeController(ctx) {
    const controller = ctx.owner.lookup('controller:application');
    // Pins isNarrow directly instead of relying on matchMedia, which depends on the test viewport.
    controller.isNarrow = false;
    return controller;
  }

  test('whatsappDisabled tracks session.whatsappConfigured only', function (assert) {
    const controller = makeController(this);

    controller.session.whatsappConfigured = false;
    assert.true(controller.whatsappDisabled);

    controller.session.whatsappConfigured = true;
    assert.false(controller.whatsappDisabled);
  });

  test('whatsappTooltip carries the ruling message when disabled, collapsed or not', function (assert) {
    const controller = makeController(this);
    controller.session.whatsappConfigured = false;

    controller.uiSettings.sidebarCollapsed = false;
    assert.strictEqual(
      controller.whatsappTooltip,
      'WhatsApp is not configured. Check system variables or contact your admin.',
    );

    controller.uiSettings.sidebarCollapsed = true;
    assert.strictEqual(
      controller.whatsappTooltip,
      'WhatsApp is not configured. Check system variables or contact your admin.',
      'disabled message wins even collapsed',
    );
  });

  test('whatsappTooltip falls back to the collapsed-rail label once configured', function (assert) {
    const controller = makeController(this);
    controller.session.whatsappConfigured = true;

    controller.uiSettings.sidebarCollapsed = true;
    assert.strictEqual(controller.whatsappTooltip, 'WhatsApp');

    controller.uiSettings.sidebarCollapsed = false;
    assert.strictEqual(controller.whatsappTooltip, null);
  });

  module('whatsapp socket', function (nested) {
    nested.beforeEach(function () {
      this.owner.register(
        'service:whatsapp',
        class extends Service {
          connects = 0;
          disconnects = 0;
          totalUnread = 0;
          connectSocket() {
            this.connects++;
          }
          disconnectSocket() {
            this.disconnects++;
          }
        },
      );
      this.owner.register(
        'service:socket',
        class extends Service {
          socket = null;
          setup() {}
          on() {}
          off() {}
          disconnect() {}
        },
      );
      this.owner.register(
        'service:auth',
        class extends Service {
          currentUser = { role: 'agent' };
          logout() {
            return Promise.resolve();
          }
        },
      );
    });

    function makeGated(ctx) {
      const controller = makeController(ctx);
      controller.session.isAuthenticated = true;
      controller.session.whatsappConfigured = true;
      controller.whatsapp.connects = 0;
      controller.whatsapp.disconnects = 0;
      return controller;
    }

    test('connects on route change only when authenticated, configured and role allowed', function (assert) {
      const controller = makeGated(this);

      controller.routeDidChangeHandler();
      assert.strictEqual(controller.whatsapp.connects, 1);
      assert.strictEqual(controller.whatsapp.disconnects, 0);
    });

    test('disconnects when any one gate fails', function (assert) {
      const controller = makeGated(this);

      controller.session.whatsappConfigured = false;
      controller.routeDidChangeHandler();
      assert.strictEqual(controller.whatsapp.connects, 0, 'not configured');

      controller.session.whatsappConfigured = true;
      controller.auth.currentUser = { role: 'super_admin' };
      controller.routeDidChangeHandler();
      assert.strictEqual(controller.whatsapp.connects, 0, 'role denied');

      controller.auth.currentUser = { role: 'agent' };
      controller.session.isAuthenticated = false;
      controller.routeDidChangeHandler();
      assert.strictEqual(controller.whatsapp.connects, 0, 'signed out');
      assert.true(controller.whatsapp.disconnects >= 3);
    });

    test('the constructor applies the same gate', function (assert) {
      this.owner.lookup('service:session').isAuthenticated = true;
      this.owner.lookup('service:session').whatsappConfigured = true;

      const controller = makeController(this);
      assert.strictEqual(controller.whatsapp.connects, 1);
    });

    test('whatsappUnreadCount reads the service total', function (assert) {
      const controller = makeController(this);
      controller.whatsapp.totalUnread = 7;
      assert.strictEqual(controller.whatsappUnreadCount, 7);
    });

    test('confirmLogout disconnects the whatsapp socket', async function (assert) {
      const controller = makeGated(this);

      await controller.confirmLogout();
      assert.true(controller.whatsapp.disconnects >= 1);
    });
  });

  // The topbar switcher is the only way to change the working region.
  module('regions', function (nested) {
    const REGIONS = [
      { code: 'ruh', name: 'Riyadh', countryName: 'Saudi Arabia' },
      { code: 'dxb', name: 'Dubai', countryName: 'United Arab Emirates' },
      { code: 'auh', name: 'Abu Dhabi', countryName: 'United Arab Emirates' },
      { code: 'doh', name: 'Doha', country: 'Qatar' },
      { code: 'nowhere', name: 'Nowhere' },
    ];

    nested.beforeEach(function () {
      this.owner.register(
        'service:auth',
        class extends Service {
          currentUser = { id: 'user-1', companyId: 'company-1', role: 'admin' };
        },
      );
    });

    function withRegions(ctx, regions = REGIONS) {
      const controller = makeController(ctx);
      controller.region.regions = regions;
      return controller;
    }

    test('the switcher needs a second region or the right to manage them', function (assert) {
      const controller = withRegions(this, []);
      assert.false(controller.showRegionSwitcher);
      assert.false(controller.showRegionLabel);

      // The module signs in as an admin, who is confined to their assigned regions.
      controller.region.regions = [REGIONS[0]];
      assert.false(
        controller.showRegionSwitcher,
        'one region and no manage rights leaves nothing to pick',
      );
      assert.true(controller.showRegionLabel, 'the region is still named');

      controller.auth.currentUser = { role: 'company_admin' };
      assert.true(
        controller.showRegionSwitcher,
        'a company admin keeps the picker as the way into region management',
      );
      assert.false(controller.showRegionLabel);

      controller.auth.currentUser = { role: 'agent' };
      assert.false(controller.showRegionSwitcher);
      assert.true(controller.showRegionLabel);

      controller.region.regions = [REGIONS[0], REGIONS[1]];
      assert.true(controller.showRegionSwitcher);
      assert.false(controller.showRegionLabel);
    });

    test('managing regions stops above admin', function (assert) {
      const controller = withRegions(this);
      assert.false(controller.canManageRegions, 'not for an admin');

      controller.auth.currentUser = { role: 'company_admin' };
      assert.true(controller.canManageRegions);

      controller.auth.currentUser = { role: 'super_admin' };
      assert.true(controller.canManageRegions);

      controller.auth.currentUser = { role: 'agent' };
      assert.false(controller.canManageRegions);

      controller.auth.currentUser = null;
      assert.false(
        controller.canManageRegions,
        'and not for a signed-out user',
      );
    });

    test('regions are grouped by country, both levels sorted', function (assert) {
      const controller = withRegions(this);

      assert.deepEqual(
        controller.groupedRegions.map((group) => [
          group.countryName,
          group.regions.map((r) => r.name),
        ]),
        [
          ['Other', ['Nowhere']],
          ['Qatar', ['Doha']],
          ['Saudi Arabia', ['Riyadh']],
          ['United Arab Emirates', ['Abu Dhabi', 'Dubai']],
        ],
      );
    });

    test('unit counts stay null until they load, so no badge shows', function (assert) {
      const controller = withRegions(this);
      controller.regionUnitCounts = null;

      assert.true(
        controller.groupedRegions.every((group) =>
          group.regions.every((r) => r.unitCount === null),
        ),
      );
    });

    test('a region missing from the counts really has none', function (assert) {
      const controller = withRegions(this);
      controller.regionUnitCounts = { dxb: 3 };

      const byCode = Object.fromEntries(
        controller.groupedRegions
          .flatMap((group) => group.regions)
          .map((r) => [r.code, r.unitCount]),
      );
      assert.strictEqual(byCode.dxb, 3);
      assert.strictEqual(byCode.auh, 0, 'a real zero, not a missing badge');
    });
  });
});
