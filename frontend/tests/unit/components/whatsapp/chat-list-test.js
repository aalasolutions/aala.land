import { module, test } from 'qunit';
import { escalationLabel } from 'land/components/whatsapp/chat-list';

module('Unit | Component | whatsapp/chat-list | escalationLabel', function () {
  test('labels every escalation reason the backend stores', function (assert) {
    assert.strictEqual(escalationLabel('request'), 'Asked for a person');
    assert.strictEqual(escalationLabel('safety'), 'Safety concern');
    assert.strictEqual(
      escalationLabel('payment'),
      'Payment or deposit question',
    );
    assert.strictEqual(escalationLabel('complaint'), 'Complaint');
    assert.strictEqual(escalationLabel('opt_out'), 'Asked to stop messages');
    assert.strictEqual(escalationLabel('other'), 'Needs the team');
  });

  test('falls back to the default label for an unknown or missing reason', function (assert) {
    assert.strictEqual(escalationLabel('account'), 'Needs the team');
    assert.strictEqual(escalationLabel('toString'), 'Needs the team');
    assert.strictEqual(escalationLabel(null), 'Needs the team');
    assert.strictEqual(escalationLabel(undefined), 'Needs the team');
  });
});
