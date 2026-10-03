import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';
import { addCalendarDays, todayInZone } from 'land/utils/local-date';

module('Integration | Component | due-label', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register(
      'service:region',
      class extends Service {
        activeRegion = { timezone: 'UTC' };
      },
    );
  });

  test('it joins the computed word to the stored label untouched', async function (assert) {
    this.dueDate = addCalendarDays(todayInZone('UTC'), -3);

    await render(
      hbs`<DueLabel @label="rent for Unit 4b" @dueDate={{this.dueDate}} />`,
    );

    assert.dom('[data-test-due-label]').hasText('Overdue · rent for Unit 4b');
  });

  test('it renders only the label when there is no date', async function (assert) {
    await render(hbs`<DueLabel @label="Rent" @dueDate={{null}} />`);

    assert.dom('[data-test-due-label]').hasText('Rent');
  });

  test('a word passed in is used as given', async function (assert) {
    await render(hbs`<DueLabel @label="Rent" @word="Upcoming" />`);

    assert.dom('[data-test-due-label]').hasText('Upcoming · Rent');
  });
});
