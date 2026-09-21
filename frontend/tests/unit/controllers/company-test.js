import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

const DAY = 24 * 60 * 60 * 1000;

module('Unit | Controller | company', function (hooks) {
  setupTest(hooks);

  function controllerWith(assigns) {
    const controller = this.owner.lookup('controller:company');
    Object.assign(controller, assigns);
    return controller;
  }

  test('creditUsageLabel is null until a limit is known', function (assert) {
    const controller = controllerWith.call(this, { creditsLimit: null });
    assert.strictEqual(controller.creditUsageLabel, null);
  });

  test('counts down the days to the period reset', function (assert) {
    const controller = controllerWith.call(this, {
      creditsLimit: 50,
      creditsUsed: 12,
      creditsResetsAt: new Date(Date.now() + 3 * DAY).toISOString(),
    });
    assert.true(
      controller.creditUsageLabel.startsWith(
        "You've used 12/50 AI credits this period",
      ),
    );
    assert.true(controller.creditUsageLabel.includes('resets in 3d'));
  });

  test('clamps an elapsed period to 0d instead of counting backwards', function (assert) {
    const controller = controllerWith.call(this, {
      creditsLimit: 50,
      creditsUsed: 50,
      creditsResetsAt: new Date(Date.now() - 5 * DAY).toISOString(),
    });
    assert.true(controller.creditUsageLabel.includes('resets in 0d'));
    assert.false(controller.creditUsageLabel.includes('resets in -'));
  });

  test('drops the countdown when the reset date is unparseable', function (assert) {
    const controller = controllerWith.call(this, {
      creditsLimit: 50,
      creditsUsed: 4,
      creditsResetsAt: 'not-a-date',
    });
    assert.strictEqual(
      controller.creditUsageLabel,
      "You've used 4/50 AI credits this period",
    );
    assert.false(controller.creditUsageLabel.includes('NaN'));
  });

  test('treats a missing used count as zero', function (assert) {
    const controller = controllerWith.call(this, {
      creditsLimit: 200,
      creditsUsed: null,
      creditsResetsAt: null,
    });
    assert.strictEqual(
      controller.creditUsageLabel,
      "You've used 0/200 AI credits this period",
    );
  });

  test('hasCreditAgents reflects the breakdown list', function (assert) {
    const controller = controllerWith.call(this, { creditAgents: [] });
    assert.false(controller.hasCreditAgents);
    controller.creditAgents = [{ userId: 'u1' }];
    assert.true(controller.hasCreditAgents);
  });

  // An unknown tab id in a shared URL must land somewhere, not render nothing.
  module('tabs', function () {
    test('an unknown tab id falls back to the default panel', function (assert) {
      const controller = controllerWith.call(this, { tab: 'not-a-tab' });
      assert.strictEqual(controller.currentTab, 'general');

      controller.tab = null;
      controller.activeTab = 'not-a-tab';
      assert.strictEqual(controller.currentTab, 'general');
    });

    test('the URL tab wins over the default panel', function (assert) {
      const controller = controllerWith.call(this, { tab: 'billing' });
      assert.strictEqual(controller.currentTab, 'billing');
    });

    test('with no tab in the URL the default panel shows', function (assert) {
      const controller = controllerWith.call(this, { tab: null });
      assert.strictEqual(controller.currentTab, 'general');
    });

    test('setTab writes the query param, not the default', function (assert) {
      const controller = controllerWith.call(this, { tab: null });

      controller.setTab('regions');

      assert.strictEqual(controller.tab, 'regions', 'the URL carries it');
      assert.strictEqual(controller.activeTab, 'general', 'default untouched');
      assert.strictEqual(controller.currentTab, 'regions');
    });

    test('every offered tab id resolves to itself', function (assert) {
      const controller = controllerWith.call(this, {});
      for (const tab of controller.settingsTabs) {
        controller.tab = tab.id;
        assert.strictEqual(controller.currentTab, tab.id, tab.id);
      }
    });
  });

  module('regions', function (nested) {
    const REGIONS = [
      { code: 'dxb', name: 'Dubai', currency: 'AED' },
      { code: 'auh', name: 'Abu Dhabi', currency: 'AED' },
      { code: 'ruh', name: 'Riyadh', currency: 'SAR' },
    ];

    nested.beforeEach(function () {
      this.errors = [];
    });

    function makeController(ctx, assigns = {}) {
      const { role = 'company_admin', company = {}, ...rest } = assigns;
      const controller = ctx.owner.lookup('controller:company');
      controller.auth = {
        currentUser: { role, companyId: 'company-1' },
        fetchJson() {
          throw new Error('no request expected');
        },
      };
      controller.notifications = {
        error: (message) => ctx.errors.push(message),
        success() {},
      };
      controller.model = {
        regions: REGIONS,
        company: { maxRegions: 2, subscriptionTier: 'FREE', ...company },
      };
      Object.assign(controller, rest);
      return controller;
    }

    test('a non-admin cannot change the region selection', function (assert) {
      const controller = makeController(this, {
        role: 'agent',
        formActiveRegions: ['dxb'],
      });

      controller.toggleRegion('auh');
      controller.toggleRegion('dxb');

      assert.deepEqual(controller.formActiveRegions, ['dxb'], 'untouched');
      assert.deepEqual(this.errors, [], 'and not told off for trying');
    });

    // An agent fails the admin check before the region guard, so only an admin reaches it.
    test('an admin cannot change the region selection either', function (assert) {
      const controller = makeController(this, {
        role: 'admin',
        formActiveRegions: ['dxb'],
      });

      controller.toggleRegion('auh');
      controller.toggleRegion('dxb');

      assert.deepEqual(controller.formActiveRegions, ['dxb'], 'untouched');
      assert.deepEqual(this.errors, [], 'and not told off for trying');
    });

    test('the first region picked becomes the default', function (assert) {
      const controller = makeController(this, { formActiveRegions: [] });

      controller.toggleRegion('dxb');

      assert.deepEqual(controller.formActiveRegions, ['dxb']);
      assert.strictEqual(controller.formDefaultRegionCode, 'dxb');
    });

    test('the plan limit stops the next region and says why', function (assert) {
      const controller = makeController(this, {
        formActiveRegions: ['dxb', 'auh'],
      });

      assert.false(controller.canAddMoreRegions);
      controller.toggleRegion('ruh');

      assert.deepEqual(controller.formActiveRegions, ['dxb', 'auh']);
      assert.strictEqual(this.errors.length, 1);
      assert.true(
        this.errors[0].includes('FREE plan allows 2 regions'),
        this.errors[0],
      );
    });

    test('the limit message reads correctly for a single region', function (assert) {
      const controller = makeController(this, {
        company: { maxRegions: 1, subscriptionTier: 'STARTER' },
        formActiveRegions: ['dxb'],
      });

      controller.toggleRegion('auh');

      assert.true(
        this.errors[0].includes('STARTER plan allows 1 region.'),
        this.errors[0],
      );
    });

    test('dropping the default region hands the default to another', function (assert) {
      const controller = makeController(this, {
        formActiveRegions: ['dxb', 'auh'],
        formDefaultRegionCode: 'dxb',
      });

      controller.toggleRegion('dxb');

      assert.deepEqual(controller.formActiveRegions, ['auh']);
      assert.strictEqual(controller.formDefaultRegionCode, 'auh');
    });

    test('dropping the last region leaves no default behind', function (assert) {
      const controller = makeController(this, {
        formActiveRegions: ['dxb'],
        formDefaultRegionCode: 'dxb',
      });

      controller.toggleRegion('dxb');

      assert.deepEqual(controller.formActiveRegions, []);
      assert.strictEqual(controller.formDefaultRegionCode, '');
    });

    test('dropping a region that is not the default leaves the default alone', function (assert) {
      const controller = makeController(this, {
        formActiveRegions: ['dxb', 'auh'],
        formDefaultRegionCode: 'auh',
      });

      controller.toggleRegion('dxb');

      assert.strictEqual(controller.formDefaultRegionCode, 'auh');
    });

    test('removedRegionNames names the saved regions the edit drops', function (assert) {
      const controller = makeController(this, {
        company: { activeRegions: ['dxb', 'auh', 'unknown'] },
        formActiveRegions: ['dxb'],
      });

      assert.deepEqual(controller.removedRegionNames, ['Abu Dhabi', 'unknown']);
    });

    test('nothing is reported as removed when regions are only added', function (assert) {
      const controller = makeController(this, {
        company: { activeRegions: ['dxb'] },
        formActiveRegions: ['dxb', 'auh'],
      });

      assert.deepEqual(controller.removedRegionNames, []);
    });

    test('the removal warning says what happens to user assignments', function (assert) {
      const controller = makeController(this, {
        company: { activeRegions: ['dxb', 'auh'] },
        formActiveRegions: [],
      });

      assert.strictEqual(
        controller.regionRemovalMessage,
        'Dubai, Abu Dhabi will be removed from every user assigned to them. ' +
          'Those user assignments are not restored if you add them back later.',
      );

      controller.formActiveRegions = ['dxb'];
      assert.true(
        controller.regionRemovalMessage.startsWith(
          'Abu Dhabi will be removed from every user assigned to it.',
        ),
        'singular reads correctly',
      );
    });

    test('saving a removal asks first instead of saving', function (assert) {
      const controller = makeController(this, {
        company: { activeRegions: ['dxb', 'auh'] },
        formActiveRegions: ['dxb'],
      });

      // auth.fetchJson throws if the save runs, so reaching the confirm is the assertion.
      controller.saveCompany({ preventDefault() {} });

      assert.true(controller.showRegionRemovalConfirm);
      assert.strictEqual(controller.errorMsg, '');
      assert.false(controller.isSaving, 'nothing was sent');
    });

    test('saving with no removals does not ask', async function (assert) {
      const controller = makeController(this, {
        company: { activeRegions: ['dxb'] },
        formActiveRegions: ['dxb', 'auh'],
      });
      let sent = false;
      controller.auth.fetchJson = () => {
        sent = true;
        return Promise.resolve({});
      };
      controller.region = { initialize() {} };
      controller.session = {
        data: { authenticated: {} },
        saveToStorage() {},
      };
      controller.notifications.success = () => {};
      controller.router = { refresh() {}, on() {}, off() {} };

      await controller.saveCompany({ preventDefault() {} });

      assert.false(controller.showRegionRemovalConfirm);
      assert.true(sent, 'saved straight away');
      assert.false(controller.isSaving);
      assert.deepEqual(
        controller.session.data.authenticated.regions.map((r) => r.code),
        ['dxb', 'auh'],
        'the new selection is kept for a hard reload',
      );
    });

    test('an empty selection is refused before any confirm', function (assert) {
      const controller = makeController(this, {
        company: { activeRegions: ['dxb'] },
        formActiveRegions: [],
      });

      controller.saveCompany({ preventDefault() {} });

      assert.strictEqual(
        controller.errorMsg,
        'At least one region must be selected.',
      );
      assert.false(controller.showRegionRemovalConfirm);
    });

    test('an admin saving a region change is refused, and told which right is missing', function (assert) {
      const controller = makeController(this, {
        role: 'admin',
        company: { activeRegions: ['dxb'] },
        formActiveRegions: ['dxb', 'auh'],
      });

      controller.saveCompany({ preventDefault() {} });

      assert.strictEqual(
        controller.errorMsg,
        'Only company admins can add or remove regions.',
      );
      assert.false(controller.showRegionRemovalConfirm);
      assert.false(controller.isSaving, 'nothing was sent');
    });

    test('an admin saving without touching the regions still goes through', async function (assert) {
      const controller = makeController(this, {
        role: 'admin',
        company: { activeRegions: ['dxb'], defaultRegionCode: 'dxb' },
        formActiveRegions: ['dxb'],
        formDefaultRegionCode: 'dxb',
        formName: 'Renamed',
      });
      let sent = false;
      controller.auth.fetchJson = () => {
        sent = true;
        return Promise.resolve({});
      };
      controller.region = { initialize() {} };
      controller.session = {
        data: { authenticated: {} },
        saveToStorage() {},
      };
      controller.notifications.success = () => {};
      controller.router = { refresh() {}, on() {}, off() {} };

      await controller.saveCompany({ preventDefault() {} });

      assert.strictEqual(controller.errorMsg, '');
      assert.true(sent, 'the refusal is field-level, not a blanket block');
    });

    test('a non-admin is told why the save did not happen', function (assert) {
      const controller = makeController(this, {
        role: 'agent',
        company: { activeRegions: ['dxb'] },
        formActiveRegions: [],
      });

      controller.saveCompany({ preventDefault() {} });

      assert.strictEqual(
        controller.errorMsg,
        'Only company admins and super admins can update company settings.',
      );
      assert.false(controller.showRegionRemovalConfirm);
    });

    test('closing the confirm leaves the pending edit intact', function (assert) {
      const controller = makeController(this, {
        formActiveRegions: ['dxb'],
        showRegionRemovalConfirm: true,
      });

      controller.closeRegionRemovalConfirm();

      assert.false(controller.showRegionRemovalConfirm);
      assert.deepEqual(controller.formActiveRegions, ['dxb']);
    });

    test('activeRegionOptions describes only the picked regions', function (assert) {
      const controller = makeController(this, {
        formActiveRegions: ['ruh', 'dxb'],
      });

      assert.deepEqual(controller.activeRegionOptions, [
        { value: 'dxb', label: 'Dubai (AED)' },
        { value: 'ruh', label: 'Riyadh (SAR)' },
      ]);
    });

    test('leaving the page drops the pending region edit', function (assert) {
      const controller = makeController(this, {
        formActiveRegions: ['dxb', 'auh'],
        formName: 'Test Company',
        showRegionRemovalConfirm: true,
      });

      controller.routeWillChangeHandler({
        from: { name: 'company' },
        to: { name: 'dashboard' },
      });

      assert.deepEqual(controller.formActiveRegions, []);
      assert.strictEqual(controller.formName, '');
      assert.false(controller.showRegionRemovalConfirm);
    });

    test('moving within the page keeps the pending region edit', function (assert) {
      const controller = makeController(this, {
        formActiveRegions: ['dxb', 'auh'],
      });

      controller.routeWillChangeHandler({
        from: { name: 'company' },
        to: { name: 'company' },
      });
      controller.routeWillChangeHandler({
        from: { name: 'dashboard' },
        to: { name: 'company' },
      });

      assert.deepEqual(controller.formActiveRegions, ['dxb', 'auh']);
    });
  });
});
