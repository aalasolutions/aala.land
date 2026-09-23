import { module, test } from 'qunit';
import {
  ROLES,
  canAccessWhatsapp,
  canManageFinancials,
  canManageRegions,
  canManageUsers,
  canUpdateUser,
  canViewReports,
  getVisibleGroups,
  isAdminRole,
  isSuperAdmin,
} from 'land/utils/roles';

// Each gate is pinned against every role, not just the one that inspired it.
module('Unit | Utility | roles', function () {
  const EVERY_ROLE = Object.values(ROLES);

  function allowed(predicate) {
    return EVERY_ROLE.filter((role) => predicate(role));
  }

  test('an unknown or missing role is allowed nothing', function (assert) {
    for (const predicate of [
      isAdminRole,
      isSuperAdmin,
      canManageUsers,
      canAccessWhatsapp,
      canManageFinancials,
      canManageRegions,
      canViewReports,
    ]) {
      assert.false(predicate(undefined), `${predicate.name} on nothing`);
      assert.false(predicate('not-a-role'), `${predicate.name} on a stranger`);
    }
  });

  // Region changes are a paid entitlement, above the admin line.
  test('region management stops above admin', function (assert) {
    assert.deepEqual(allowed(canManageRegions), [
      ROLES.SUPER_ADMIN,
      ROLES.COMPANY_ADMIN,
    ]);
    assert.false(canManageRegions(ROLES.ADMIN));
  });

  // Company-wide figures and colleagues' performance stay above agent level.
  test('reports stop at manager, for the route and the sidebar', function (assert) {
    const viewers = [ROLES.COMPANY_ADMIN, ROLES.ADMIN, ROLES.MANAGER];
    assert.deepEqual(allowed(canViewReports), viewers);
    assert.deepEqual(
      allowed((role) => getVisibleGroups(role).reports),
      viewers,
    );
  });

  test('isAdminRole and canManageUsers cover the same three roles', function (assert) {
    const admins = [ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN, ROLES.ADMIN];
    assert.deepEqual(allowed(isAdminRole), admins);
    assert.deepEqual(allowed(canManageUsers), admins);
  });

  test('isSuperAdmin is the operator alone', function (assert) {
    assert.deepEqual(allowed(isSuperAdmin), [ROLES.SUPER_ADMIN]);
  });

  test('WhatsApp reaches agents but not the operator', function (assert) {
    assert.deepEqual(allowed(canAccessWhatsapp), [
      ROLES.COMPANY_ADMIN,
      ROLES.ADMIN,
      ROLES.MANAGER,
      ROLES.AGENT,
    ]);
  });

  test('financials reach the accountant but not the agent', function (assert) {
    assert.deepEqual(allowed(canManageFinancials), [
      ROLES.SUPER_ADMIN,
      ROLES.COMPANY_ADMIN,
      ROLES.ADMIN,
      ROLES.MANAGER,
      ROLES.ACCOUNTANT,
    ]);
  });

  test('a user may only be updated by a role above their own', function (assert) {
    assert.true(canUpdateUser(ROLES.COMPANY_ADMIN, ROLES.MANAGER));
    assert.true(canUpdateUser(ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN));
    assert.false(canUpdateUser(ROLES.MANAGER, ROLES.COMPANY_ADMIN));
    assert.false(
      canUpdateUser(ROLES.MANAGER, ROLES.MANAGER),
      'not even themselves',
    );
  });

  test('an unrecognised role on either side blocks the update', function (assert) {
    assert.false(canUpdateUser('not-a-role', ROLES.AGENT));
    assert.false(canUpdateUser(ROLES.SUPER_ADMIN, 'not-a-role'));
    assert.false(canUpdateUser(undefined, undefined));
  });

  test('getVisibleGroups answers for every sidebar group', function (assert) {
    const groups = getVisibleGroups(ROLES.AGENT);

    assert.deepEqual(Object.keys(groups).sort(), [
      'admin',
      'crm',
      'documents',
      'finance',
      'history',
      'operations',
      'outreach',
      'properties',
      'reports',
      'team',
    ]);
    assert.true(groups.crm, 'agents work leads');
    assert.false(groups.finance, 'and not the books');
    assert.false(groups.admin);
    assert.false(groups.team);
  });

  test('the operator console is the operator group only', function (assert) {
    assert.true(getVisibleGroups(ROLES.SUPER_ADMIN).admin);
    assert.false(getVisibleGroups(ROLES.COMPANY_ADMIN).admin);
    assert.true(getVisibleGroups(ROLES.COMPANY_ADMIN).team);
  });

  test('no role sees nothing at all', function (assert) {
    assert.deepEqual(getVisibleGroups(null), {});
    assert.deepEqual(getVisibleGroups(undefined), {});
  });
});
