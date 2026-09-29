import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

// Every unit form that attaches an owner sends the unlock number the same way.
module('Unit | Controller | properties owner verify phone', function (hooks) {
  setupTest(hooks);

  const LIMITED = { id: 'owner-9', accessLevel: 'LIMITED', firstName: 'Omar' };

  function prepare(ctx, name) {
    const controller = ctx.owner.lookup(`controller:${name}`);
    const sent = [];
    controller.auth = {
      fetchJson(path, options) {
        sent.push({ path, body: JSON.parse(options.body) });
        return Promise.resolve({});
      },
    };
    controller.notifications = { success() {}, error() {} };
    controller.router = { refresh() {} };
    controller.ownerSelection.attach(LIMITED);
    controller.ownerSelection.setVerifyPhone('0501234567');
    return { controller, sent };
  }

  test('new unit from the properties list', async function (assert) {
    const { controller, sent } = prepare(this, 'properties/index');
    controller.selectedAsset = { id: 'asset-1' };
    controller.newUnitNumber = '101';

    await controller.saveNewUnit({ preventDefault() {} });

    assert.strictEqual(sent[0].body.ownerId, 'owner-9');
    assert.strictEqual(sent[0].body.ownerVerifyPhone, '0501234567');
  });

  test('unit drawer on the asset page', async function (assert) {
    const { controller, sent } = prepare(this, 'properties/detail');
    controller.activeAssetId = 'asset-1';
    controller.formUnitNumber = '102';

    await controller.saveUnit({ preventDefault() {} });

    assert.strictEqual(sent[0].body.ownerId, 'owner-9');
    assert.strictEqual(sent[0].body.ownerVerifyPhone, '0501234567');
  });

  test('edit on the unit page, and a full owner sends no number', async function (assert) {
    const { controller, sent } = prepare(this, 'properties/unit');
    controller.model = { unit: { id: 'unit-1' } };

    await controller.save({ preventDefault() {} });
    assert.strictEqual(sent[0].body.ownerVerifyPhone, '0501234567');

    controller.ownerSelection.attach({ id: 'owner-1', accessLevel: 'FULL' });
    controller.ownerSelection.setVerifyPhone('0501234567');
    await controller.save({ preventDefault() {} });
    assert.false('ownerVerifyPhone' in sent[1].body);
  });
});
