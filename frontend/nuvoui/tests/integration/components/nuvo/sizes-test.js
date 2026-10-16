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

module('Integration | Component | nuvo sizes', function (hooks) {
  setupRenderingTest(hooks);

  test('checkbox puts the size modifier on the label and the box', async function (assert) {
    for (const size of SIZES) {
      this.set('size', size);
      await render(hbs`<Nuvo::Checkbox @size={{this.size}} @label="Pool" />`);
      assert.dom('[data-test-nu-checkbox]').hasClass('nu-check-label');
      assert.dom('[data-test-nu-checkbox]').hasClass(`m-${size}`);
      assert.dom('[data-test-nu-checkbox-input]').hasClass(`m-${size}`);
    }
  });

  test('checkbox without @size or with an unknown size adds no modifier', async function (assert) {
    await render(hbs`<Nuvo::Checkbox @label="Pool" />`);
    assertNoSize(assert, '[data-test-nu-checkbox]');
    assertNoSize(assert, '[data-test-nu-checkbox-input]');

    await render(hbs`<Nuvo::Checkbox @size="md" @label="Pool" />`);
    assertNoSize(assert, '[data-test-nu-checkbox-input]');

    await render(hbs`<Nuvo::Checkbox @size="huge" @label="Pool" />`);
    assertNoSize(assert, '[data-test-nu-checkbox-input]');
  });

  test('radio keeps m-radio and adds the size modifier', async function (assert) {
    for (const size of SIZES) {
      this.set('size', size);
      await render(
        hbs`<Nuvo::Radio @size={{this.size}} @name="plan" @value="a" @label="A" />`,
      );
      assert.dom('[data-test-nu-radio]').hasClass(`m-${size}`);
      assert.dom('[data-test-nu-radio-input]').hasClass('m-radio');
      assert.dom('[data-test-nu-radio-input]').hasClass(`m-${size}`);
    }

    await render(hbs`<Nuvo::Radio @name="plan" @value="a" @label="A" />`);
    assertNoSize(assert, '[data-test-nu-radio-input]');
  });

  test('toggle accepts xs, sm and lg', async function (assert) {
    for (const size of SIZES) {
      this.set('size', size);
      await render(hbs`<Nuvo::Toggle @size={{this.size}} aria-label="On" />`);
      assert.dom('[data-test-nu-toggle]').hasClass(`m-${size}`);
    }

    await render(hbs`<Nuvo::Toggle aria-label="On" />`);
    assertNoSize(assert, '[data-test-nu-toggle]');
  });

  test('select accepts xs, sm and lg', async function (assert) {
    for (const size of SIZES) {
      this.set('size', size);
      await render(hbs`<Nuvo::Select @size={{this.size}} @options={{array "A" "B"}} />`);
      assert.dom('[data-test-nu-select]').hasClass(`m-${size}`);
    }

    await render(hbs`<Nuvo::Select @options={{array "A" "B"}} />`);
    assertNoSize(assert, '[data-test-nu-select]');
  });

  test('textarea accepts xs, sm and lg', async function (assert) {
    for (const size of SIZES) {
      this.set('size', size);
      await render(hbs`<Nuvo::Textarea @size={{this.size}} />`);
      assert.dom('[data-test-nu-textarea]').hasClass('nu-textarea');
      assert.dom('[data-test-nu-textarea]').hasClass(`m-${size}`);
    }

    await render(hbs`<Nuvo::Textarea />`);
    assertNoSize(assert, '[data-test-nu-textarea]');
  });

  test('input group accepts xs, sm and lg', async function (assert) {
    for (const size of SIZES) {
      this.set('size', size);
      await render(hbs`
        <Nuvo::InputGroup @size={{this.size}} @prepend="AED">
          <Nuvo::Input @size={{this.size}} />
        </Nuvo::InputGroup>
      `);
      assert.dom('[data-test-nu-input-group]').hasClass('nu-input-group');
      assert.dom('[data-test-nu-input-group]').hasClass(`m-${size}`);
    }

    await render(hbs`<Nuvo::InputGroup @prepend="AED"><Nuvo::Input /></Nuvo::InputGroup>`);
    assertNoSize(assert, '[data-test-nu-input-group]');
  });

  test('tabs put the size modifier on the tab list', async function (assert) {
    this.set('tabs', [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]);
    for (const size of SIZES) {
      this.set('size', size);
      await render(hbs`<Nuvo::Tabs @tabs={{this.tabs}} @size={{this.size}} />`);
      assert.dom('[role="tablist"]').hasClass('nu-tabs');
      assert.dom('[role="tablist"]').hasClass(`m-${size}`);
    }

    await render(hbs`<Nuvo::Tabs @tabs={{this.tabs}} />`);
    assertNoSize(assert, '[role="tablist"]');
  });

  test('pagination accepts @size and keeps @sm as an alias', async function (assert) {
    for (const size of SIZES) {
      this.set('size', size);
      await render(
        hbs`<Nuvo::Pagination @page={{1}} @perPage={{10}} @total={{40}} @size={{this.size}} />`,
      );
      assert.dom('[data-test-nu-pagination]').hasClass(`m-${size}`);
    }

    await render(
      hbs`<Nuvo::Pagination @page={{1}} @perPage={{10}} @total={{40}} @sm={{true}} />`,
    );
    assert.dom('[data-test-nu-pagination]').hasClass('m-sm');

    await render(
      hbs`<Nuvo::Pagination @page={{1}} @perPage={{10}} @total={{40}} @sm={{true}} @size="lg" />`,
    );
    assert.dom('[data-test-nu-pagination]').hasClass('m-lg');
    assert.dom('[data-test-nu-pagination]').doesNotHaveClass('m-sm');

    await render(hbs`<Nuvo::Pagination @page={{1}} @perPage={{10}} @total={{40}} />`);
    assertNoSize(assert, '[data-test-nu-pagination]');
  });

  test('pagination per-page trigger stays sm by default and follows xs and lg', async function (assert) {
    this.set('noop', () => {});
    const expected = { xs: 'm-xs', sm: 'm-sm', lg: 'm-lg' };
    for (const size of SIZES) {
      this.set('size', size);
      await render(
        hbs`<Nuvo::Pagination @page={{1}} @perPage={{10}} @total={{40}} @size={{this.size}} @onPerPageChange={{this.noop}} />`,
      );
      if (expected[size]) {
        assert.dom('[data-test-nu-pagination-select]').hasClass(expected[size]);
      } else {
        assertNoSize(assert, '[data-test-nu-pagination-select]');
      }
    }

    await render(
      hbs`<Nuvo::Pagination @page={{1}} @perPage={{10}} @total={{40}} @onPerPageChange={{this.noop}} />`,
    );
    assert.dom('[data-test-nu-pagination-select]').hasClass('m-sm');
  });
});
