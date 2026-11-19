import { module, test } from 'qunit';
import { activityNotes } from 'land/helpers/activity-notes';

module('Unit | Helper | activity-notes', function () {
  test('stage change notes show stage labels', function (assert) {
    assert.strictEqual(
      activityNotes('STATUS_CHANGE', 'Status changed from CONTACTED to VIEWING'),
      'Status changed from Contacted / Engaged to Viewing Scheduled',
    );
    assert.strictEqual(
      activityNotes(
        'STATUS_CHANGE',
        'Lead converted: status changed from NEGOTIATING to WON',
      ),
      'Lead converted: status changed from Negotiating to Won & Closed',
    );
  });

  test('other activity notes are left as written', function (assert) {
    assert.strictEqual(
      activityNotes('NOTE', 'Moved from NEW to CONTACTED'),
      'Moved from NEW to CONTACTED',
    );
    assert.strictEqual(activityNotes('STATUS_CHANGE', null), null);
  });
});
