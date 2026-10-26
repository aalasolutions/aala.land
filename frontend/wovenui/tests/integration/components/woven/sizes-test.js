import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

const SIZES = ['xs', 'sm', 'lg'];
const ALL_MODIFIERS = ['m-xs', 'm-sm', 'm-md', 'm-lg'];

function assertNoSize(assert, selector) {
  for (const modifier of ALL_MODIFIERS) {
    assert.dom(selector).doesNotHaveClass(modifier);
  }
}

module('Integration | Component | woven sizes', function (hooks) {
  setupRenderingTest(hooks);

  test('checkbox puts the size modifier on the label and the box', async function (assert) {
    for (const size of SIZES) {
      this.set('size', size);
      await render(hbs`<Woven::Checkbox @size={{this.size}} @label="Pool" />`);
      assert.dom('[data-test-wu-checkbox]').hasClass('wu-check-label');
      assert.dom('[data-test-wu-checkbox]').hasClass(`m-${size}`);
      assert.dom('[data-test-wu-checkbox-input]').hasClass(`m-${size}`);
    }
  });

  test('checkbox without @size or with an unknown size adds no modifier', async function (assert) {
    await render(hbs`<Woven::Checkbox @label="Pool" />`);
    assertNoSize(assert, '[data-test-wu-checkbox]');
    assertNoSize(assert, '[data-test-wu-checkbox-input]');

    await render(hbs`<Woven::Checkbox @size="md" @label="Pool" />`);
    assertNoSize(assert, '[data-test-wu-checkbox-input]');

    await render(hbs`<Woven::Checkbox @size="huge" @label="Pool" />`);
    assertNoSize(assert, '[data-test-wu-checkbox-input]');
  });

  test('radio keeps m-radio and adds the size modifier', async function (assert) {
    for (const size of SIZES) {
      this.set('size', size);
      await render(
        hbs`<Woven::Radio @size={{this.size}} @name="plan" @value="a" @label="A" />`,
      );
      assert.dom('[data-test-wu-radio]').hasClass(`m-${size}`);
      assert.dom('[data-test-wu-radio-input]').hasClass('m-radio');
      assert.dom('[data-test-wu-radio-input]').hasClass(`m-${size}`);
    }

    await render(hbs`<Woven::Radio @name="plan" @value="a" @label="A" />`);
    assertNoSize(assert, '[data-test-wu-radio-input]');
  });

  test('toggle accepts xs, sm and lg', async function (assert) {
    for (const size of SIZES) {
      this.set('size', size);
      await render(hbs`<Woven::Toggle @size={{this.size}} aria-label="On" />`);
      assert.dom('[data-test-wu-toggle]').hasClass(`m-${size}`);
    }

    await render(hbs`<Woven::Toggle aria-label="On" />`);
    assertNoSize(assert, '[data-test-wu-toggle]');
  });

  test('select accepts xs, sm and lg', async function (assert) {
    for (const size of SIZES) {
      this.set('size', size);
      await render(hbs`<Woven::Select @size={{this.size}} @options={{array "A" "B"}} />`);
      assert.dom('[data-test-wu-select]').hasClass(`m-${size}`);
    }

    await render(hbs`<Woven::Select @options={{array "A" "B"}} />`);
    assertNoSize(assert, '[data-test-wu-select]');
  });

  test('textarea accepts xs, sm and lg', async function (assert) {
    for (const size of SIZES) {
      this.set('size', size);
      await render(hbs`<Woven::Textarea @size={{this.size}} />`);
      assert.dom('[data-test-wu-textarea]').hasClass('wu-textarea');
      assert.dom('[data-test-wu-textarea]').hasClass(`m-${size}`);
    }

    await render(hbs`<Woven::Textarea />`);
    assertNoSize(assert, '[data-test-wu-textarea]');
  });

  test('input group accepts xs, sm and lg', async function (assert) {
    for (const size of SIZES) {
      this.set('size', size);
      await render(hbs`
        <Woven::InputGroup @size={{this.size}} @prepend="AED">
          <Woven::Input @size={{this.size}} />
        </Woven::InputGroup>
      `);
      assert.dom('[data-test-wu-input-group]').hasClass('wu-input-group');
      assert.dom('[data-test-wu-input-group]').hasClass(`m-${size}`);
    }

    await render(hbs`<Woven::InputGroup @prepend="AED"><Woven::Input /></Woven::InputGroup>`);
    assertNoSize(assert, '[data-test-wu-input-group]');
  });

  test('tabs put the size modifier on the tab list', async function (assert) {
    this.set('tabs', [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]);
    for (const size of SIZES) {
      this.set('size', size);
      await render(hbs`<Woven::Tabs @tabs={{this.tabs}} @size={{this.size}} />`);
      assert.dom('[role="tablist"]').hasClass('wu-tabs');
      assert.dom('[role="tablist"]').hasClass(`m-${size}`);
    }

    await render(hbs`<Woven::Tabs @tabs={{this.tabs}} />`);
    assertNoSize(assert, '[role="tablist"]');
  });

  test('pagination accepts @size and keeps @sm as an alias', async function (assert) {
    for (const size of SIZES) {
      this.set('size', size);
      await render(
        hbs`<Woven::Pagination @page={{1}} @perPage={{10}} @total={{40}} @size={{this.size}} />`,
      );
      assert.dom('[data-test-wu-pagination]').hasClass(`m-${size}`);
    }

    await render(
      hbs`<Woven::Pagination @page={{1}} @perPage={{10}} @total={{40}} @sm={{true}} />`,
    );
    assert.dom('[data-test-wu-pagination]').hasClass('m-sm');

    await render(
      hbs`<Woven::Pagination @page={{1}} @perPage={{10}} @total={{40}} @sm={{true}} @size="lg" />`,
    );
    assert.dom('[data-test-wu-pagination]').hasClass('m-lg');
    assert.dom('[data-test-wu-pagination]').doesNotHaveClass('m-sm');

    await render(hbs`<Woven::Pagination @page={{1}} @perPage={{10}} @total={{40}} />`);
    assertNoSize(assert, '[data-test-wu-pagination]');
  });

  test('pagination per-page trigger stays sm by default and follows xs and lg', async function (assert) {
    this.set('noop', () => {});
    const expected = { xs: 'm-xs', sm: 'm-sm', lg: 'm-lg' };
    for (const size of SIZES) {
      this.set('size', size);
      await render(
        hbs`<Woven::Pagination @page={{1}} @perPage={{10}} @total={{40}} @size={{this.size}} @onPerPageChange={{this.noop}} />`,
      );
      if (expected[size]) {
        assert.dom('[data-test-wu-pagination-select]').hasClass(expected[size]);
      } else {
        assertNoSize(assert, '[data-test-wu-pagination-select]');
      }
    }

    await render(
      hbs`<Woven::Pagination @page={{1}} @perPage={{10}} @total={{40}} @onPerPageChange={{this.noop}} />`,
    );
    assert.dom('[data-test-wu-pagination-select]').hasClass('m-sm');
  });
});
