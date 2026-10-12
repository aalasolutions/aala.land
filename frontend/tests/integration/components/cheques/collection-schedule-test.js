import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { addCalendarDays, todayInZone } from 'land/utils/local-date';

function dayOffset(days) {
  return addCalendarDays(todayInZone('Asia/Dubai'), days);
}

function cheque(id, amount, currency, days) {
  return {
    id,
    chequeNumber: id,
    bankName: 'Test Bank',
    accountHolder: 'Test User',
    amount,
    currency,
    dueDate: dayOffset(days),
  };
}

module(
  'Integration | Component | cheques/collection-schedule',
  function (hooks) {
    setupRenderingTest(hooks);

    hooks.beforeEach(function () {
      this.owner.lookup('service:region').activeRegion = {
        code: 'dxb',
        currency: 'AED',
        timezone: 'Asia/Dubai',
      };
    });

    test('groups total per currency and say how late or soon each cheque is in region time', async function (assert) {
      this.groups = [
        {
          period: 'Overdue',
          cheques: [
            cheque('c-1', '500.00', 'AED', -3),
            cheque('c-2', '200.00', 'SAR', -1),
          ],
        },
        {
          period: 'This Week',
          cheques: [
            cheque('c-3', '300.00', 'AED', 0),
            cheque('c-4', '100.00', 'AED', 2),
          ],
        },
      ];
      await render(
        hbs`<Cheques::CollectionSchedule @groups={{this.groups}} />`,
      );

      assert.dom('[data-test-schedule-row]').exists({ count: 4 });
      assert.dom('[data-test-schedule-group="Overdue"]').hasClass('is-overdue');
      const total = this.element
        .querySelector(
          '[data-test-schedule-group="Overdue"] [data-test-schedule-total]',
        )
        .textContent.replace(/\s+/g, ' ');
      assert.true(/AED/.test(total), 'AED total');
      assert.true(/SAR/.test(total), 'SAR total');

      const when = [
        ...this.element.querySelectorAll('[data-test-schedule-when]'),
      ].map((el) => el.textContent.trim());
      assert.deepEqual(when, [
        '3 days overdue',
        '1 day overdue',
        'due today',
        'due in 2 days',
      ]);
    });

    test('no groups shows the empty state', async function (assert) {
      this.groups = [];
      await render(
        hbs`<Cheques::CollectionSchedule @groups={{this.groups}} />`,
      );

      assert.dom('[data-test-schedule-row]').doesNotExist();
      assert.dom(this.element).includesText('No upcoming cheques');
    });
  },
);
