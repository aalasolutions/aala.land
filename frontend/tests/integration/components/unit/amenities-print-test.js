import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | unit/amenities-print', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders', async function (assert) {
    // Set any properties with this.set('myProperty', 'value');
    // Handle any actions with this.set('myAction', function(val) { ... });

    await render(hbs`<Unit::AmenitiesPrint />`);

    assert.dom().hasText('');

    // Template block usage:
    await render(hbs`
      <Unit::AmenitiesPrint>
        template block text
      </Unit::AmenitiesPrint>
    `);

    assert.dom().hasText('template block text');
  });
});
