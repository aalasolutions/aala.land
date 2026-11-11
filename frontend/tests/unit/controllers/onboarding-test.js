import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import Service from '@ember/service';

module('Unit | Controller | onboarding', function (hooks) {
  setupTest(hooks);

  function setup(owner, role = 'company_admin') {
    const state = { requests: [], transitions: [], hydrated: null };
    owner.register(
      'service:auth',
      class extends Service {
        currentUser = { id: 'u1', companyId: 'c1', role };
        async fetchJson(path, options = {}) {
          state.requests.push({ path, ...options });
          if (path === '/auth/profile') {
            return {
              data: { companyName: 'Acme', defaultRegionCode: 'dubai' },
            };
          }
          return { data: {} };
        }
      },
    );
    owner.register(
      'service:session',
      class extends Service {
        hydrate(data) {
          state.hydrated = data;
        }
      },
    );
    owner.register(
      'service:router',
      class extends Service {
        transitionTo(routeName) {
          state.transitions.push(routeName);
        }
      },
    );
    return state;
  }

  test('only a company admin can complete onboarding', function (assert) {
    setup(this.owner, 'agent');
    const controller = this.owner.lookup('controller:onboarding');
    assert.false(controller.canComplete);
  });

  test('step 1 requires a non-blank company name', function (assert) {
    setup(this.owner);
    const controller = this.owner.lookup('controller:onboarding');

    controller.updateName('   ');
    controller.nextStep();
    assert.strictEqual(controller.step, 1);
    assert.strictEqual(
      controller.fieldErrors.companyName,
      'Enter a company name',
    );

    controller.updateName('Acme');
    controller.nextStep();
    assert.strictEqual(controller.step, 2);
  });

  test('step 2 requires a region before saving', async function (assert) {
    const state = setup(this.owner);
    const controller = this.owner.lookup('controller:onboarding');
    controller.updateName('Acme');
    controller.nextStep();

    await controller.finish();

    assert.strictEqual(controller.fieldErrors.region, 'Choose a region');
    assert.strictEqual(state.requests.length, 0);
  });

  test('saves name and region, refreshes the session, then opens the dashboard', async function (assert) {
    const state = setup(this.owner);
    const controller = this.owner.lookup('controller:onboarding');
    controller.updateName('  Acme  ');
    controller.nextStep();
    controller.selectRegion('dubai');

    await controller.finish();

    assert.strictEqual(state.requests[0].path, '/companies/c1');
    assert.strictEqual(state.requests[0].method, 'PATCH');
    assert.deepEqual(JSON.parse(state.requests[0].body), {
      name: 'Acme',
      activeRegions: ['dubai'],
      defaultRegionCode: 'dubai',
    });
    assert.strictEqual(state.requests[1].path, '/auth/profile');
    assert.strictEqual(state.hydrated.companyName, 'Acme');
    assert.deepEqual(state.transitions, ['dashboard']);
  });

  test('shows the server error and stays put when saving fails', async function (assert) {
    const state = setup(this.owner);
    this.owner.lookup('service:auth').fetchJson = async () => {
      throw new Error('Request failed');
    };
    const controller = this.owner.lookup('controller:onboarding');
    controller.updateName('Acme');
    controller.nextStep();
    controller.selectRegion('dubai');

    await controller.finish();

    assert.strictEqual(controller.errorMessage, 'Request failed');
    assert.deepEqual(state.transitions, []);
  });

  test('builds grouped region options from the model', function (assert) {
    setup(this.owner);
    const controller = this.owner.lookup('controller:onboarding');
    controller.model = {
      grouped: [
        {
          countryName: 'Saudi Arabia',
          regions: [{ code: 'makkah', name: 'Makkah', currency: 'SAR' }],
        },
      ],
    };
    assert.deepEqual(controller.regionOptions, [
      { value: 'makkah', label: 'Makkah (SAR)', group: 'Saudi Arabia' },
    ]);
  });
});
