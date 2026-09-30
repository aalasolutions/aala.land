import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import {
  DROP_AT_END,
  columnIds,
  insertionIndex,
  moveLead,
  neighbours,
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
      const next = moveLead(leads, 'c', 'status', 'NEW', 'a');
      assert.deepEqual(columnIds(next, 'status', 'NEW'), ['c', 'a', 'b']);
      assert.strictEqual(
        next.find((l) => l.id === 'c'),
        leads[2],
      );
    });

    test('moveLead drops at the end of the column', function (assert) {
      const next = moveLead(leads, 'a', 'status', 'NEW', DROP_AT_END);
      assert.deepEqual(columnIds(next, 'status', 'NEW'), ['b', 'c', 'a']);
    });

    test('moveLead changes status and places at the drop index', function (assert) {
      const next = moveLead(leads, 'x', 'status', 'NEW', 'b');
      assert.deepEqual(columnIds(next, 'status', 'NEW'), ['a', 'x', 'b', 'c']);
      assert.deepEqual(columnIds(next, 'status', 'CONTACTED'), []);
      assert.strictEqual(leads[3].status, 'CONTACTED', 'input is not mutated');
    });

    test('moveLead into an empty column', function (assert) {
      const next = moveLead(leads, 'a', 'status', 'WON', DROP_AT_END);
      assert.deepEqual(columnIds(next, 'status', 'WON'), ['a']);
    });

    function dropEvent() {
      return { preventDefault() {}, currentTarget: null, clientY: 0 };
    }

    async function drop(
      ctx,
      { lead, board = 'pipeline', status: value, anchor, fail },
    ) {
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
      await controller.handleDrop(board, value, dropEvent());
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
          body: { board: 'pipeline', leadId: 'c', belowId: 'a' },
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
          body: { board: 'pipeline', leadId: 'x', aboveId: 'a', belowId: 'b' },
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
      assert.deepEqual(columnIds(controller.allLeads, 'status', 'NEW'), [
        'a',
        'b',
        'c',
      ]);
    });

    test('temperature drop changes temperature then orders that board', async function (assert) {
      const { calls } = await drop(this, {
        lead: { id: 'a', status: 'NEW', temperature: 'WARM' },
        board: 'temperature',
        status: 'HOT',
        anchor: DROP_AT_END,
      });
      assert.deepEqual(calls, [
        { path: '/leads/a', body: { temperature: 'HOT' } },
        {
          path: '/leads/reorder',
          body: { board: 'temperature', leadId: 'a' },
        },
      ]);
    });

    test('agent drop assigns, or unassigns into Unassigned', async function (assert) {
      const assigned = await drop(this, {
        lead: { id: 'a', status: 'NEW', assignedTo: null },
        board: 'agent',
        status: 'agent-1',
        anchor: DROP_AT_END,
      });
      assert.deepEqual(assigned.calls[0], {
        path: '/leads/a/assign',
        body: { agentId: 'agent-1' },
      });
      assert.strictEqual(assigned.calls[1].body.board, 'agent');

      const unassigned = await drop(this, {
        lead: { id: 'a', status: 'NEW', assignedTo: 'agent-1' },
        board: 'agent',
        status: null,
        anchor: DROP_AT_END,
      });
      assert.deepEqual(unassigned.calls[0], {
        path: '/leads/a',
        body: { assignedTo: null },
      });
    });

    test('each board sorts by its own rank', function (assert) {
      const controller = makeController(this);
      controller.model = {
        data: [
          { id: 'a', rank: 'a1', temperatureRank: 'a2' },
          { id: 'b', rank: 'a2', temperatureRank: 'a1' },
        ],
      };
      assert.deepEqual(
        controller.sortedFor('pipeline').map((l) => l.id),
        ['a', 'b'],
      );
      assert.deepEqual(
        controller.sortedFor('temperature').map((l) => l.id),
        ['b', 'a'],
      );
    });
  });

  module('neighbours', function () {
    test('names the leads directly above and below', function (assert) {
      assert.deepEqual(neighbours(['a', 'b', 'c'], 'b'), {
        aboveId: 'a',
        belowId: 'c',
      });
      assert.deepEqual(neighbours(['a', 'b'], 'a'), {
        aboveId: undefined,
        belowId: 'b',
      });
      assert.deepEqual(neighbours(['a', 'b'], 'b'), {
        aboveId: 'a',
        belowId: undefined,
      });
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

  module('agent role', function () {
    function tabIds(controller) {
      return {
        views: controller.viewTabs.map((tab) => tab.id),
        filters: controller.filterTabs.map((tab) => tab.id),
      };
    }

    test('an agent gets no Agent board and no Others filter', function (assert) {
      this.owner.register(
        'service:auth',
        { currentUser: { id: 'u1', role: 'agent' } },
        { instantiate: false },
      );
      assert.deepEqual(tabIds(makeController(this)), {
        views: ['pipeline', 'temperature', 'list'],
        filters: ['all', 'mine', 'unassigned'],
      });
    });

    test('a manager keeps every board and filter', function (assert) {
      this.owner.register(
        'service:auth',
        { currentUser: { id: 'u1', role: 'manager' } },
        { instantiate: false },
      );
      assert.deepEqual(tabIds(makeController(this)), {
        views: ['pipeline', 'temperature', 'agent', 'list'],
        filters: ['all', 'mine', 'others', 'unassigned'],
      });
    });
  });

  module('column collapse', function () {
    function withStore(ctx, auth) {
      const store = {};
      ctx.owner.register(
        'service:preferences',
        {
          get: (key, fallback) =>
            `${auth.currentUser.id}-${key}` in store
              ? store[`${auth.currentUser.id}-${key}`]
              : fallback,
          set: (key, value) => (store[`${auth.currentUser.id}-${key}`] = value),
          remove: (key) => delete store[`${auth.currentUser.id}-${key}`],
        },
        { instantiate: false },
      );
      ctx.owner.register('service:auth', auth, { instantiate: false });
      return store;
    }

    test('toggle persists per board and column, expand removes the key', function (assert) {
      const auth = { currentUser: { id: 'u1' } };
      const store = withStore(this, auth);
      const controller = makeController(this);

      controller.toggleColumn('pipeline', 'WON');
      assert.true(controller.isColumnCollapsed('pipeline', 'WON'));
      assert.false(controller.isColumnCollapsed('temperature', 'WON'));
      assert.deepEqual(store, { 'u1-kanban-pipeline-WON': true });

      controller.toggleColumn('pipeline', 'WON');
      assert.false(controller.isColumnCollapsed('pipeline', 'WON'));
      assert.deepEqual(store, {});
    });

    test('a collapsed column does not leak to another user', function (assert) {
      const auth = { currentUser: { id: 'u1' } };
      withStore(this, auth);
      const controller = makeController(this);

      controller.toggleColumn('agent', 'unassigned');
      auth.currentUser = { id: 'u2' };
      assert.false(controller.isColumnCollapsed('agent', 'unassigned'));
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
      const controller = dragging(this, {
        board: 'pipeline',
        value: 'NEW',
        anchor: 'l3',
      });
      assert.strictEqual(controller.dropGap, null);
    });

    test("no gap over the card's own slot", function (assert) {
      const controller = dragging(this, {
        board: 'pipeline',
        value: 'NEW',
        anchor: 'l3',
      });
      controller.dropTarget = { board: 'pipeline', value: 'NEW' };
      controller.dropBeforeId = 'l3';
      assert.strictEqual(controller.dropGap, null);
    });

    test('a gap opens anywhere else, including another column end', function (assert) {
      const controller = dragging(this, {
        board: 'pipeline',
        value: 'NEW',
        anchor: 'l3',
      });
      controller.dropTarget = { board: 'pipeline', value: 'NEW' };
      controller.dropBeforeId = 'l1';
      assert.deepEqual(controller.dropGap, {
        board: 'pipeline',
        value: 'NEW',
        anchor: 'l1',
      });
      assert.true(controller.isGapAt('pipeline', 'NEW', 'l1'));
      assert.false(controller.isGapAt('temperature', 'NEW', 'l1'));
      controller.dropTarget = { board: 'pipeline', value: 'CONTACTED' };
      controller.dropBeforeId = 'end';
      assert.true(controller.isGapAt('pipeline', 'CONTACTED', 'end'));
    });

    test('the card becomes the empty slot only after the drag image is taken', function (assert) {
      const controller = dragging(this, {
        board: 'pipeline',
        value: 'NEW',
        anchor: 'l3',
      });
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
      controller.dropTarget = { board: 'pipeline', value: 'NEW' };
      controller.clearDropTarget({
        currentTarget: column,
        relatedTarget: card,
      });
      assert.true(controller.isDropTarget('pipeline', 'NEW'));
      controller.clearDropTarget({
        currentTarget: column,
        relatedTarget: document.body,
      });
      assert.strictEqual(controller.dropTarget, null);
    });
  });
});
