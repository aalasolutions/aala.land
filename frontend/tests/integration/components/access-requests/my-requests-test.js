import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render, waitFor } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { httpError, stubAuth } from 'land/tests/helpers/stub-auth';

const APPROVED_FOREVER = {
  id: 'r-1',
  kind: 'REQUEST',
  status: 'APPROVED',
  contact: { id: 'c-1', displayName: 'Omar Haddad', regionCode: 'SHJ' },
  requester: { id: 'user-1', name: 'Test User' },
  decidedBy: { id: 'user-2', name: 'Region Manager' },
  regionCode: 'SHJ',
  sourceType: 'lead',
  sourceId: 'lead-1',
  note: 'Client called twice',
  decidedAt: '2026-09-20T10:00:00.000Z',
  expiresAt: null,
  createdAt: '2026-09-19T10:00:00.000Z',
};

const PENDING = {
  ...APPROVED_FOREVER,
  id: 'r-2',
  status: 'PENDING',
  contact: { id: 'c-2', displayName: 'Sara Khan', regionCode: 'DXB' },
  decidedBy: null,
  decidedAt: null,
  note: null,
};

module(
  'Integration | Component | access-requests/my-requests',
  function (hooks) {
    setupRenderingTest(hooks);

    test('lists the caller own requests with status, decider and expiry', async function (assert) {
      const calls = stubAuth(this.owner, {
        respond: () => ({
          data: {
            data: [APPROVED_FOREVER, PENDING],
            total: 2,
            page: 1,
            limit: 20,
          },
        }),
      });
      await render(hbs`<AccessRequests::MyRequests />`);
      await waitFor('[data-test-my-requests-table]');

      assert.strictEqual(
        calls[0].path,
        '/contact-access-requests?mine=true&page=1&limit=20',
      );
      const approved = '[data-test-data-table-row="r-1"]';
      const pending = '[data-test-data-table-row="r-2"]';
      assert
        .dom(`${approved} [data-test-my-request-contact]`)
        .hasText('Omar Haddad');
      assert
        .dom(`${approved} [data-test-my-request-status="APPROVED"]`)
        .hasText('Approved');
      assert.dom(approved).containsText('Region Manager');
      assert.dom(`${approved} [data-test-my-request-expires]`).hasText('Never');
      assert.dom(approved).containsText('Client called twice');
      assert
        .dom(`${pending} [data-test-my-request-status="PENDING"]`)
        .hasText('Pending');
      assert.dom(`${pending} [data-test-my-request-expires]`).hasText('-');
    });

    test('says so when there are no requests', async function (assert) {
      stubAuth(this.owner, {
        respond: () => ({ data: { data: [], total: 0, page: 1, limit: 20 } }),
      });
      await render(hbs`<AccessRequests::MyRequests />`);
      await waitFor('[data-test-my-requests-empty]');

      assert.dom('[data-test-my-requests-empty]').exists();
      assert.dom('[data-test-my-requests-table]').doesNotExist();
    });

    test('a failed load shows the error', async function (assert) {
      stubAuth(this.owner, {
        respond: () => httpError(500, { message: 'Server error' }),
      });
      await render(hbs`<AccessRequests::MyRequests />`);
      await waitFor('[data-test-my-requests-error]');

      assert.dom('[data-test-my-requests-error]').hasText('Server error');
    });
  },
);
