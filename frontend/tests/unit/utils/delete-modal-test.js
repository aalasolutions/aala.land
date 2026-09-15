import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import { confirmDeleteModal } from 'land/utils/delete-modal';

function fakeController({ fail } = {}) {
  const calls = { fetch: [], success: [], error: [], refresh: [] };
  return {
    calls,
    item: { id: 'abc' },
    showDeleteModal: true,
    isDeleting: false,
    auth: {
      async fetchJson(path, options) {
        calls.fetch.push({ path, options });
        if (fail) {
          const err = new Error(fail);
          err.status = 409;
          throw err;
        }
        return null;
      },
    },
    notifications: {
      success: (m) => calls.success.push(m),
      error: (m) => calls.error.push(m),
    },
    router: { refresh: (r) => calls.refresh.push(r) },
  };
}

const base = {
  itemKey: 'item',
  resourcePath: '/things',
  successMessage: 'Deleted',
  refreshRoute: 'things',
};

module('Unit | Utility | delete-modal', function (hooks) {
  setupTest(hooks);

  test('defaults to DELETE with no body', async function (assert) {
    const c = fakeController();
    await confirmDeleteModal(c, base);

    assert.deepEqual(c.calls.fetch, [
      { path: '/things/abc', options: { method: 'DELETE' } },
    ]);
    assert.deepEqual(c.calls.success, ['Deleted']);
    assert.false(c.showDeleteModal);
    assert.strictEqual(c.item, null);
    assert.deepEqual(c.calls.refresh, ['things']);
    assert.false(c.isDeleting);
  });

  test('with body posts to {path}/{id}/delete', async function (assert) {
    const c = fakeController();
    await confirmDeleteModal(c, {
      ...base,
      body: { reason: 'Duplicate', transferToContactId: 'x' },
    });

    assert.strictEqual(c.calls.fetch[0].path, '/things/abc/delete');
    assert.strictEqual(c.calls.fetch[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(c.calls.fetch[0].options.body), {
      reason: 'Duplicate',
      transferToContactId: 'x',
    });
  });

  test('failure toasts the backend message and keeps the modal open', async function (assert) {
    const c = fakeController({ fail: 'Archive it instead.' });
    await confirmDeleteModal(c, { ...base, body: { reason: 'r' } });

    assert.deepEqual(c.calls.error, ['Archive it instead.']);
    assert.true(c.showDeleteModal);
    assert.deepEqual(c.item, { id: 'abc' });
    assert.deepEqual(c.calls.refresh, []);
    assert.false(c.isDeleting);
  });

  test('does nothing while a delete is in flight', async function (assert) {
    const c = fakeController();
    c.isDeleting = true;
    await confirmDeleteModal(c, base);

    assert.deepEqual(c.calls.fetch, []);
  });
});
