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
        currentUser = {
          id: 'u1',
          companyId: 'c1',
          role,
          name: 'Jane Doe',
          email: 'jane@example.com',
        };
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

  test('saves name and region, then shows the ready screen without leaving', async function (assert) {
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
    assert.true(controller.isReady);
    assert.strictEqual(state.hydrated, null, 'session waits for the click');
    assert.deepEqual(state.transitions, []);
  });

  test('ready screen hydrates the session and opens the dashboard on click', async function (assert) {
    const state = setup(this.owner);
    const controller = this.owner.lookup('controller:onboarding');
    controller.updateName('Acme');
    controller.nextStep();
    controller.selectRegion('dubai');
    await controller.finish();

    controller.goToDashboard();
    controller.goToDashboard();

    assert.strictEqual(state.hydrated.companyName, 'Acme');
    assert.deepEqual(state.transitions, ['dashboard']);
  });

  test('greets the user by first name and knows their email', function (assert) {
    setup(this.owner);
    const controller = this.owner.lookup('controller:onboarding');
    assert.strictEqual(controller.firstName, 'Jane');
    assert.strictEqual(controller.userEmail, 'jane@example.com');

    this.owner.lookup('service:auth').currentUser = { role: 'company_admin' };
    assert.strictEqual(controller.firstName, '');
    assert.strictEqual(controller.userEmail, '');
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
    assert.false(controller.isReady);
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
