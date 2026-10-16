import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click, render, triggerEvent } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | filters-button', function (hooks) {
  setupRenderingTest(hooks);

  test('shows no count when nothing is active', async function (assert) {
    await render(hbs`<FiltersButton @count={{0}}>fields</FiltersButton>`);

    assert.dom('[data-test-filters-button]').includesText('Filters');
    assert.dom('[data-test-filters-count]').doesNotExist();
    assert
      .dom('[data-test-filters-button]')
      .hasAttribute('aria-expanded', 'false');
  });

  test('shows how many filters are active', async function (assert) {
    await render(hbs`<FiltersButton @count={{3}}>fields</FiltersButton>`);

    assert.dom('[data-test-filters-count]').hasText('3');
  });

  test('opens the fields in a drawer and closes it again', async function (assert) {
    await render(
      hbs`<FiltersButton @count={{1}}><input data-test-sample-field /></FiltersButton>`,
    );

    assert.dom('[data-test-sample-field]').doesNotExist();

    await click('[data-test-filters-button]');

    assert.dom('[data-test-nu-drawer-title]').hasText('Filters');
    assert.dom('[data-test-filters-drawer] [data-test-sample-field]').exists();
    assert
      .dom('[data-test-filters-button]')
      .hasAttribute('aria-expanded', 'true');

    await click('[data-test-nu-drawer-close]');

    assert
      .dom('[data-test-filters-button]')
      .hasAttribute('aria-expanded', 'false');
  });

  test('keeps focus in the drawer when a button inside disables itself', async function (assert) {
    this.set('active', true);
    this.clear = () => this.set('active', false);
    await render(
      hbs`<FiltersButton @count={{1}}><button type="button" disabled={{not this.active}} {{on "click" this.clear}} data-test-sample-clear>Clear</button></FiltersButton>`,
    );

    await click('[data-test-filters-button]');
    await click('[data-test-sample-clear]');

    assert.dom('[data-test-sample-clear]').isDisabled();
    assert.dom('[data-test-nu-drawer-close]').isFocused();
  });

  test('leaves focus alone on a click in empty drawer space', async function (assert) {
    await render(
      hbs`<FiltersButton @count={{1}}><p data-test-sample-text>Text</p></FiltersButton>`,
    );

    await click('[data-test-filters-button]');
    document.activeElement.blur();
    await triggerEvent('[data-test-sample-text]', 'click');

    assert.dom('[data-test-nu-drawer-close]').isNotFocused();
  });
});
