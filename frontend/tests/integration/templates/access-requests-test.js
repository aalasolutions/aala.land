import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click, fillIn } from '@ember/test-helpers';
import template from 'land/templates/access-requests';
import { renderRouteTemplate } from 'land/tests/helpers/render-route-template';
import { stubAuth, stubNotifications } from 'land/tests/helpers/stub-auth';

const PENDING = {
  id: 'r-1',
  kind: 'REQUEST',
  status: 'PENDING',
  contact: { id: 'c-1', displayName: 'Omar Haddad', regionCode: 'SHJ' },
  requester: { id: 'user-1', name: 'Test User' },
  decidedBy: null,
  regionCode: 'SHJ',
  sourceType: 'lead',
  sourceId: 'lead-1',
  note: 'Client called twice',
  decidedAt: null,
  expiresAt: null,
  createdAt: '2026-09-19T10:00:00.000Z',
};

const APPROVED = {
  ...PENDING,
  id: 'r-2',
  status: 'APPROVED',
  decidedBy: { id: 'user-2', name: 'Region Manager' },
  decidedAt: '2026-09-20T10:00:00.000Z',
  expiresAt: '2026-12-19T10:00:00.000Z',
};

module('Integration | Template | access-requests', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(async function () {
    this.toasts = stubNotifications(this.owner);
    this.calls = stubAuth(this.owner, { role: 'manager', respond: () => ({}) });
    const controller = this.owner.lookup('controller:access-requests');
    this.refreshed = [];
    controller.router = { refresh: (name) => this.refreshed.push(name) };
    await renderRouteTemplate(this, template, {
      name: 'access-requests',
      controller,
      model: { requests: [PENDING, APPROVED], total: 2, error: '' },
    });
  });

  const pendingRow = '[data-test-data-table-row="r-1"]';
  const approvedRow = '[data-test-data-table-row="r-2"]';

  test('rows show requester, contact, region, source, note and the right actions', async function (assert) {
    assert
      .dom(`${pendingRow} [data-test-access-request-row]`)
      .hasText('Test User');
    assert
      .dom(`${pendingRow} [data-test-access-request-contact]`)
      .hasText('Omar Haddad');
    assert.dom(pendingRow).containsText('SHJ');
    assert.dom(pendingRow).containsText('Lead');
    assert.dom(pendingRow).containsText('Client called twice');
    assert.dom(`${pendingRow} [data-test-approve-access]`).exists();
    assert.dom(`${pendingRow} [data-test-reject-access]`).exists();
    assert.dom(`${pendingRow} [data-test-revoke-access]`).doesNotExist();

    assert.dom(approvedRow).containsText('Region Manager');
    assert.dom(`${approvedRow} [data-test-revoke-access]`).exists();
    assert.dom(`${approvedRow} [data-test-approve-access]`).doesNotExist();
  });

  test('approving with Forever sends forever', async function (assert) {
    await click(`${pendingRow} [data-test-approve-access]`);
    assert.dom('[data-test-approve-modal]').exists();

    await click('[data-test-expiry-choice="forever"] input');
    await click('[data-test-approve-confirm]');

    assert.deepEqual(this.calls, [
      {
        path: '/contact-access-requests/r-1/approve',
        method: 'POST',
        body: { forever: true },
      },
    ]);
    assert.deepEqual(this.refreshed, ['access-requests']);
    assert.strictEqual(this.toasts[0].type, 'success');
    assert.dom('[data-test-approve-modal]').doesNotExist();
  });

  test('approving with the default sends an empty body for 90 days', async function (assert) {
    await click(`${pendingRow} [data-test-approve-access]`);
    await click('[data-test-approve-confirm]');

    assert.deepEqual(this.calls[0].body, {});
  });

  test('a custom date is required and sent as the end of that day', async function (assert) {
    await click(`${pendingRow} [data-test-approve-access]`);
    await click('[data-test-expiry-choice="date"] input');
    await click('[data-test-approve-confirm]');

    assert.strictEqual(this.calls.length, 0, 'nothing is sent without a date');
    assert.dom('[data-test-approve-error]').exists();

    await fillIn('[data-test-expiry-date]', '2027-01-31');
    await click('[data-test-approve-confirm]');

    const expiresAt = new Date(this.calls[0].body.expiresAt);
    assert.strictEqual(expiresAt.getFullYear(), 2027);
    assert.strictEqual(expiresAt.getMonth(), 0);
    assert.strictEqual(expiresAt.getDate(), 31);
    assert.strictEqual(
      expiresAt.getHours(),
      23,
      'the grant runs to the end of the local day',
    );
  });

  test('rejecting needs a reason and sends it', async function (assert) {
    await click(`${pendingRow} [data-test-reject-access]`);
    await click('[data-test-confirm-modal-confirm]');

    assert.strictEqual(this.calls.length, 0, 'no reason, no request');
    assert.dom('[data-test-nu-field-error]').hasText('Reason is required.');

    await fillIn('[data-test-decision-reason]', '  Not their client ');
    await click('[data-test-confirm-modal-confirm]');

    assert.deepEqual(this.calls, [
      {
        path: '/contact-access-requests/r-1/reject',
        method: 'POST',
        body: { reason: 'Not their client' },
      },
    ]);
    assert.deepEqual(this.refreshed, ['access-requests']);
  });

  test('revoking an approved grant sends the reason to revoke', async function (assert) {
    await click(`${approvedRow} [data-test-revoke-access]`);
    await fillIn('[data-test-decision-reason]', 'Lead closed');
    await click('[data-test-confirm-modal-confirm]');

    assert.deepEqual(this.calls, [
      {
        path: '/contact-access-requests/r-2/revoke',
        method: 'POST',
        body: { reason: 'Lead closed' },
      },
    ]);
  });
});
