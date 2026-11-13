import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, click, settled, waitUntil } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

const ITEMS = [
  { id: 'a', title: 'Alpha', content: 'Alpha body' },
  { id: 'b', title: 'Beta', content: 'Beta body' },
  { id: 'c', title: 'Gamma', content: 'Gamma body', disabled: true },
];

function item(id) {
  return document.querySelector(`[data-test-wu-accordion-item="${id}"]`);
}

// The native toggle event is queued, so wait for it to reach the component.
async function toggle(id, open) {
  await click(`[data-test-wu-accordion-trigger="${id}"]`);
  await waitUntil(() => item(id).open === open);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await settled();
}

module('Integration | Component | woven/accordion', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.set('items', ITEMS);
  });

  test('renders the CSS kit details grammar', async function (assert) {
    await render(hbs`<Woven::Accordion @items={{this.items}} />`);

    assert
      .dom('[data-test-wu-accordion]')
      .hasClass('wu-accordion')
      .hasClass('animated');
    assert.dom('details.wu-accordion-item').exists({ count: 3 });
    assert.dom('details > summary.wu-accordion-trigger').exists({ count: 3 });
    assert.dom('details > .wu-accordion-body').exists({ count: 3 });
    assert.dom('[data-test-wu-accordion-panel="a"]').hasText('Alpha body');
    assert.dom('[class*="is-"]').doesNotExist();
    assert.dom('[class*="__"]').doesNotExist();
    assert
      .dom('[data-test-wu-accordion-trigger="c"]')
      .hasAttribute('aria-disabled', 'true');
    assert
      .dom('[data-test-wu-accordion-trigger="a"]')
      .doesNotHaveAttribute('aria-disabled');
  });

  test('@animated={{false}} drops the animated modifier', async function (assert) {
    await render(
      hbs`<Woven::Accordion @items={{this.items}} @animated={{false}} />`,
    );
    assert
      .dom('[data-test-wu-accordion]')
      .hasClass('wu-accordion')
      .doesNotHaveClass('animated');
  });

  test('@defaultExpanded opens items through the open attribute', async function (assert) {
    await render(
      hbs`<Woven::Accordion @items={{this.items}} @multiple={{true}} @defaultExpanded={{array "a" "b"}} />`,
    );
    assert.dom(item('a')).hasAttribute('open');
    assert.dom(item('b')).hasAttribute('open');
    assert.dom(item('c')).doesNotHaveAttribute('open');
  });

  test('single open: opening one item closes the others', async function (assert) {
    await render(
      hbs`<Woven::Accordion @items={{this.items}} @defaultExpanded="a" />`,
    );
    assert.true(item('a').open);

    await toggle('b', true);
    assert.true(item('b').open, 'b opened');
    assert.false(item('a').open, 'a closed');

    await toggle('b', false);
    assert.false(item('b').open, 'b closed again');
    assert.false(item('a').open, 'a stays closed');
  });

  test('multiple: items open independently', async function (assert) {
    await render(
      hbs`<Woven::Accordion @items={{this.items}} @multiple={{true}} />`,
    );

    await toggle('a', true);
    await toggle('b', true);
    assert.true(item('a').open);
    assert.true(item('b').open);
  });

  test('a disabled item does not open', async function (assert) {
    await render(hbs`<Woven::Accordion @items={{this.items}} />`);

    await click('[data-test-wu-accordion-trigger="c"]');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await settled();
    assert.false(item('c').open);
  });

  test('the block receives the item', async function (assert) {
    await render(hbs`
      <Woven::Accordion @items={{this.items}} @defaultExpanded="a" as |entry|>
        <span data-test-block>{{entry.id}} {{if entry.expanded "open" "closed"}}</span>
      </Woven::Accordion>
    `);
    assert
      .dom('[data-test-wu-accordion-panel="a"] [data-test-block]')
      .hasText('a open');
    assert
      .dom('[data-test-wu-accordion-panel="b"] [data-test-block]')
      .hasText('b closed');
  });
});
