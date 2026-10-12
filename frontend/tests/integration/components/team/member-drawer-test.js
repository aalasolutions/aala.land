import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click, fillIn, render, waitFor } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { stubAuth, stubNotifications } from 'land/tests/helpers/stub-auth';

const MEMBER = {
  id: 'user-2',
  name: 'Test Member',
  email: 'member@example.com',
  role: 'agent',
  regionCodes: ['DXB'],
};

const PAID = { tier: 'PRO', purchasedSeats: 2, hasSubscription: true };

module('Integration | Component | team/member-drawer', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.calls = stubAuth(this.owner, {
      role: 'admin',
      companyId: 'co-1',
      respond: () => ({ data: {} }),
    });
    this.toasts = stubNotifications(this.owner);
    const region = this.owner.lookup('service:region');
    region.regions = [
      { code: 'DXB', name: 'Dubai', currency: 'AED' },
      { code: 'LHR', name: 'Lahore', currency: 'PKR' },
    ];
    region.activeRegion = region.regions[0];
    this.open = true;
    this.user = null;
    this.seatInfo = PAID;
    this.saved = 0;
    this.onSaved = () => this.saved++;
    this.noop = () => {};
  });

  async function renderDrawer() {
    await render(
      hbs`<Team::MemberDrawer @open={{this.open}} @user={{this.user}} @seatInfo={{this.seatInfo}} @onClose={{this.noop}} @onSaved={{this.onSaved}} />`,
    );
    await waitFor('#t-name');
  }

  function sent(calls, method) {
    return calls.find((c) => c.method === method);
  }

  async function pickRole(label) {
    await click('#t-role [data-test-nu-dropdown-trigger]');
    const item = [
      ...document.querySelectorAll('[data-test-nu-dropdown-item]'),
    ].find((el) => el.textContent.trim() === label);
    await click(item);
  }

  test('create shows the seat note and posts the active region', async function (assert) {
    await renderDrawer();
    assert.dom('[data-test-seat-count]').hasText('2');
    assert.dom('[data-test-input-password]').exists();
    assert
      .dom('[data-test-region-choice="DXB"]')
      .hasAttribute('aria-pressed', 'true');
    assert.dom('[data-test-save-member]').hasText('Create');

    await fillIn('#t-name', 'New Person');
    await fillIn('#t-email', 'new@example.com');
    await fillIn('#t-password', 'Secret123!');
    await click('[data-test-region-choice="LHR"]');
    await click('[data-test-save-member]');

    const post = sent(this.calls, 'POST');
    assert.strictEqual(post.path, '/users');
    assert.deepEqual(post.body, {
      name: 'New Person',
      role: 'agent',
      email: 'new@example.com',
      password: 'Secret123!',
      regionCodes: ['DXB', 'LHR'],
    });
    assert.strictEqual(this.saved, 1);
    assert.deepEqual(this.toasts, [
      { type: 'success', message: 'Team member created' },
    ]);
  });

  test('roles offered are strictly below the current user', async function (assert) {
    await renderDrawer();
    await click('#t-role [data-test-nu-dropdown-trigger]');
    const labels = [
      ...document.querySelectorAll('[data-test-nu-dropdown-item]'),
    ].map((el) => el.textContent.trim());
    assert.deepEqual(labels, ['Manager', 'Agent', 'Accountant']);
  });

  test('edit prefills, patches the member and puts the regions', async function (assert) {
    this.user = MEMBER;
    await renderDrawer();
    assert.dom('#t-name').hasValue('Test Member');
    assert.dom('#t-email').hasValue('member@example.com');
    assert.dom('[data-test-input-password]').doesNotExist();
    assert.dom('[data-test-seat-count]').doesNotExist('no seat note on edit');
    assert.dom('[data-test-save-member]').hasText('Update');

    await fillIn('#t-name', 'Renamed Member');
    await pickRole('Manager');
    await click('[data-test-region-choice="LHR"]');
    await click('[data-test-save-member]');

    const patch = sent(this.calls, 'PATCH');
    assert.strictEqual(patch.path, '/users/user-2');
    assert.deepEqual(patch.body, { name: 'Renamed Member', role: 'manager' });
    const put = sent(this.calls, 'PUT');
    assert.strictEqual(put.path, '/users/user-2/regions');
    assert.deepEqual(put.body, { regionCodes: ['DXB', 'LHR'] });
    assert.deepEqual(this.toasts, [
      { type: 'success', message: 'Team member updated' },
    ]);
  });

  test('a company admin role covers all regions and skips the region PUT', async function (assert) {
    this.calls = stubAuth(this.owner, {
      role: 'super_admin',
      respond: () => ({ data: {} }),
    });
    this.user = MEMBER;
    await renderDrawer();
    await pickRole('Company Admin');

    assert
      .dom('[data-test-all-regions-note]')
      .hasText('Company admins have access to all regions.');
    assert.dom('[data-test-region-choice="LHR"]').isDisabled();
    await click('[data-test-save-member]');
    assert.deepEqual(sent(this.calls, 'PATCH').body, {
      name: 'Test Member',
      role: 'company_admin',
    });
    assert.notOk(sent(this.calls, 'PUT'));
  });

  test('editing yourself hides the role and never sends it', async function (assert) {
    this.calls = stubAuth(this.owner, {
      role: 'company_admin',
      respond: () => ({ data: {} }),
    });
    this.user = { ...MEMBER, id: 'user-1', role: 'company_admin' };
    await renderDrawer();
    assert.dom('[data-test-input-role]').doesNotExist();
    assert
      .dom('[data-test-all-regions-note]')
      .hasText('You are a company admin. You have access to all regions.');

    await click('[data-test-save-member]');
    assert.deepEqual(sent(this.calls, 'PATCH').body, { name: 'Test Member' });
    assert.notOk(sent(this.calls, 'PUT'));
  });

  test('clearing every region warns before save', async function (assert) {
    await renderDrawer();
    assert.dom('[data-test-regions-empty-warning]').doesNotExist();
    await click('[data-test-region-choice="DXB"]');
    assert.dom('[data-test-regions-empty-warning]').exists();
  });

  test('a failed save shows the server message', async function (assert) {
    this.calls = stubAuth(this.owner, {
      role: 'admin',
      respond: () => new Error('Seat limit reached'),
    });
    await renderDrawer();
    await fillIn('#t-name', 'X');
    await fillIn('#t-email', 'x@example.com');
    await fillIn('#t-password', 'Secret123!');
    await click('[data-test-save-member]');
    assert.dom('[data-test-error]').hasText('Seat limit reached');
    assert.strictEqual(this.saved, 0);
  });

  test('an edit draft never leaks into another member', async function (assert) {
    this.user = MEMBER;
    await renderDrawer();
    await fillIn('#t-name', 'Edited A');
    await click('[data-test-region-choice="LHR"]');
    this.set('user', {
      ...MEMBER,
      id: 'user-3',
      name: 'Member B',
      regionCodes: [],
    });

    assert.dom('#t-name').hasValue('Member B');
    assert
      .dom('[data-test-region-choice="LHR"]')
      .hasAttribute('aria-pressed', 'false');
  });
});
