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

const KIT_SIZES = { xs: 'sm', sm: 'sm', lg: 'lg' };

function assertNoKitSize(assert, selector) {
  for (const size of ['sm', 'lg', ...ALL_MODIFIERS]) {
    assert.dom(selector).doesNotHaveClass(size);
  }
}

module('Integration | Component | woven sizes', function (hooks) {
  setupRenderingTest(hooks);

  test('checkbox puts the kit size on the wu-checkbox root', async function (assert) {
    for (const size of SIZES) {
      this.set('size', size);
      await render(hbs`<Woven::Checkbox @size={{this.size}} @label="Pool" />`);
      assert.dom('[data-test-wu-checkbox]').hasClass('wu-checkbox');
      assert.dom('[data-test-wu-checkbox]').hasClass(KIT_SIZES[size]);
      assert.dom('[data-test-wu-checkbox-input]').hasClass('wu-checkbox-input');
    }
  });

  test('checkbox without @size or with an unknown size adds no size class', async function (assert) {
    await render(hbs`<Woven::Checkbox @label="Pool" />`);
    assertNoKitSize(assert, '[data-test-wu-checkbox]');

    await render(hbs`<Woven::Checkbox @size="md" @label="Pool" />`);
    assertNoKitSize(assert, '[data-test-wu-checkbox]');

    await render(hbs`<Woven::Checkbox @size="huge" @label="Pool" />`);
    assertNoKitSize(assert, '[data-test-wu-checkbox]');
  });

  test('radio puts the kit size on the wu-radio root', async function (assert) {
    for (const size of SIZES) {
      this.set('size', size);
      await render(
        hbs`<Woven::Radio @size={{this.size}} @name="plan" @value="a" @label="A" />`,
      );
      assert.dom('[data-test-wu-radio]').hasClass('wu-radio');
      assert.dom('[data-test-wu-radio]').hasClass(KIT_SIZES[size]);
      assert.dom('[data-test-wu-radio-input]').hasClass('wu-radio-input');
    }

    await render(hbs`<Woven::Radio @name="plan" @value="a" @label="A" />`);
    assertNoKitSize(assert, '[data-test-wu-radio]');
  });

  test('toggle maps xs, sm and lg to the kit sizes', async function (assert) {
    for (const size of SIZES) {
      this.set('size', size);
      await render(hbs`<Woven::Toggle @size={{this.size}} aria-label="On" />`);
      assert.dom('[data-test-wu-toggle]').hasClass(KIT_SIZES[size]);
    }

    await render(hbs`<Woven::Toggle aria-label="On" />`);
    assertNoKitSize(assert, '[data-test-wu-toggle]');
    assert.dom('[data-test-wu-toggle-input]').hasAttribute('role', 'switch');
  });

  test('select maps xs, sm and lg to the kit sizes', async function (assert) {
    for (const size of SIZES) {
      this.set('size', size);
      await render(hbs`<Woven::Select @size={{this.size}} @options={{array "A" "B"}} />`);
      assert.dom('[data-test-wu-select]').hasClass('wu-select');
      assert.dom('[data-test-wu-select]').doesNotHaveClass('wu-input');
      assert.dom('[data-test-wu-select]').hasClass(KIT_SIZES[size]);
    }

    await render(hbs`<Woven::Select @options={{array "A" "B"}} />`);
    assertNoKitSize(assert, '[data-test-wu-select]');
  });

  test('textarea has no kit sizes and ignores @size', async function (assert) {
    for (const size of SIZES) {
      this.set('size', size);
      await render(hbs`<Woven::Textarea @size={{this.size}} />`);
      assert.dom('[data-test-wu-textarea]').hasClass('wu-textarea');
      assertNoKitSize(assert, '[data-test-wu-textarea]');
    }
  });

  test('input group has no kit sizes; the inner input carries it', async function (assert) {
    for (const size of SIZES) {
      this.set('size', size);
      await render(hbs`
        <Woven::InputGroup @size={{this.size}} @prepend="AED">
          <Woven::Input @size={{this.size}} />
        </Woven::InputGroup>
      `);
      assert.dom('[data-test-wu-input-group]').hasClass('wu-input-group');
      assertNoKitSize(assert, '[data-test-wu-input-group]');
      assert.dom('[data-test-wu-input-group] > .wu-input').hasClass(KIT_SIZES[size]);
      assert.dom('[data-test-wu-input-group-prepend]').hasClass('wu-input-group-text');
    }
  });

  test('tabs ignore @size, the kit has no tab sizes', async function (assert) {
    this.set('tabs', [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]);
    for (const size of SIZES) {
      this.set('size', size);
      await render(hbs`<Woven::Tabs @tabs={{this.tabs}} @size={{this.size}} />`);
      assert.dom('[data-test-wu-tabs]').hasClass('wu-tabs');
      assert.dom('[data-test-wu-tabs]').hasAttribute('class', 'wu-tabs');
    }
  });

  test('pagination accepts @size and keeps @sm as an alias', async function (assert) {
    for (const size of SIZES) {
      this.set('size', size);
      await render(
        hbs`<Woven::Pagination @page={{1}} @perPage={{10}} @total={{40}} @size={{this.size}} />`,
      );
      const kit = size === 'xs' ? 'sm' : size;
      assert.dom('[data-test-wu-pagination]').hasClass(kit);
    }

    await render(
      hbs`<Woven::Pagination @page={{1}} @perPage={{10}} @total={{40}} @sm={{true}} />`,
    );
    assert.dom('[data-test-wu-pagination]').hasClass('sm');

    await render(
      hbs`<Woven::Pagination @page={{1}} @perPage={{10}} @total={{40}} @sm={{true}} @size="lg" />`,
    );
    assert.dom('[data-test-wu-pagination]').hasClass('lg');
    assert.dom('[data-test-wu-pagination]').doesNotHaveClass('sm');

    await render(hbs`<Woven::Pagination @page={{1}} @perPage={{10}} @total={{40}} />`);
    assertNoSize(assert, '[data-test-wu-pagination]');
  });

  test('pagination per-page select stays sm by default and follows xs and lg', async function (assert) {
    this.set('noop', () => {});
    const expected = { xs: 'sm', sm: 'sm', lg: 'lg' };
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
    assert.dom('[data-test-wu-pagination-select]').hasClass('sm');
  });
});
