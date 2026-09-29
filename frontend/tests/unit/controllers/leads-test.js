import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import {
  DROP_AT_END,
  columnIds,
  insertionIndex,
  moveLead,
} from 'land/controllers/leads';

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

  module('contact access', function () {
    const LIMITED = { id: 'c-9', accessLevel: 'LIMITED', firstName: 'Omar' };

    async function createWith(
      ctx,
      { contact, verifyPhone = '', response = {} },
    ) {
      const controller = makeController(ctx);
      const toasts = [];
      controller.notifications = {
        success: (message) => toasts.push(['success', message]),
        info: (message) => toasts.push(['info', message]),
        error: (message) => toasts.push(['error', message]),
      };
      let captured;
      controller.auth = {
        fetchJson(_path, options) {
          captured = JSON.parse(options.body);
          return response instanceof Error
            ? Promise.reject(response)
            : Promise.resolve(response);
        },
      };
      controller.editLead = null;
      controller.contactSelection.attach(contact);
      controller.contactSelection.setVerifyPhone(verifyPhone);
      await controller.saveLead({ preventDefault() {} });
      return { payload: captured, toasts, controller };
    }

    test('a limited pick sends the typed number beside the contact id', async function (assert) {
      const { payload } = await createWith(this, {
        contact: LIMITED,
        verifyPhone: ' 0501234567 ',
      });
      assert.strictEqual(payload.contactId, 'c-9');
      assert.strictEqual(payload.contactVerifyPhone, '0501234567');
    });

    test('no number, or a full contact, sends no contactVerifyPhone', async function (assert) {
      const skipped = await createWith(this, { contact: LIMITED });
      assert.false('contactVerifyPhone' in skipped.payload);

      const full = await createWith(this, {
        contact: { id: 'c-1', accessLevel: 'FULL' },
        verifyPhone: '0501234567',
      });
      assert.false('contactVerifyPhone' in full.payload);
    });

    test('a pending contact access is announced after the lead is created', async function (assert) {
      const { toasts } = await createWith(this, {
        contact: LIMITED,
        response: { data: { id: 'lead-1', contactAccess: 'PENDING' } },
      });
      assert.deepEqual(toasts, [
        ['success', 'Lead created'],
        ['info', 'Access pending: an approver has been asked'],
      ]);
    });

    test('full access needs no extra toast', async function (assert) {
      const { toasts } = await createWith(this, {
        contact: LIMITED,
        verifyPhone: '0501234567',
        response: { data: { id: 'lead-1', contactAccess: 'FULL' } },
      });
      assert.deepEqual(toasts, [['success', 'Lead created']]);
    });

    test('a CONTACT_EXISTS answer is handed to the picker', async function (assert) {
      const error = new Error('Contact already added');
      error.status = 409;
      error.body = { code: 'CONTACT_EXISTS', contact: LIMITED };
      const { controller } = await createWith(this, {
        contact: { id: 'c-1', accessLevel: 'FULL' },
        response: error,
      });
      assert.strictEqual(controller.contactSelection.conflict, LIMITED);
      assert.strictEqual(controller.errorMsg, 'Contact already added');
    });
  });
  module('drag sort', function () {
    const leads = [
      { id: 'a', status: 'NEW' },
      { id: 'b', status: 'NEW' },
      { id: 'c', status: 'NEW' },
      { id: 'x', status: 'CONTACTED' },
    ];

    test('insertionIndex counts midpoints above the pointer', function (assert) {
      const midpoints = [100, 200, 300];
      assert.strictEqual(insertionIndex(midpoints, 50), 0);
      assert.strictEqual(insertionIndex(midpoints, 150), 1);
      assert.strictEqual(insertionIndex(midpoints, 299), 2);
      assert.strictEqual(insertionIndex(midpoints, 400), 3);
      assert.strictEqual(insertionIndex([], 400), 0);
    });

    test('moveLead reorders within a column before the anchor', function (assert) {
      const next = moveLead(leads, 'c', 'NEW', 'a');
      assert.deepEqual(columnIds(next, 'NEW'), ['c', 'a', 'b']);
      assert.strictEqual(
        next.find((l) => l.id === 'c'),
        leads[2],
      );
    });

    test('moveLead drops at the end of the column', function (assert) {
      const next = moveLead(leads, 'a', 'NEW', DROP_AT_END);
      assert.deepEqual(columnIds(next, 'NEW'), ['b', 'c', 'a']);
    });

    test('moveLead changes status and places at the drop index', function (assert) {
      const next = moveLead(leads, 'x', 'NEW', 'b');
      assert.deepEqual(columnIds(next, 'NEW'), ['a', 'x', 'b', 'c']);
      assert.deepEqual(columnIds(next, 'CONTACTED'), []);
      assert.strictEqual(leads[3].status, 'CONTACTED', 'input is not mutated');
    });

    test('moveLead into an empty column', function (assert) {
      const next = moveLead(leads, 'a', 'WON', DROP_AT_END);
      assert.deepEqual(columnIds(next, 'WON'), ['a']);
    });

    function dropEvent() {
      return { preventDefault() {}, currentTarget: null, clientY: 0 };
    }

    async function drop(ctx, { lead, status, anchor, fail }) {
      const controller = makeController(ctx);
      const calls = [];
      const errors = [];
      controller.model = { data: leads };
      controller.notifications = { success() {}, error: (m) => errors.push(m) };
      controller.dropAnchorFor = () => anchor;
      controller.auth = {
        fetchJson(path, options) {
          calls.push({ path, body: JSON.parse(options.body) });
          if (fail && path === fail) {
            return Promise.reject(new Error('nope'));
          }
          return Promise.resolve({});
        },
      };
      controller.draggedLead = lead;
      await controller.handleDrop(status, dropEvent());
      return { controller, calls, errors };
    }

    test('same-column drop sends the reorder payload only', async function (assert) {
      const { calls } = await drop(this, {
        lead: leads[2],
        status: 'NEW',
        anchor: 'a',
      });
      assert.deepEqual(calls, [
        {
          path: '/leads/reorder',
          body: { status: 'NEW', orderedIds: ['c', 'a', 'b'] },
        },
      ]);
    });

    test('cross-column drop patches status then reorders the target', async function (assert) {
      const { calls } = await drop(this, {
        lead: leads[3],
        status: 'NEW',
        anchor: 'b',
      });
      assert.deepEqual(calls, [
        { path: '/leads/x', body: { status: 'NEW' } },
        {
          path: '/leads/reorder',
          body: { status: 'NEW', orderedIds: ['a', 'x', 'b', 'c'] },
        },
      ]);
    });

    test('drop on its own spot sends nothing', async function (assert) {
      const { calls } = await drop(this, {
        lead: leads[0],
        status: 'NEW',
        anchor: 'b',
      });
      assert.deepEqual(calls, []);
    });

    test('failed reorder rolls back and shows the error', async function (assert) {
      const { controller, errors } = await drop(this, {
        lead: leads[2],
        status: 'NEW',
        anchor: 'a',
        fail: '/leads/reorder',
      });
      assert.deepEqual(errors, ['nope']);
      assert.deepEqual(columnIds(controller.allLeads, 'NEW'), ['a', 'b', 'c']);
    });
  });

  module('filter preference', function () {
    function withPreferences(ctx, stored) {
      const saved = {};
      ctx.owner.register(
        'service:preferences',
        {
          get: (key, fallback) => (key in stored ? stored[key] : fallback),
          set: (key, value) => (saved[key] = value),
        },
        { instantiate: false },
      );
      return saved;
    }

    test('defaults to Assigned to me', function (assert) {
      withPreferences(this, {});
      assert.strictEqual(makeController(this).filterType, 'mine');
    });

    test('restores the saved filter', function (assert) {
      withPreferences(this, { 'leads-filter': 'unassigned' });
      assert.strictEqual(makeController(this).filterType, 'unassigned');
    });

    test('ignores an unknown saved filter', function (assert) {
      withPreferences(this, { 'leads-filter': 'bogus' });
      assert.strictEqual(makeController(this).filterType, 'mine');
    });

    test('setFilter stores the choice', function (assert) {
      const saved = withPreferences(this, {});
      const controller = makeController(this);
      controller.setFilter('all');
      assert.strictEqual(controller.filterType, 'all');
      assert.deepEqual(saved, { 'leads-filter': 'all' });
    });
  });

  module('make-room drag', function () {
    function dragging(ctx, origin) {
      const controller = ctx.owner.lookup('controller:leads');
      controller.draggedLead = { id: 'l2', status: 'NEW' };
      controller.dragOrigin = origin;
      return controller;
    }

    test('no gap until the pointer is over a column', function (assert) {
      const controller = dragging(this, { status: 'NEW', anchor: 'l3' });
      assert.strictEqual(controller.dropGap, null);
    });

    test("no gap over the card's own slot", function (assert) {
      const controller = dragging(this, { status: 'NEW', anchor: 'l3' });
      controller.dropTargetStatus = 'NEW';
      controller.dropBeforeId = 'l3';
      assert.strictEqual(controller.dropGap, null);
    });

    test('a gap opens anywhere else, including another column end', function (assert) {
      const controller = dragging(this, { status: 'NEW', anchor: 'l3' });
      controller.dropTargetStatus = 'NEW';
      controller.dropBeforeId = 'l1';
      assert.deepEqual(controller.dropGap, { status: 'NEW', anchor: 'l1' });
      controller.dropTargetStatus = 'CONTACTED';
      controller.dropBeforeId = 'end';
      assert.deepEqual(controller.dropGap, {
        status: 'CONTACTED',
        anchor: 'end',
      });
    });

    test('the card becomes the empty slot only after the drag image is taken', function (assert) {
      const controller = dragging(this, { status: 'NEW', anchor: 'l3' });
      assert.strictEqual(controller.dragSourceId, null);
      controller._sourceShown = true;
      assert.strictEqual(controller.dragSourceId, 'l2');
      controller.draggedLead = null;
      assert.strictEqual(controller.dragSourceId, null);
    });

    test('hover stays off until the pointer moves', function (assert) {
      const controller = this.owner.lookup('controller:leads');
      controller.suppressHover = true;
      controller.releaseHover();
      assert.false(controller.suppressHover);
    });

    test('dragleave onto a child of the column keeps the target', function (assert) {
      const controller = this.owner.lookup('controller:leads');
      const column = document.createElement('div');
      const card = document.createElement('div');
      column.appendChild(card);
      controller.dropTargetStatus = 'NEW';
      controller.clearDropTarget('dropTargetStatus', {
        currentTarget: column,
        relatedTarget: card,
      });
      assert.strictEqual(controller.dropTargetStatus, 'NEW');
      controller.clearDropTarget('dropTargetStatus', {
        currentTarget: column,
        relatedTarget: document.body,
      });
      assert.strictEqual(controller.dropTargetStatus, null);
    });
  });
});
