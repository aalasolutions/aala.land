import { module, test } from 'qunit';
import { tagLabel } from 'land/utils/tag-label';

module('Unit | Utility | tag-label', function () {
  test('reads labels from value-keyed options, case-insensitively', function (assert) {
    assert.strictEqual(
      tagLabel('wo', 'PENDING_APPROVAL'),
      'Waiting for Approval',
    );
    assert.strictEqual(tagLabel('priority', 'urgent'), 'Urgent');
    assert.strictEqual(tagLabel('lead', 'WON'), 'Won & Closed');
  });

  test('reads labels from id-keyed options', function (assert) {
    assert.strictEqual(tagLabel('lease', 'DRAFT'), 'Draft');
    assert.strictEqual(tagLabel('lease', 'RENEWED'), 'Renewed');
    assert.strictEqual(
      tagLabel('lease', 'RESIDENTIAL'),
      'Residential (Long-Term)',
    );
  });

  test('contact tags use the contact tag labels', function (assert) {
    assert.strictEqual(
      tagLabel('contact', 'portfolio_owner'),
      'Portfolio Owner',
    );
    assert.strictEqual(tagLabel('contact', 'lead'), 'Lead');
  });

  test('team roles and history actions read their option labels', function (assert) {
    assert.strictEqual(tagLabel('role', 'company_admin'), 'Company Admin');
    assert.strictEqual(tagLabel('role', 'super_admin'), 'Super Admin');
    assert.strictEqual(
      tagLabel('historyAction', 'STATUS_CHANGE'),
      'Status changed',
    );
  });

  test('lead sources, activity types and audit values read their option labels', function (assert) {
    assert.strictEqual(tagLabel('source', 'SOCIAL_MEDIA'), 'Social Media');
    assert.strictEqual(tagLabel('source', 'WALK_IN'), 'Walk-in');
    assert.strictEqual(tagLabel('activity', 'STATUS_CHANGE'), 'Stage changed');
    assert.strictEqual(tagLabel('activity', 'ASSIGNMENT'), 'Assigned');
    assert.strictEqual(tagLabel('audit', 'LOGIN'), 'Signed in');
    assert.strictEqual(tagLabel('audit', 'BULK_UPDATE'), 'Bulk update');
    assert.strictEqual(tagLabel('auditEntity', 'WorkOrder'), 'Work Order');
    assert.strictEqual(tagLabel('auditEntity', 'EmailTemplate'), 'Email Template');
  });

  test('access request statuses read their option labels', function (assert) {
    assert.strictEqual(tagLabel('accessRequest', 'REJECTED'), 'Rejected');
  });

  test('access levels use short table labels, not the form wording', function (assert) {
    assert.strictEqual(tagLabel('access', 'TEAM'), 'Team');
    assert.strictEqual(tagLabel('access', 'ADMIN'), 'Admin');
  });

  test('payment methods read their option labels', function (assert) {
    assert.strictEqual(tagLabel('payment', 'CHEQUE'), 'Cheque');
    assert.strictEqual(
      tagLabel('payment', 'BANK_TRANSFER'),
      'Bank Transfer',
    );
  });

  test('cheque states have no option list and title-case their value', function (assert) {
    assert.strictEqual(tagLabel('chequestate', 'BOUNCED'), 'Bounced');
  });

  test('unknown values and domains fall back to title case', function (assert) {
    assert.strictEqual(tagLabel('sub', 'past_due'), 'Past Due');
    assert.strictEqual(tagLabel('plan', 'ENTERPRISE'), 'Enterprise');
    assert.strictEqual(tagLabel('nope', 'IN_REVIEW'), 'In Review');
    assert.strictEqual(tagLabel('constructor', 'x'), 'X');
  });

  test('null, undefined and empty give an empty string', function (assert) {
    assert.strictEqual(tagLabel('lead', null), '');
    assert.strictEqual(tagLabel('lead', undefined), '');
    assert.strictEqual(tagLabel('lead', ''), '');
  });
});
