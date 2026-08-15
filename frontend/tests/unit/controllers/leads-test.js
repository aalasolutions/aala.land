import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

// The leads save path branches per field:
//   create -> send localityId only when set
//   edit   -> send localityId: null when cleared, omit when unchanged
// These tests pin that contract so the frontend stays in sync with the
// backend Create/Update lead DTOs, which accept localityId.
module('Unit | Controller | leads', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    // The constructor registers a socket listener; stub the service so lookup
    // does not depend on a live socket connection.
    this.owner.register(
      'service:socket',
      { on() {}, off() {} },
      { instantiate: false },
    );
  });

  function makeController(ctx) {
    const controller = ctx.owner.lookup('controller:leads');
    controller.router = { refresh() {} };
    controller.notifications = { success() {}, error() {} };
    return controller;
  }

  async function savePayload(ctx, assigns) {
    const controller = makeController(ctx);
    let captured;
    controller.auth = {
      fetchJson(_path, options) {
        captured = options?.body ? JSON.parse(options.body) : null;
        return Promise.resolve({});
      },
    };
    const { identity, ...rest } = assigns;
    Object.assign(controller, rest);
    // Lead capture attaches a person through the shared ContactSelection, so
    // the create path needs one before it will save.
    for (const [field, value] of Object.entries(identity ?? {})) {
      controller.contactSelection.setField(field, value);
    }
    await controller.saveLead({ preventDefault() {} });
    return captured;
  }

  test('create sends localityId only when set', async function (assert) {
    const payload = await savePayload(this, {
      editLead: null,
      identity: { firstName: 'A' },
      formLocalityId: 'loc-1',
    });
    assert.strictEqual(payload.localityId, 'loc-1');
  });

  test('create omits localityId when empty', async function (assert) {
    const payload = await savePayload(this, {
      editLead: null,
      identity: { firstName: 'A' },
      formLocalityId: '',
    });
    assert.false('localityId' in payload);
  });

  test('edit sends localityId: null when cleared', async function (assert) {
    const payload = await savePayload(this, {
      editLead: { locality: { id: 'loc-1' } },
      identity: { firstName: 'A' },
      formLocalityId: '',
    });
    assert.strictEqual(payload.localityId, null);
  });

  test('edit omits localityId when unchanged', async function (assert) {
    const payload = await savePayload(this, {
      editLead: { locality: { id: 'loc-1' } },
      identity: { firstName: 'A' },
      formLocalityId: 'loc-1',
    });
    assert.false('localityId' in payload);
  });
});
