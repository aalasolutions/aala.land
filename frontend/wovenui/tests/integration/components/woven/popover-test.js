import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, click } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | woven/popover', function (hooks) {
  setupRenderingTest(hooks);

  test('renders the CSS kit popover parts on the layer', async function (assert) {
    await render(hbs`
      <Woven::Popover @title="Confirm">
        <:trigger as |toggle|>
          <button type="button" data-test-open {{on "click" toggle}}>Open</button>
        </:trigger>
        <:body>Body text</:body>
        <:footer><button type="button">OK</button></:footer>
      </Woven::Popover>
    `);

    await click('[data-test-open]');
    const panel = document.querySelector('[data-test-wu-popover-content]');
    assert.dom(panel).hasClass('wu-popover').hasAttribute('role', 'dialog');
    assert.ok(panel.closest('.wu-layer'), 'hosted on the layer');
    assert.dom(panel).hasAttribute('popover', 'manual');
    assert.true(
      panel.matches(':popover-open'),
      'shown so kit open styles apply',
    );
    const title = panel.querySelector('[data-test-wu-popover-title]');
    assert.dom(title).hasClass('wu-popover-title');
    assert
      .dom(panel.querySelector('[data-test-wu-popover-footer]'))
      .hasClass('wu-popover-actions');
    assert.strictEqual(panel.getAttribute('aria-labelledby'), title.id);
  });
});
