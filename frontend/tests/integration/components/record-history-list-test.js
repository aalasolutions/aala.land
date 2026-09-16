import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render, settled, waitFor } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';

module('Integration | Component | record-history-list', function (hooks) {
  setupRenderingTest(hooks);

  function stubAuth(owner, response, calls = []) {
    owner.register(
      'service:auth',
      class extends Service {
        async fetchJson(path) {
          calls.push(path);
          if (response instanceof Error) throw response;
          return response;
        }
      },
    );
    return calls;
  }

  test('it requests history for the record and renders rows', async function (assert) {
    const calls = stubAuth(this.owner, {
      success: true,
      data: {
        data: [
          {
            id: 'h-1',
            action: 'ARCHIVE',
            entityType: 'Unit',
            entityId: 'unit-1',
            entityTitle: 'Unit A-1204',
            contextTitle: 'Marina Tower',
            reason: 'Under renovation',
            actorName: 'Test User',
            createdAt: '2026-09-15T10:00:00.000Z',
          },
          {
            id: 'h-2',
            action: 'UNARCHIVE',
            entityType: 'Unit',
            entityId: 'unit-1',
            entityTitle: 'Unit A-1204',
            contextTitle: null,
            reason: null,
            actorName: 'Ahmed',
            createdAt: '2026-09-16T10:00:00.000Z',
          },
        ],
        total: 2,
        page: 1,
        limit: 10,
      },
    });

    await render(
      hbs`<RecordHistoryList @entityType="Unit" @entityId="unit-1" />`,
    );
    await waitFor('[data-test-record-history-row]');

    assert.strictEqual(calls.length, 1);
    assert.true(calls[0].startsWith('/record-history?'));
    const params = new URLSearchParams(calls[0].split('?')[1]);
    assert.strictEqual(params.get('entityType'), 'Unit');
    assert.strictEqual(params.get('entityId'), 'unit-1');
    assert.strictEqual(params.get('page'), '1');

    assert.dom('[data-test-record-history]').exists();
    assert.dom('[data-test-record-history-row]').exists({ count: 2 });
    assert
      .dom(
        '[data-test-record-history-row="h-1"] [data-test-record-history-action]',
      )
      .hasText('Archived');
    assert
      .dom(
        '[data-test-record-history-row="h-1"] [data-test-record-history-reason]',
      )
      .hasText('Under renovation');
    assert
      .dom(
        '[data-test-record-history-row="h-1"] [data-test-record-history-actor]',
      )
      .hasText('Test User');
    assert
      .dom(
        '[data-test-record-history-row="h-1"] [data-test-record-history-context]',
      )
      .hasText('Marina Tower');
    assert
      .dom(
        '[data-test-record-history-row="h-2"] [data-test-record-history-reason]',
      )
      .hasText('-');
    assert.dom('[data-test-record-history-empty]').doesNotExist();
    assert.dom('[data-test-record-history-pagination]').doesNotExist();
  });

  test('it shows the empty state when there is no history', async function (assert) {
    stubAuth(this.owner, {
      success: true,
      data: { data: [], total: 0, page: 1, limit: 10 },
    });

    await render(
      hbs`<RecordHistoryList @entityType="Lease" @entityId="lease-1" />`,
    );
    await waitFor('[data-test-record-history-empty]');

    assert.dom('[data-test-record-history-empty]').exists();
    assert.dom('[data-test-record-history-row]').doesNotExist();
    assert.dom('[data-test-record-history-loading]').doesNotExist();
  });

  test('it refetches when @reloadKey changes', async function (assert) {
    const calls = stubAuth(this.owner, {
      success: true,
      data: { data: [], total: 0, page: 1, limit: 10 },
    });
    this.set('key', false);

    await render(
      hbs`<RecordHistoryList @entityType="Unit" @entityId="unit-1" @reloadKey={{this.key}} />`,
    );
    await waitFor('[data-test-record-history-empty]');
    assert.strictEqual(calls.length, 1);

    this.set('key', true);
    await settled();
    assert.strictEqual(calls.length, 2);
  });

  test('it stops loading when entityType or entityId is missing', async function (assert) {
    stubAuth(this.owner, {
      success: true,
      data: { data: [], total: 0, page: 1, limit: 10 },
    });

    await render(hbs`<RecordHistoryList @entityType="Unit" />`);

    assert.dom('[data-test-record-history-loading]').doesNotExist();
  });

  test('the loading row has role="status"', async function (assert) {
    let resolveFetch;
    this.owner.register(
      'service:auth',
      class extends Service {
        fetchJson() {
          return new Promise((resolve) => {
            resolveFetch = resolve;
          });
        }
      },
    );

    const renderPromise = render(
      hbs`<RecordHistoryList @entityType="Unit" @entityId="unit-1" />`,
    );
    await waitFor('[data-test-record-history-loading]');

    assert
      .dom('[data-test-record-history-loading]')
      .hasAttribute('role', 'status');

    resolveFetch({ success: true, data: { data: [], total: 0 } });
    await renderPromise;
  });

  test('it refetches when @entityType or @entityId changes', async function (assert) {
    const calls = stubAuth(this.owner, {
      success: true,
      data: { data: [], total: 0, page: 1, limit: 10 },
    });
    this.set('entityType', 'Unit');
    this.set('entityId', 'unit-1');

    await render(
      hbs`<RecordHistoryList @entityType={{this.entityType}} @entityId={{this.entityId}} />`,
    );
    await waitFor('[data-test-record-history-empty]');
    assert.strictEqual(calls.length, 1);

    this.set('entityId', 'unit-2');
    await settled();
    assert.strictEqual(calls.length, 2);

    this.set('entityType', 'Lease');
    await settled();
    assert.strictEqual(calls.length, 3);
  });

  test('it shows a permission message on 403', async function (assert) {
    const error = new Error('Forbidden resource');
    error.status = 403;
    stubAuth(this.owner, error);

    await render(
      hbs`<RecordHistoryList @entityType="Unit" @entityId="unit-1" />`,
    );
    await waitFor('[data-test-record-history-error]');

    assert
      .dom('[data-test-record-history-error]')
      .containsText('You do not have permission to view history.');
  });
});
