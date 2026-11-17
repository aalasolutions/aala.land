import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click, render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | shell nav', function (hooks) {
  setupRenderingTest(hooks);

  test('a nav link marks the current page and yields extras after the label', async function (assert) {
    this.current = true;
    await render(hbs`
      <ul>
        <Shell::NavLink @route="leads" @icon="kanban" @label="Lead Pipeline" @current={{this.current}} data-test-nav-leads>
          <span data-test-extra>3</span>
        </Shell::NavLink>
      </ul>
    `);

    assert
      .dom('[data-test-nav-leads]')
      .hasClass('wu-sidebar-link')
      .hasAttribute('aria-current', 'page');
    assert
      .dom('[data-test-nav-leads] .wu-sidebar-label')
      .hasText('Lead Pipeline');
    assert
      .dom('[data-test-nav-leads] .wu-sidebar-label + [data-test-extra]')
      .exists();
  });

  test('a nav link that is not current has no aria-current', async function (assert) {
    await render(hbs`
      <ul><Shell::NavLink @route="leads" @icon="kanban" @label="Leads" @current={{false}} data-test-nav-leads /></ul>
    `);

    assert.dom('[data-test-nav-leads]').doesNotHaveAttribute('aria-current');
  });

  test('a nav group is a kit details whose open state the caller owns', async function (assert) {
    this.open = false;
    this.toggles = 0;
    this.toggle = (event) => {
      event.preventDefault();
      this.toggles++;
      this.set('open', !this.open);
    };
    await render(hbs`
      <ul>
        <Shell::NavGroup @group="crm" @icon="address-book" @label="People" @open={{this.open}} @onToggle={{this.toggle}}>
          <li data-test-child>Contacts</li>
        </Shell::NavGroup>
      </ul>
    `);

    assert
      .dom(
        'details.wu-sidebar-group > summary.wu-sidebar-toggle[data-test-nav-group-toggle="crm"]',
      )
      .exists();
    assert.dom('details.wu-sidebar-group > .wu-sidebar-list').exists();
    assert.dom('details.wu-sidebar-group').doesNotHaveAttribute('open');
    assert.dom('.app-shell__flyout-title').hasText('People');

    await click('[data-test-nav-group-toggle="crm"]');

    assert.strictEqual(this.toggles, 1);
    assert.dom('details.wu-sidebar-group').hasAttribute('open');
    assert.dom('[data-test-child]').exists();

    await click('[data-test-nav-group-toggle="crm"]');

    assert.strictEqual(this.toggles, 2);
    assert.dom('details.wu-sidebar-group').doesNotHaveAttribute('open');
  });

  test('a nav group stays closed when the caller cancels the summary click and keeps @open false', async function (assert) {
    this.toggles = 0;
    this.toggle = (event) => {
      event.preventDefault();
      this.toggles++;
    };
    await render(hbs`
      <ul>
        <Shell::NavGroup @group="crm" @icon="address-book" @label="People" @open={{false}} @onToggle={{this.toggle}}>
          <li>Contacts</li>
        </Shell::NavGroup>
      </ul>
    `);

    await click('[data-test-nav-group-toggle="crm"]');

    assert.strictEqual(this.toggles, 1);
    assert.dom('details.wu-sidebar-group').doesNotHaveAttribute('open');
  });
});
