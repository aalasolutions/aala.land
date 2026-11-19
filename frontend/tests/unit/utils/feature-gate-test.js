import { module, test } from 'qunit';
import {
  canExport,
  canImport,
  isTransferAdmin,
  TRANSFER_TIERS,
} from 'land/utils/feature-gate';

function session(role, subscriptionTier) {
  return { data: { authenticated: { user: { role }, subscriptionTier } } };
}

module('Unit | Utility | feature-gate', function () {
  test('only the company admin is a transfer admin', function (assert) {
    assert.true(isTransferAdmin(session('company_admin', 'PRO')));
    for (const role of [
      'admin',
      'manager',
      'agent',
      'accountant',
      'super_admin',
    ]) {
      assert.false(isTransferAdmin(session(role, 'ENTERPRISE')), role);
    }
    assert.false(isTransferAdmin(null));
    assert.false(isTransferAdmin({ data: {} }));
  });

  test('import and export follow the tier map for the company admin', function (assert) {
    for (const tier of TRANSFER_TIERS.import) {
      assert.true(canImport(session('company_admin', tier)), `import ${tier}`);
    }
    for (const tier of TRANSFER_TIERS.export) {
      assert.true(canExport(session('company_admin', tier)), `export ${tier}`);
    }
    assert.false(canImport(session('company_admin', 'FREE')));
    assert.false(canExport(session('company_admin', 'FREE')));
    assert.false(canImport(session('company_admin', null)));
    assert.false(canImport(session('manager', 'ENTERPRISE')));
  });
});
